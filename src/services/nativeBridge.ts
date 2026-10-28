export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export type NativeBridgeStatus = 'disconnected' | 'connected' | 'error';

export class JsonRpcError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  public constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}

export interface NativePortLike {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(callback: () => void): void;
    removeListener(callback: () => void): void;
  };
}

export type ConnectNativeFn = (hostName: string) => NativePortLike;

export interface INativeBridge {
  readonly hostName: string;
  readonly status: NativeBridgeStatus;
  connect(): Promise<void>;
  disconnect(): void;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  notify(method: string, params?: Record<string, unknown>): void;
  onNotification(listener: (notification: JsonRpcNotification) => void): () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isRecord(value) || value.jsonrpc !== '2.0') {
    return false;
  }
  return typeof value.id === 'number' || typeof value.id === 'string';
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (!isRecord(value) || value.jsonrpc !== '2.0') {
    return false;
  }
  return value.id === undefined && typeof value.method === 'string';
}

interface PendingRpcCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const DEFAULT_NATIVE_HOST_NAME = 'io.github.kobee1203.source_code_editor';

/**
 * JSON-RPC 2.0 client over `browser.runtime.connectNative` for Approach B (Local Companion Host).
 */
export class JsonRpcNativeBridge implements INativeBridge {
  public readonly hostName: string;
  private currentStatus: NativeBridgeStatus = 'disconnected';
  private port: NativePortLike | null = null;
  private nextRequestId = 1;
  private readonly timeoutMs: number;
  private readonly connectNativeFn: ConnectNativeFn;
  private readonly pendingCalls = new Map<number | string, PendingRpcCall>();
  private readonly notificationListeners = new Set<(notification: JsonRpcNotification) => void>();

  private readonly boundOnMessage = (raw: unknown): void => {
    this.handleIncomingMessage(raw);
  };

  private readonly boundOnDisconnect = (): void => {
    this.handleDisconnect();
  };

  public constructor(options: { connectNative: ConnectNativeFn; hostName?: string; timeoutMs?: number }) {
    this.connectNativeFn = options.connectNative;
    this.hostName = options.hostName ?? DEFAULT_NATIVE_HOST_NAME;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  public get status(): NativeBridgeStatus {
    return this.currentStatus;
  }

  public connect(): Promise<void> {
    if (this.port && this.currentStatus === 'connected') {
      return Promise.resolve();
    }

    try {
      const port = this.connectNativeFn(this.hostName);
      port.onMessage.addListener(this.boundOnMessage);
      port.onDisconnect.addListener(this.boundOnDisconnect);
      this.port = port;
      this.currentStatus = 'connected';
      return Promise.resolve();
    } catch (err) {
      this.currentStatus = 'error';
      return Promise.reject(err instanceof Error ? err : new Error('Failed to connect to native host'));
    }
  }

  public disconnect(): void {
    if (!this.port) {
      this.currentStatus = 'disconnected';
      return;
    }

    const activePort = this.port;
    this.port = null;
    this.currentStatus = 'disconnected';
    activePort.onMessage.removeListener(this.boundOnMessage);
    activePort.onDisconnect.removeListener(this.boundOnDisconnect);
    activePort.disconnect();
    this.rejectAllPending(new JsonRpcError(-32000, 'Native bridge disconnected'));
  }

  public request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.port || this.currentStatus !== 'connected') {
      return Promise.reject(new JsonRpcError(-32001, 'Native bridge is not connected'));
    }

    const id = this.nextRequestId++;
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new JsonRpcError(-32002, `Native RPC request timed out for method "${method}"`));
      }, this.timeoutMs);

      this.pendingCalls.set(id, { resolve, reject, timer });
      this.port?.postMessage(payload);
    });
  }

  public notify(method: string, params?: Record<string, unknown>): void {
    if (!this.port || this.currentStatus !== 'connected') {
      throw new JsonRpcError(-32001, 'Native bridge is not connected');
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    };
    this.port.postMessage(notification);
  }

  public onNotification(listener: (notification: JsonRpcNotification) => void): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  private handleIncomingMessage(raw: unknown): void {
    if (isJsonRpcResponse(raw)) {
      const pending = this.pendingCalls.get(raw.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pendingCalls.delete(raw.id);

      if (raw.error) {
        pending.reject(new JsonRpcError(raw.error.code, raw.error.message, raw.error.data));
      } else {
        pending.resolve(raw.result);
      }
      return;
    }

    if (isJsonRpcNotification(raw)) {
      for (const listener of this.notificationListeners) {
        listener(raw);
      }
    }
  }

  private handleDisconnect(): void {
    this.port = null;
    this.currentStatus = 'disconnected';
    this.rejectAllPending(new JsonRpcError(-32000, 'Native host disconnected unexpectedly'));
  }

  private rejectAllPending(error: JsonRpcError): void {
    for (const [id, pending] of this.pendingCalls.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingCalls.delete(id);
    }
  }
}
