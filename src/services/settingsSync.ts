import { browser } from 'wxt/browser';
import type { KeyValueStorageArea } from '@/services/auth';

export type AutoSaveMode = 'off' | 'afterDelay' | 'onFocusChange';

export type ThemeMode = 'dark' | 'light';

export interface EditorSettings {
  theme: ThemeMode;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  autoSave: AutoSaveMode;
  autoSaveDelayMs: number;
  shallowCloneDepth: number;
}

export const DEFAULT_EDITOR_SETTINGS: Readonly<EditorSettings> = {
  theme: 'dark',
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  autoSave: 'off',
  autoSaveDelayMs: 1000,
  shallowCloneDepth: 1,
};

export interface SyncProfilePayload {
  schemaVersion: 1;
  exportedAt: number;
  settings: EditorSettings;
  installedExtensionIds: string[];
}

export interface ISettingsSyncService {
  getSettings(): Promise<EditorSettings>;
  updateSettings(patch: Partial<EditorSettings>): Promise<EditorSettings>;
  resetSettings(): Promise<EditorSettings>;
  exportProfile(installedExtensionIds?: string[]): Promise<SyncProfilePayload>;
  importProfile(rawPayload: unknown): Promise<SyncProfilePayload>;
}

const SETTINGS_STORAGE_KEY = 'sce.settings.editor';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light';
}

function isAutoSaveMode(value: unknown): value is AutoSaveMode {
  return value === 'off' || value === 'afterDelay' || value === 'onFocusChange';
}

/**
 * Strictly allowlists and clamps `EditorSettings` properties from an untrusted object.
 * Any extraneous keys (such as `token`, `githubToken`, `pat`, `auth`, `secret`) are dropped,
 * guaranteeing that credentials can never leak into `storage.sync` or exported Gists/Snippets.
 */
export function sanitizeEditorSettings(
  raw: unknown,
  fallback: EditorSettings = DEFAULT_EDITOR_SETTINGS,
): EditorSettings {
  if (!isRecord(raw)) {
    return { ...fallback };
  }

  const theme = isThemeMode(raw.theme) ? raw.theme : fallback.theme;
  const fontSize =
    typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)
      ? Math.min(36, Math.max(10, Math.round(raw.fontSize)))
      : fallback.fontSize;
  const tabSize =
    typeof raw.tabSize === 'number' && Number.isFinite(raw.tabSize)
      ? Math.min(8, Math.max(1, Math.round(raw.tabSize)))
      : fallback.tabSize;
  const wordWrap = typeof raw.wordWrap === 'boolean' ? raw.wordWrap : fallback.wordWrap;
  const autoSave = isAutoSaveMode(raw.autoSave) ? raw.autoSave : fallback.autoSave;
  const autoSaveDelayMs =
    typeof raw.autoSaveDelayMs === 'number' && Number.isFinite(raw.autoSaveDelayMs)
      ? Math.min(60_000, Math.max(200, Math.round(raw.autoSaveDelayMs)))
      : fallback.autoSaveDelayMs;
  const shallowCloneDepth =
    typeof raw.shallowCloneDepth === 'number' && Number.isFinite(raw.shallowCloneDepth)
      ? Math.min(1000, Math.max(1, Math.round(raw.shallowCloneDepth)))
      : fallback.shallowCloneDepth;

  return {
    theme,
    fontSize,
    tabSize,
    wordWrap,
    autoSave,
    autoSaveDelayMs,
    shallowCloneDepth,
  };
}

export class BrowserSettingsSyncService implements ISettingsSyncService {
  private readonly storage: KeyValueStorageArea;

  public constructor(storage?: KeyValueStorageArea) {
    this.storage = storage ?? browser.storage.local;
  }

  public async getSettings(): Promise<EditorSettings> {
    const stored = await this.storage.get(SETTINGS_STORAGE_KEY);
    return sanitizeEditorSettings(stored[SETTINGS_STORAGE_KEY], DEFAULT_EDITOR_SETTINGS);
  }

  public async updateSettings(patch: Partial<EditorSettings>): Promise<EditorSettings> {
    const current = await this.getSettings();
    const merged: Record<string, unknown> = {
      ...current,
      ...patch,
    };
    const next = sanitizeEditorSettings(merged, current);
    await this.storage.set({
      [SETTINGS_STORAGE_KEY]: next,
    });
    return next;
  }

  public async resetSettings(): Promise<EditorSettings> {
    const reset = { ...DEFAULT_EDITOR_SETTINGS };
    await this.storage.set({
      [SETTINGS_STORAGE_KEY]: reset,
    });
    return reset;
  }

  public async exportProfile(installedExtensionIds: string[] = []): Promise<SyncProfilePayload> {
    const settings = await this.getSettings();
    const cleanExtensionIds = installedExtensionIds
      .filter((id) => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim());

    return {
      schemaVersion: 1,
      exportedAt: Date.now(),
      settings,
      installedExtensionIds: cleanExtensionIds,
    };
  }

  public async importProfile(rawPayload: unknown): Promise<SyncProfilePayload> {
    if (!isRecord(rawPayload) || rawPayload.schemaVersion !== 1 || !isRecord(rawPayload.settings)) {
      throw new Error('Invalid settings sync profile payload');
    }

    const sanitizedSettings = sanitizeEditorSettings(rawPayload.settings, DEFAULT_EDITOR_SETTINGS);
    await this.storage.set({
      [SETTINGS_STORAGE_KEY]: sanitizedSettings,
    });

    const installedExtensionIds: string[] = [];
    if (Array.isArray(rawPayload.installedExtensionIds)) {
      for (const item of rawPayload.installedExtensionIds) {
        if (typeof item === 'string' && item.trim().length > 0) {
          installedExtensionIds.push(item.trim());
        }
      }
    }

    return {
      schemaVersion: 1,
      exportedAt: typeof rawPayload.exportedAt === 'number' ? rawPayload.exportedAt : Date.now(),
      settings: sanitizedSettings,
      installedExtensionIds,
    };
  }
}
