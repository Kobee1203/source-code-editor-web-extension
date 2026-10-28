import { describe, expect, it } from 'vitest';
import {
  DeclarativeExtensionCatalogService,
  ExtensionCatalogError,
  type ExtensionMetadata,
} from '@/services/extensionCatalog';

const DECLARATIVE_THEME_EXT: ExtensionMetadata = {
  id: 'dracula-theme.theme-dracula',
  namespace: 'dracula-theme',
  name: 'theme-dracula',
  displayName: 'Dracula Official',
  version: '2.25.1',
  description: 'Official Dracula color theme for VS Code.',
  builtIn: false,
  contributions: ['themes'],
};

const RUNTIME_CODE_EXT: ExtensionMetadata = {
  id: 'ms-python.python',
  namespace: 'ms-python',
  name: 'python',
  displayName: 'Python Runtime Extension',
  version: '2026.1.0',
  description: 'Full Python runtime extension requiring Node execution.',
  builtIn: false,
  contributions: ['languages', 'runtime'],
};

const EMPTY_CONTRIBUTION_EXT: ExtensionMetadata = {
  id: 'acme.empty',
  namespace: 'acme',
  name: 'empty',
  displayName: 'Empty Extension',
  version: '0.0.1',
  description: 'No contributions.',
  builtIn: false,
  contributions: [],
};

describe('services/extensionCatalog', () => {
  it('constructs ExtensionCatalogError with code and message', () => {
    const err = new ExtensionCatalogError('EXT_NOT_FOUND', 'Missing extension');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ExtensionCatalogError');
    expect(err.code).toBe('EXT_NOT_FOUND');
    expect(err.message).toBe('Missing extension');
  });

  it('pre-installs built-in language and theme extensions and searches catalog', async () => {
    const catalog = new DeclarativeExtensionCatalogService({
      initialRemoteCatalog: [DECLARATIVE_THEME_EXT, RUNTIME_CODE_EXT],
    });

    expect(catalog.runtimeMode).toBe('standalone-web');

    const installed = await catalog.listInstalled();
    expect(installed.length).toBeGreaterThanOrEqual(3);
    expect(installed.every((ext) => ext.builtIn && ext.enabled)).toBe(true);

    const allResults = await catalog.searchCatalog('');
    expect(allResults).toHaveLength(installed.length + 2);

    const draculaResults = await catalog.searchCatalog('dracula');
    expect(draculaResults).toEqual([DECLARATIVE_THEME_EXT]);
  });

  it('installs declarative extensions and blocks runtime code extensions in standalone-web mode', async () => {
    const catalog = new DeclarativeExtensionCatalogService();

    expect(catalog.isInstallAllowed(DECLARATIVE_THEME_EXT)).toBe(true);
    expect(catalog.isInstallAllowed(RUNTIME_CODE_EXT)).toBe(false);
    expect(catalog.isInstallAllowed(EMPTY_CONTRIBUTION_EXT)).toBe(false);

    const installedDracula = await catalog.install(DECLARATIVE_THEME_EXT);
    expect(installedDracula.id).toBe(DECLARATIVE_THEME_EXT.id);
    expect(installedDracula.enabled).toBe(true);

    await expect(catalog.install(RUNTIME_CODE_EXT)).rejects.toMatchObject({
      code: 'EXT_ARBITRARY_CODE_FORBIDDEN',
    });
  });

  it('allows runtime extensions when running in local-companion mode', async () => {
    const companionCatalog = new DeclarativeExtensionCatalogService({
      runtimeMode: 'local-companion',
    });

    expect(companionCatalog.isInstallAllowed(RUNTIME_CODE_EXT)).toBe(true);
    const installed = await companionCatalog.install(RUNTIME_CODE_EXT);
    expect(installed.id).toBe(RUNTIME_CODE_EXT.id);
  });

  it('enables, disables, and uninstalls extensions while protecting built-in extensions', async () => {
    const catalog = new DeclarativeExtensionCatalogService();
    await catalog.install(DECLARATIVE_THEME_EXT);

    const disabled = await catalog.setEnabled(DECLARATIVE_THEME_EXT.id, false);
    expect(disabled.enabled).toBe(false);

    const reEnabled = await catalog.setEnabled(DECLARATIVE_THEME_EXT.id, true);
    expect(reEnabled.enabled).toBe(true);

    await expect(catalog.setEnabled('unknown.ext', false)).rejects.toMatchObject({
      code: 'EXT_NOT_FOUND',
    });

    await expect(catalog.uninstall('vscode.typescript-language-features-builtin')).rejects.toMatchObject({
      code: 'EXT_BUILTIN_IMMUTABLE',
    });

    await expect(catalog.uninstall('unknown.ext')).rejects.toMatchObject({
      code: 'EXT_NOT_FOUND',
    });

    await catalog.uninstall(DECLARATIVE_THEME_EXT.id);
    const remaining = await catalog.listInstalled();
    expect(remaining.some((ext) => ext.id === DECLARATIVE_THEME_EXT.id)).toBe(false);
  });
});
