import { describe, expect, it } from 'vitest';
import type { KeyValueStorageArea } from '@/services/auth';
import { BrowserSettingsSyncService, DEFAULT_EDITOR_SETTINGS, sanitizeEditorSettings } from '@/services/settingsSync';

function createMemoryStorage(): KeyValueStorageArea & { rawStore: Record<string, unknown> } {
  const rawStore: Record<string, unknown> = {};
  return {
    rawStore,
    get: (keys) => {
      if (typeof keys === 'string') {
        return Promise.resolve(keys in rawStore ? { [keys]: rawStore[keys] } : {});
      }
      return Promise.resolve({ ...rawStore });
    },
    set: (items) => {
      for (const [k, v] of Object.entries(items)) {
        rawStore[k] = v;
      }
      return Promise.resolve();
    },
  };
}

describe('services/settingsSync', () => {
  describe('sanitizeEditorSettings', () => {
    it('returns default settings for non-record values', () => {
      expect(sanitizeEditorSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS);
      expect(sanitizeEditorSettings(undefined)).toEqual(DEFAULT_EDITOR_SETTINGS);
      expect(sanitizeEditorSettings('invalid')).toEqual(DEFAULT_EDITOR_SETTINGS);
      expect(sanitizeEditorSettings([1, 2, 3])).toEqual(DEFAULT_EDITOR_SETTINGS);
    });

    it('clamps numeric bounds and strips any injected secret or token fields', () => {
      const untrustedPayload = {
        theme: 'light',
        fontSize: 999,
        tabSize: 0,
        wordWrap: true,
        autoSave: 'afterDelay',
        autoSaveDelayMs: 50,
        launchMode: 'popup',
        shallowCloneDepth: 5000,
        token: 'ghp_super_secret_token',
        githubToken: 'ghp_another_secret',
        pat: 'glpat_secret',
        auth: { token: 'leaked' },
      };

      const sanitized = sanitizeEditorSettings(untrustedPayload);
      expect(sanitized).toEqual({
        theme: 'light',
        fontSize: 36,
        tabSize: 1,
        wordWrap: true,
        autoSave: 'afterDelay',
        autoSaveDelayMs: 200,
        launchMode: 'popup',
        shallowCloneDepth: 1000,
      });

      const keys = Object.keys(sanitized);
      expect(keys).not.toContain('token');
      expect(keys).not.toContain('githubToken');
      expect(keys).not.toContain('pat');
      expect(keys).not.toContain('auth');
    });
  });

  describe('BrowserSettingsSyncService', () => {
    it('reads, updates, and resets settings while syncing launchMode key', async () => {
      const storage = createMemoryStorage();
      const service = new BrowserSettingsSyncService(storage);

      expect(await service.getSettings()).toEqual(DEFAULT_EDITOR_SETTINGS);

      const updated = await service.updateSettings({
        theme: 'light',
        fontSize: 18,
        launchMode: 'popup',
      });

      expect(updated.theme).toBe('light');
      expect(updated.fontSize).toBe(18);
      expect(updated.launchMode).toBe('popup');
      expect(storage.rawStore.launchMode).toBe('popup');

      const reset = await service.resetSettings();
      expect(reset).toEqual(DEFAULT_EDITOR_SETTINGS);
      expect(storage.rawStore.launchMode).toBe('tab');
    });

    it('exports and imports profile payloads while stripping any injected credential fields', async () => {
      const storage = createMemoryStorage();
      const service = new BrowserSettingsSyncService(storage);

      storage.rawStore['sce.settings.editor'] = {
        ...DEFAULT_EDITOR_SETTINGS,
        theme: 'light',
        token: 'ghp_must_never_leak',
      };

      const exported = await service.exportProfile(['  dracula-theme.theme-dracula ', '']);
      expect(exported.schemaVersion).toBe(1);
      expect(exported.settings.theme).toBe('light');
      expect('token' in exported.settings).toBe(false);
      expect(exported.installedExtensionIds).toEqual(['dracula-theme.theme-dracula']);

      await expect(service.importProfile(null)).rejects.toThrow('Invalid settings sync profile payload');
      await expect(service.importProfile({ schemaVersion: 2, settings: {} })).rejects.toThrow(
        'Invalid settings sync profile payload',
      );

      const imported = await service.importProfile({
        schemaVersion: 1,
        exportedAt: 1700000000000,
        settings: {
          theme: 'light',
          fontSize: 16,
          launchMode: 'popup',
          secretToken: 'ghp_injected',
        },
        installedExtensionIds: ['ext.one', '  ', 42, 'ext.two'],
      });

      expect(imported.exportedAt).toBe(1700000000000);
      expect(imported.settings.launchMode).toBe('popup');
      expect('secretToken' in imported.settings).toBe(false);
      expect(imported.installedExtensionIds).toEqual(['ext.one', 'ext.two']);
      expect(storage.rawStore.launchMode).toBe('popup');
    });
  });
});
