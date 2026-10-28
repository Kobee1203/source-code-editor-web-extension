import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NATIVE_HOST_NAME,
  JsonRpcError,
  JsonRpcNativeBridge,
  type JsonRpcNotification,
  type NativePortLike,
} from '@/services/nativeBridge';

interface MockNativePortController {
  port: NativePortLike;
  sentMessages: unknown[];
  emitMessage: (msg: unknown) => void;
  emitDisconnect: () => void;
}

function createMockNativePort(): MockNativePortController {
  const messageListeners = new Set<(message: unknown) => void>();
  const disconnectListeners = new Set<() => void>();
  const sentMessages: unknown[] = [];

  const port: NativePortLike = {
    postMessage: vi.fn((msg: unknown) => {
      sentMessages.push(msg);
    }),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((cb: (message: unknown) => void) => {
        messageListeners.add(cb);
      }),
      removeListener: vi.fn((cb: (message: unknown) => void) => {
        messageListeners.delete(cb);
      }),
    },
    onDisconnect: {
      addListener: vi.fn((cb: () => void) => {
        disconnectListeners.add(cb);
      }),
      removeListener: vi.fn((cb: () => void) => {
        disconnectListeners.delete(cb);
      }),
    },
  };

  return {
    port,
    sentMessages,
    emitMessage: (msg: unknown) => {
      for (const listener of messageListeners) {
        listener(msg);
      }
    },
    emitDisconnect: () => {
      for (const listener of disconnectListeners) {
        listener();
      }
    },
  };
}

describe('services/nativeBridge', () => {
  it('connects, sends correlated JSON-RPC requests, and resolves responses', async () => {
    const controller = createMockNativePort();
    const connectNative = vi.fn(() => controller.port);
    const bridge = new JsonRpcNativeBridge({ connectNative });

    expect(bridge.hostName).toBe(DEFAULT_NATIVE_HOST_NAME);
    expect(bridge.status).toBe('disconnected');

    await expect(bridge.request('fs.ping')).rejects.toMatchObject({
      code: -32001,
    });
    expect(() => bridge.notify('fs.event')).toThrow(JsonRpcError);

    await bridge.connect();
    await bridge.connect();
    expect(connectNative).toHaveBeenCalledTimes(1);
    expect(bridge.status).toBe('connected');

    const pendingResult = bridge.request('fs.readFile', { path: '/hello.ts' });
    expect(controller.sentMessages[0]).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'fs.readFile',
      params: { path: '/hello.ts' },
    });

    controller.emitMessage({
      jsonrpc: '2.0',
      id: 999,
      result: 'ignored-unmatched-id',
    });

    controller.emitMessage({
      jsonrpc: '2.0',
      id: 1,
      result: { content: 'export default 1;' },
    });

    await expect(pendingResult).resolves.toEqual({ content: 'export default 1;' });
  });

  it('rejects with JsonRpcError when native host returns an RPC error object', async () => {
    const controller = createMockNativePort();
    const bridge = new JsonRpcNativeBridge({
      connectNative: () => controller.port,
    });

    await bridge.connect();
    const pending = bridge.request('git.push');

    controller.emitMessage({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32601,
        message: 'Method not found',
        data: { method: 'git.push' },
      },
    });

    await expect(pending).rejects.toMatchObject({
      name: 'JsonRpcError',
      code: -32601,
      message: 'Method not found',
      data: { method: 'git.push' },
    });
  });

  it('times out pending requests when host does not respond within timeoutMs', async () => {
    const controller = createMockNativePort();
    const bridge = new JsonRpcNativeBridge({
      connectNative: () => controller.port,
      timeoutMs: 15,
    });

    await bridge.connect();
    await expect(bridge.request('terminal.spawn')).rejects.toMatchObject({
      code: -32002,
    });
  });

  it('dispatches and unsubscribes JSON-RPC notifications and sends outgoing notifications', async () => {
    const controller = createMockNativePort();
    const bridge = new JsonRpcNativeBridge({
      connectNative: () => controller.port,
    });

    await bridge.connect();
    bridge.notify('workspace.opened', { root: '/repo' });
    expect(controller.sentMessages[0]).toEqual({
      jsonrpc: '2.0',
      method: 'workspace.opened',
      params: { root: '/repo' },
    });

    const received: JsonRpcNotification[] = [];
    const unsubscribe = bridge.onNotification((notification) => {
      received.push(notification);
    });

    controller.emitMessage({
      jsonrpc: '2.0',
      method: 'fs.fileChanged',
      params: { path: '/repo/index.ts' },
    });

    unsubscribe();

    controller.emitMessage({
      jsonrpc: '2.0',
      method: 'fs.fileChanged',
      params: { path: '/repo/ignored.ts' },
    });

    expect(received).toEqual([
      {
        jsonrpc: '2.0',
        method: 'fs.fileChanged',
        params: { path: '/repo/index.ts' },
      },
    ]);
  });

  it('handles connect failure, manual disconnect, and unexpected port disconnect', async () => {
    const failingBridge = new JsonRpcNativeBridge({
      connectNative: () => {
        throw new Error('Native host binary not found');
      },
    });

    await expect(failingBridge.connect()).rejects.toThrow('Native host binary not found');
    expect(failingBridge.status).toBe('error');
    failingBridge.disconnect();
    expect(failingBridge.status).toBe('disconnected');

    const controller = createMockNativePort();
    const bridge = new JsonRpcNativeBridge({
      connectNative: () => controller.port,
    });
    await bridge.connect();

    const inFlight = bridge.request('fs.stat', { path: '/' });
    controller.emitDisconnect();

    expect(bridge.status).toBe('disconnected');
    await expect(inFlight).rejects.toMatchObject({
      code: -32000,
    });

    await bridge.connect();
    const secondInFlight = bridge.request('fs.stat', { path: '/src' });
    bridge.disconnect();
    expect(bridge.status).toBe('disconnected');
    await expect(secondInFlight).rejects.toMatchObject({
      code: -32000,
    });
  });
});
