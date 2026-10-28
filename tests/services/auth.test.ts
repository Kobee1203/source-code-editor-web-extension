import { mockBrowser } from '@@/tests/setup';
import { describe, expect, it } from 'vitest';
import { type AuthStorageBackend, BrowserLocalAuthService, type KeyValueStorageArea } from '@/services/auth';

function createInMemoryStorageArea(): KeyValueStorageArea {
  const store: Record<string, unknown> = {};
  return {
    get: (keys) => {
      if (typeof keys === 'string') {
        return Promise.resolve(keys in store ? { [keys]: store[keys] } : {});
      }
      return Promise.resolve({ ...store });
    },
    set: (items) => {
      for (const [k, v] of Object.entries(items)) {
        store[k] = v;
      }
      return Promise.resolve();
    },
  };
}

function createAuthStorageBackend(): AuthStorageBackend {
  return {
    local: createInMemoryStorageArea(),
    session: createInMemoryStorageArea(),
  };
}

describe('services/auth', () => {
  it('saves, reads, and revokes tokens in local and session storage while never touching storage.sync', async () => {
    const backend = createAuthStorageBackend();
    const auth = new BrowserLocalAuthService(backend);

    await expect(auth.saveToken('github', '   ')).rejects.toThrow('Authentication token cannot be empty');

    const initialStatus = await auth.getStatus('github');
    expect(initialStatus).toEqual({
      provider: 'github',
      authenticated: false,
      scopes: [],
      storageScope: 'none',
    });
    expect(await auth.getToken('github')).toBeNull();

    const localStatus = await auth.saveToken('github', 'ghp_local_secret_123', {
      username: 'octocat',
      scopes: ['repo', 'read:user'],
      rememberMe: true,
    });

    expect(localStatus).toEqual({
      provider: 'github',
      authenticated: true,
      username: 'octocat',
      scopes: ['repo', 'read:user'],
      storageScope: 'local',
    });
    expect(await auth.getToken('github')).toBe('ghp_local_secret_123');

    const sessionStatus = await auth.saveToken('github', 'ghp_session_secret_456', {
      username: 'octocat',
      scopes: ['repo'],
      rememberMe: false,
    });
    expect(sessionStatus.storageScope).toBe('session');
    expect(await auth.getToken('github')).toBe('ghp_session_secret_456');

    const localRaw = await backend.local.get('sce.auth.tokens');
    expect(localRaw['sce.auth.tokens']).toEqual({});

    await auth.saveToken('gitlab', 'glpat_token_789', {
      username: 'gitlab-user',
      rememberMe: true,
    });
    expect(await auth.getToken('gitlab')).toBe('glpat_token_789');

    await auth.revokeToken('github');
    expect(await auth.getToken('github')).toBeNull();
    expect(await auth.getStatus('github')).toEqual({
      provider: 'github',
      authenticated: false,
      scopes: [],
      storageScope: 'none',
    });
    expect(await auth.getToken('gitlab')).toBe('glpat_token_789');

    await auth.revokeToken('gitlab');
    expect(await auth.getToken('gitlab')).toBeNull();

    expect(mockBrowser.storage.sync.get).not.toHaveBeenCalled();
    expect(mockBrowser.storage.sync.set).not.toHaveBeenCalled();
  });

  it('uses browser.storage.local and browser.storage.session by default and ignores malformed storage records', async () => {
    mockBrowser.storage.local.get.mockResolvedValue({
      'sce.auth.tokens': {
        github: { token: 12345 },
        gitlab: { token: 'glpat_valid', scopes: ['api', 99], username: 'gl-user' },
      },
    });

    const auth = new BrowserLocalAuthService();

    expect(await auth.getToken('github')).toBeNull();
    expect(await auth.getToken('gitlab')).toBe('glpat_valid');

    const gitlabStatus = await auth.getStatus('gitlab');
    expect(gitlabStatus).toEqual({
      provider: 'gitlab',
      authenticated: true,
      username: 'gl-user',
      scopes: ['api'],
      storageScope: 'local',
    });

    expect(mockBrowser.storage.sync.get).not.toHaveBeenCalled();
    expect(mockBrowser.storage.sync.set).not.toHaveBeenCalled();
  });
});
