import { browser } from 'wxt/browser';

export type GitHostProvider = 'github' | 'gitlab';

export interface AuthTokenRecord {
  provider: GitHostProvider;
  token: string;
  username?: string;
  scopes: string[];
  updatedAt: number;
}

export interface AuthStatus {
  provider: GitHostProvider;
  authenticated: boolean;
  username?: string;
  scopes: string[];
  storageScope: 'local' | 'session' | 'none';
}

export interface KeyValueStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface AuthStorageBackend {
  local: KeyValueStorageArea;
  session: KeyValueStorageArea;
}

export interface IAuthService {
  saveToken(
    provider: GitHostProvider,
    token: string,
    options?: { username?: string; scopes?: string[]; rememberMe?: boolean },
  ): Promise<AuthStatus>;
  getToken(provider: GitHostProvider): Promise<string | null>;
  getStatus(provider: GitHostProvider): Promise<AuthStatus>;
  revokeToken(provider: GitHostProvider): Promise<void>;
}

const AUTH_STORAGE_KEY = 'sce.auth.tokens';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTokenRecord(provider: GitHostProvider, raw: unknown): AuthTokenRecord | null {
  if (!isRecord(raw) || typeof raw.token !== 'string' || !raw.token.trim()) {
    return null;
  }
  const scopes: string[] = [];
  if (Array.isArray(raw.scopes)) {
    for (const item of raw.scopes) {
      if (typeof item === 'string') {
        scopes.push(item);
      }
    }
  }
  return {
    provider,
    token: raw.token,
    username: typeof raw.username === 'string' ? raw.username : undefined,
    scopes,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

/**
 * Stores GitHub and GitLab OAuth/PAT credentials strictly in `browser.storage.local` or `browser.storage.session`.
 * Never touches `browser.storage.sync` to prevent accidental credential synchronization.
 */
export class BrowserLocalAuthService implements IAuthService {
  private readonly storage: AuthStorageBackend;

  public constructor(storage?: AuthStorageBackend) {
    this.storage = storage ?? {
      local: browser.storage.local,
      session: browser.storage.session,
    };
  }

  public async saveToken(
    provider: GitHostProvider,
    token: string,
    options?: { username?: string; scopes?: string[]; rememberMe?: boolean },
  ): Promise<AuthStatus> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error('Authentication token cannot be empty');
    }

    const rememberMe = options?.rememberMe ?? true;
    const record: AuthTokenRecord = {
      provider,
      token: trimmed,
      username: options?.username?.trim() || undefined,
      scopes: options?.scopes ?? ['repo'],
      updatedAt: Date.now(),
    };

    const targetArea = rememberMe ? this.storage.local : this.storage.session;
    const otherArea = rememberMe ? this.storage.session : this.storage.local;

    const currentTargetMap = await this.readTokenMap(targetArea);
    currentTargetMap[provider] = record;
    await targetArea.set({ [AUTH_STORAGE_KEY]: currentTargetMap });

    const currentOtherMap = await this.readTokenMap(otherArea);
    if (provider in currentOtherMap) {
      delete currentOtherMap[provider];
      await otherArea.set({ [AUTH_STORAGE_KEY]: currentOtherMap });
    }

    return {
      provider,
      authenticated: true,
      username: record.username,
      scopes: record.scopes,
      storageScope: rememberMe ? 'local' : 'session',
    };
  }

  public async getToken(provider: GitHostProvider): Promise<string | null> {
    const sessionMap = await this.readTokenMap(this.storage.session);
    const sessionRecord = sessionMap[provider];
    if (sessionRecord) {
      return sessionRecord.token;
    }

    const localMap = await this.readTokenMap(this.storage.local);
    const localRecord = localMap[provider];
    return localRecord ? localRecord.token : null;
  }

  public async getStatus(provider: GitHostProvider): Promise<AuthStatus> {
    const sessionMap = await this.readTokenMap(this.storage.session);
    const sessionRecord = sessionMap[provider];
    if (sessionRecord) {
      return {
        provider,
        authenticated: true,
        username: sessionRecord.username,
        scopes: sessionRecord.scopes,
        storageScope: 'session',
      };
    }

    const localMap = await this.readTokenMap(this.storage.local);
    const localRecord = localMap[provider];
    if (localRecord) {
      return {
        provider,
        authenticated: true,
        username: localRecord.username,
        scopes: localRecord.scopes,
        storageScope: 'local',
      };
    }

    return {
      provider,
      authenticated: false,
      scopes: [],
      storageScope: 'none',
    };
  }

  public async revokeToken(provider: GitHostProvider): Promise<void> {
    const sessionMap = await this.readTokenMap(this.storage.session);
    if (provider in sessionMap) {
      delete sessionMap[provider];
      await this.storage.session.set({ [AUTH_STORAGE_KEY]: sessionMap });
    }

    const localMap = await this.readTokenMap(this.storage.local);
    if (provider in localMap) {
      delete localMap[provider];
      await this.storage.local.set({ [AUTH_STORAGE_KEY]: localMap });
    }
  }

  private async readTokenMap(area: KeyValueStorageArea): Promise<Partial<Record<GitHostProvider, AuthTokenRecord>>> {
    const stored = await area.get(AUTH_STORAGE_KEY);
    const rawMap = stored[AUTH_STORAGE_KEY];
    if (!isRecord(rawMap)) {
      return {};
    }

    const result: Partial<Record<GitHostProvider, AuthTokenRecord>> = {};
    const githubRecord = parseTokenRecord('github', rawMap.github);
    if (githubRecord) {
      result.github = githubRecord;
    }
    const gitlabRecord = parseTokenRecord('gitlab', rawMap.gitlab);
    if (gitlabRecord) {
      result.gitlab = gitlabRecord;
    }
    return result;
  }
}
