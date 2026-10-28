import type { RuntimeMode } from '@/types/messages';

export type ExtensionContributionKind =
  'themes' | 'iconThemes' | 'grammars' | 'snippets' | 'keybindings' | 'languages' | 'runtime';

export interface ExtensionMetadata {
  id: string;
  namespace: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  builtIn: boolean;
  contributions: ExtensionContributionKind[];
  downloadUrl?: string;
}

export interface InstalledExtension extends ExtensionMetadata {
  enabled: boolean;
  installedAt: number;
}

export class ExtensionCatalogError extends Error {
  public readonly code: 'EXT_ARBITRARY_CODE_FORBIDDEN' | 'EXT_NOT_FOUND' | 'EXT_BUILTIN_IMMUTABLE';

  public constructor(
    code: 'EXT_ARBITRARY_CODE_FORBIDDEN' | 'EXT_NOT_FOUND' | 'EXT_BUILTIN_IMMUTABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ExtensionCatalogError';
    this.code = code;
  }
}

export interface IExtensionCatalogService {
  readonly runtimeMode: RuntimeMode;
  listInstalled(): Promise<InstalledExtension[]>;
  searchCatalog(query: string): Promise<ExtensionMetadata[]>;
  isInstallAllowed(metadata: ExtensionMetadata): boolean;
  install(metadata: ExtensionMetadata): Promise<InstalledExtension>;
  uninstall(extensionId: string): Promise<void>;
  setEnabled(extensionId: string, enabled: boolean): Promise<InstalledExtension>;
}

const BUILTIN_EXTENSIONS: ReadonlyArray<ExtensionMetadata> = [
  {
    id: 'vscode.typescript-language-features-builtin',
    namespace: 'vscode',
    name: 'typescript-language-features-builtin',
    displayName: 'TypeScript & JavaScript Language Essentials',
    version: '1.0.0',
    description: 'Pre-bundled TypeScript and JavaScript grammars, snippets, and worker intelligence.',
    builtIn: true,
    contributions: ['grammars', 'snippets', 'languages'],
  },
  {
    id: 'vscode.html-css-json-builtin',
    namespace: 'vscode',
    name: 'html-css-json-builtin',
    displayName: 'HTML, CSS & JSON Language Essentials',
    version: '1.0.0',
    description: 'Pre-bundled HTML, CSS, and JSON TextMate grammars and language configuration.',
    builtIn: true,
    contributions: ['grammars', 'snippets', 'languages'],
  },
  {
    id: 'vscode.theme-defaults-builtin',
    namespace: 'vscode',
    name: 'theme-defaults-builtin',
    displayName: 'Default Dark+ & Light+ Themes',
    version: '1.0.0',
    description: 'Built-in Dark+ and Light+ color and file icon themes.',
    builtIn: true,
    contributions: ['themes', 'iconThemes'],
  },
];

/**
 * Store-compliant extension catalog service.
 * In `standalone-web` mode, only declarative extensions (`themes`, `iconThemes`, `grammars`, `snippets`, `keybindings`, `languages`)
 * can be installed dynamically from OpenVSX. Extensions requiring arbitrary JS/Node execution (`runtime`) are rejected
 * unless running in `local-companion` mode.
 */
export class DeclarativeExtensionCatalogService implements IExtensionCatalogService {
  public readonly runtimeMode: RuntimeMode;
  private readonly installed = new Map<string, InstalledExtension>();
  private readonly remoteCatalog: ExtensionMetadata[];

  public constructor(options?: { runtimeMode?: RuntimeMode; initialRemoteCatalog?: ExtensionMetadata[] }) {
    this.runtimeMode = options?.runtimeMode ?? 'standalone-web';
    this.remoteCatalog = options?.initialRemoteCatalog ?? [];

    const now = Date.now();
    for (const builtin of BUILTIN_EXTENSIONS) {
      this.installed.set(builtin.id, {
        ...builtin,
        enabled: true,
        installedAt: now,
      });
    }
  }

  public listInstalled(): Promise<InstalledExtension[]> {
    return Promise.resolve(Array.from(this.installed.values()));
  }

  public searchCatalog(query: string): Promise<ExtensionMetadata[]> {
    const normalized = query.trim().toLowerCase();
    const combined = [...BUILTIN_EXTENSIONS, ...this.remoteCatalog];
    if (!normalized) {
      return Promise.resolve(combined);
    }

    const filtered = combined.filter(
      (ext) =>
        ext.id.toLowerCase().includes(normalized) ||
        ext.displayName.toLowerCase().includes(normalized) ||
        ext.description.toLowerCase().includes(normalized),
    );
    return Promise.resolve(filtered);
  }

  public isInstallAllowed(metadata: ExtensionMetadata): boolean {
    if (metadata.contributions.length === 0) {
      return false;
    }
    if (this.runtimeMode === 'standalone-web' && metadata.contributions.includes('runtime')) {
      return false;
    }
    return true;
  }

  public install(metadata: ExtensionMetadata): Promise<InstalledExtension> {
    if (!this.isInstallAllowed(metadata)) {
      return Promise.reject(
        new ExtensionCatalogError(
          'EXT_ARBITRARY_CODE_FORBIDDEN',
          `Extension "${metadata.id}" requires runtime code execution and cannot be installed in standalone-web mode.`,
        ),
      );
    }

    const record: InstalledExtension = {
      ...metadata,
      enabled: true,
      installedAt: Date.now(),
    };
    this.installed.set(metadata.id, record);
    return Promise.resolve(record);
  }

  public uninstall(extensionId: string): Promise<void> {
    const existing = this.installed.get(extensionId);
    if (!existing) {
      return Promise.reject(new ExtensionCatalogError('EXT_NOT_FOUND', `Extension not installed: ${extensionId}`));
    }
    if (existing.builtIn) {
      return Promise.reject(
        new ExtensionCatalogError('EXT_BUILTIN_IMMUTABLE', `Cannot uninstall built-in extension: ${extensionId}`),
      );
    }
    this.installed.delete(extensionId);
    return Promise.resolve();
  }

  public setEnabled(extensionId: string, enabled: boolean): Promise<InstalledExtension> {
    const existing = this.installed.get(extensionId);
    if (!existing) {
      return Promise.reject(new ExtensionCatalogError('EXT_NOT_FOUND', `Extension not installed: ${extensionId}`));
    }
    const updated: InstalledExtension = {
      ...existing,
      enabled,
    };
    this.installed.set(extensionId, updated);
    return Promise.resolve(updated);
  }
}
