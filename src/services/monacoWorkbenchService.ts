import { browser } from 'wxt/browser';
import { FileAccess } from '@codingame/monaco-vscode-api/vscode/vs/base/common/network';
import { URI } from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';

export type SupportedLanguagePackLocale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'pt-br' | 'zh-hans';

export interface WorkbenchMountHandle {
  dispose(): void;
}

export interface IMonacoEngineAdapter {
  initialize(locale: SupportedLanguagePackLocale, container?: HTMLElement): Promise<void>;
  mountWorkbench(container: HTMLElement): Promise<WorkbenchMountHandle>;
}

export interface IMonacoWorkbenchService {
  isInitialized(): boolean;
  initializeServices(container?: HTMLElement): Promise<void>;
  mountWorkbench(container: HTMLElement): Promise<WorkbenchMountHandle>;
}

export function resolveLanguagePackLocale(rawLocale: string): SupportedLanguagePackLocale {
  const normalized = rawLocale.trim().toLowerCase().replace(/_/g, '-');
  if (normalized.startsWith('de')) {
    return 'de';
  }
  if (normalized.startsWith('es')) {
    return 'es';
  }
  if (normalized.startsWith('fr')) {
    return 'fr';
  }
  if (normalized.startsWith('it')) {
    return 'it';
  }
  if (normalized.startsWith('ja')) {
    return 'ja';
  }
  if (normalized.startsWith('pt')) {
    return 'pt-br';
  }
  if (normalized.startsWith('zh')) {
    return 'zh-hans';
  }
  return 'en';
}

async function loadLanguagePack(locale: SupportedLanguagePackLocale): Promise<void> {
  switch (locale) {
    case 'de':
      await import('@codingame/monaco-vscode-language-pack-de');
      return;
    case 'es':
      await import('@codingame/monaco-vscode-language-pack-es');
      return;
    case 'fr':
      await import('@codingame/monaco-vscode-language-pack-fr');
      return;
    case 'it':
      await import('@codingame/monaco-vscode-language-pack-it');
      return;
    case 'ja':
      await import('@codingame/monaco-vscode-language-pack-ja');
      return;
    case 'pt-br':
      await import('@codingame/monaco-vscode-language-pack-pt-br');
      return;
    case 'zh-hans':
      await import('@codingame/monaco-vscode-language-pack-zh-hans');
      return;
    case 'en':
      return;
  }
}

function configureMonacoEnvironment(): void {
  if (typeof window !== 'undefined' && window.Worker) {
    const NativeWorker = window.Worker;
    if (!Reflect.has(NativeWorker, '__isExtensionFileIntercepted')) {
      class FallbackWorker extends EventTarget {
        onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
        onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
        onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;

        postMessage(): void {}
        terminate(): void {}
      }

      const WrappedWorker = class extends NativeWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          let resolvedURL = scriptURL;
          const urlString = typeof scriptURL === 'string' ? scriptURL : scriptURL.toString();
          if (urlString.startsWith('extension-file:')) {
            try {
              const uri = URI.parse(urlString);
              const browserUri = FileAccess.uriToBrowserUri(uri);
              resolvedURL = browserUri.toString(true);
            } catch {
              // fallback
            }
          }

          try {
            super(resolvedURL, options);
          } catch {
            return new FallbackWorker() as never;
          }
        }
      };
      Reflect.set(WrappedWorker, '__isExtensionFileIntercepted', true);
      window.Worker = WrappedWorker;
    }
  }

  if (typeof globalThis === 'undefined' || Reflect.has(globalThis, 'MonacoEnvironment')) {
    return;
  }

  const monacoEnvironment = {
    getWorkerUrl(_workerId: string, label: string): string {
      try {
        if (typeof browser !== 'undefined' && browser.runtime?.getURL) {
          if (label === 'TextMateWorker') {
            return browser.runtime.getURL('/monaco-textmate.js');
          }
          return browser.runtime.getURL('/monaco-editor.js');
        }
      } catch {
        // Fallback for non-extension environments
      }
      return '';
    },
    getWorker(_workerId: string, label: string): Worker {
      try {
        if (typeof browser !== 'undefined' && browser.runtime?.getURL) {
          const url =
            label === 'TextMateWorker'
              ? browser.runtime.getURL('/monaco-textmate.js')
              : browser.runtime.getURL('/monaco-editor.js');
          return new Worker(url, { type: 'module' });
        }
      } catch {
        // Fallback for test or headless environments
      }
      return {
        postMessage: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        terminate: () => {},
      } as unknown as Worker;
    },
  };

  Reflect.set(globalThis, 'MonacoEnvironment', monacoEnvironment);
}

let sharedNativeInitPromise: Promise<void> | null = null;

export function resetSharedNativeInitPromise(): void {
  sharedNativeInitPromise = null;
}

export class NativeMonacoEngineAdapter implements IMonacoEngineAdapter {
  private currentLocale: SupportedLanguagePackLocale = 'en';

  public async initialize(locale: SupportedLanguagePackLocale, container?: HTMLElement): Promise<void> {
    this.currentLocale = locale;
    if (!sharedNativeInitPromise) {
      sharedNativeInitPromise = (async () => {
        // 1. Configure MonacoEnvironment Web Workers
        configureMonacoEnvironment();

        // 2. Load localized string bundle BEFORE anything else to avoid NLS race condition
        await loadLanguagePack(locale);

        // 3. Load extension host and default language/theme extensions
        await import('vscode/localExtensionHost');

        const [, , , , , , , , markdownExt, mermaidExt] = await Promise.all([
          import('@codingame/monaco-vscode-theme-defaults-default-extension'),
          import('@codingame/monaco-vscode-theme-seti-default-extension'),
          import('@codingame/monaco-vscode-typescript-basics-default-extension'),
          import('@codingame/monaco-vscode-javascript-default-extension'),
          import('@codingame/monaco-vscode-json-default-extension'),
          import('@codingame/monaco-vscode-html-default-extension'),
          import('@codingame/monaco-vscode-css-default-extension'),
          import('@codingame/monaco-vscode-markdown-basics-default-extension'),
          import('@codingame/monaco-vscode-markdown-language-features-default-extension'),
          import('@codingame/monaco-vscode-mermaid-markdown-features-default-extension'),
          import('@codingame/monaco-vscode-yaml-default-extension'),
          import('@codingame/monaco-vscode-python-default-extension'),
          import('@codingame/monaco-vscode-rust-default-extension'),
          import('@codingame/monaco-vscode-go-default-extension'),
          import('@codingame/monaco-vscode-shellscript-default-extension'),
        ]);

        // 4. Import Monaco API, core bindings, and full workbench service overrides
        const [
          vscodeApi,
          monaco,
          { default: getConfigurationServiceOverride, initUserConfiguration },
          { default: getKeybindingsServiceOverride },
          { default: getLanguagesServiceOverride },
          { default: getLocalizationServiceOverride },
          { default: getModelServiceOverride },
          { default: getTextMateServiceOverride },
          { default: getThemeServiceOverride },
          {
            default: getFilesServiceOverride,
            RegisteredFileSystemProvider,
            RegisteredMemoryFile,
            registerFileSystemOverlay,
          },
          { default: getExplorerServiceOverride },
          { default: getSearchServiceOverride },
          { default: getMarkersServiceOverride },
          { default: getStatusBarServiceOverride },
          { default: getPreferencesServiceOverride },
          { default: getQuickAccessServiceOverride },
          { default: getOutlineServiceOverride },
          { default: getTimelineServiceOverride },
          { default: getScmServiceOverride },
          { default: getDebugServiceOverride },
          { default: getTestingServiceOverride },
          { default: getExtensionsServiceOverride },
          { default: getTitleBarServiceOverride },
          { default: getSnippetsServiceOverride },
          { default: getWorkbenchServiceOverride },
        ] = await Promise.all([
          import('@codingame/monaco-vscode-api'),
          import('monaco-editor'),
          import('@codingame/monaco-vscode-configuration-service-override'),
          import('@codingame/monaco-vscode-keybindings-service-override'),
          import('@codingame/monaco-vscode-languages-service-override'),
          import('@codingame/monaco-vscode-localization-service-override'),
          import('@codingame/monaco-vscode-model-service-override'),
          import('@codingame/monaco-vscode-textmate-service-override'),
          import('@codingame/monaco-vscode-theme-service-override'),
          import('@codingame/monaco-vscode-files-service-override'),
          import('@codingame/monaco-vscode-explorer-service-override'),
          import('@codingame/monaco-vscode-search-service-override'),
          import('@codingame/monaco-vscode-markers-service-override'),
          import('@codingame/monaco-vscode-view-status-bar-service-override'),
          import('@codingame/monaco-vscode-preferences-service-override'),
          import('@codingame/monaco-vscode-quickaccess-service-override'),
          import('@codingame/monaco-vscode-outline-service-override'),
          import('@codingame/monaco-vscode-timeline-service-override'),
          import('@codingame/monaco-vscode-scm-service-override'),
          import('@codingame/monaco-vscode-debug-service-override'),
          import('@codingame/monaco-vscode-testing-service-override'),
          import('@codingame/monaco-vscode-extensions-service-override'),
          import('@codingame/monaco-vscode-view-title-bar-service-override'),
          import('@codingame/monaco-vscode-snippets-service-override'),
          import('@codingame/monaco-vscode-workbench-service-override'),
        ]);

        // 5. Seed initial workspace files in /workspace using RegisteredFileSystemProvider
        const fileSystemProvider = new RegisteredFileSystemProvider(false);

        const workspaceConfigContent = JSON.stringify(
          {
            folders: [
              {
                path: '/workspace',
              },
            ],
          },
          null,
          2,
        );

        const sampleIndexTs = [
          'export function helloWorld(): string {',
          "  return 'Hello from Source Code Editor!';",
          '}',
          '',
          'console.log(helloWorld());',
        ].join('\n');

        const samplePackageJson = JSON.stringify(
          {
            name: 'source-code-editor-workspace',
            version: '1.0.0',
            description: 'Source Code Editor Sample Workspace',
            main: 'src/index.ts',
          },
          null,
          2,
        );

        const sampleReadme = [
          '# Source Code Editor',
          '',
          'Welcome to your native in-browser VS Code workbench powered by `@codingame/monaco-vscode-api`.',
        ].join('\n');

        fileSystemProvider.registerFile(
          new RegisteredMemoryFile(monaco.Uri.file('/workspace.code-workspace'), workspaceConfigContent),
        );
        fileSystemProvider.registerFile(
          new RegisteredMemoryFile(monaco.Uri.file('/workspace/src/index.ts'), sampleIndexTs),
        );
        fileSystemProvider.registerFile(
          new RegisteredMemoryFile(monaco.Uri.file('/workspace/package.json'), samplePackageJson),
        );
        fileSystemProvider.registerFile(
          new RegisteredMemoryFile(monaco.Uri.file('/workspace/README.md'), sampleReadme),
        );

        registerFileSystemOverlay(1, fileSystemProvider);

        // 6. Pre-initialize user configuration before services initialize
        await initUserConfiguration(
          JSON.stringify({
            'workbench.iconTheme': 'vs-seti',
            'workbench.colorTheme': 'Dark Modern',
          }),
        );

        // 7. Resolve target container element for workbench layout
        const targetContainer =
          container ??
          (typeof document !== 'undefined' ? (document.getElementById('workbenchHost') ?? undefined) : undefined);

        // 8. Initialize VS Code Workbench Services with native full workbench overrides
        await vscodeApi.initialize(
          {
            ...getConfigurationServiceOverride(),
            ...getKeybindingsServiceOverride(),
            ...getLanguagesServiceOverride(),
            ...getLocalizationServiceOverride({
              async clearLocale(): Promise<void> {},
              async setLocale(): Promise<void> {},
              availableLanguages: [
                { locale: 'en', languageName: 'English' },
                { locale: 'de', languageName: 'German' },
                { locale: 'es', languageName: 'Spanish' },
                { locale: 'fr', languageName: 'French' },
                { locale: 'it', languageName: 'Italian' },
                { locale: 'ja', languageName: 'Japanese' },
                { locale: 'pt-br', languageName: 'Portuguese (Brazil)' },
                { locale: 'zh-hans', languageName: 'Chinese (Simplified)' },
              ],
            }),
            ...getModelServiceOverride(),
            ...getTextMateServiceOverride(),
            ...getThemeServiceOverride(),
            ...getFilesServiceOverride(),
            ...getExplorerServiceOverride(),
            ...getSearchServiceOverride(),
            ...getMarkersServiceOverride(),
            ...getStatusBarServiceOverride(),
            ...getPreferencesServiceOverride(),
            ...getQuickAccessServiceOverride({
              isKeybindingConfigurationVisible: () => true,
              shouldUseGlobalPicker: () => true,
            }),
            ...getOutlineServiceOverride(),
            ...getTimelineServiceOverride(),
            ...getScmServiceOverride(),
            ...getDebugServiceOverride(),
            ...getTestingServiceOverride(),
            ...getExtensionsServiceOverride({ enableWorkerExtensionHost: false }),
            ...getTitleBarServiceOverride(),
            ...getSnippetsServiceOverride(),
            ...getWorkbenchServiceOverride(),
          },
          targetContainer,
          {
            windowIndicator: {
              label: 'Source Code Editor',
              tooltip: 'Source Code Editor Web Extension',
              command: '',
            },
            workspaceProvider: {
              trusted: true,
              open(): Promise<boolean> {
                return Promise.resolve(false);
              },
              workspace: {
                workspaceUri: monaco.Uri.file('/workspace.code-workspace'),
              },
            },
            defaultLayout: {
              editors: [
                {
                  uri: monaco.Uri.file('/workspace/src/index.ts'),
                  viewColumn: 1,
                },
              ],
              force: true,
            },
            productConfiguration: {
              nameShort: 'Source Code Editor',
              nameLong: 'Source Code Editor',
            },
          },
        );

        // 9. Wait for extension service & builtin extensions to finish registering
        const extensionService = await vscodeApi.getService(vscodeApi.IExtensionService).catch(() => null);
        if (extensionService) {
          await extensionService.whenInstalledExtensionsRegistered().catch(() => null);
          await extensionService.activateByEvent('onLanguage:markdown').catch(() => null);
        }
        if (markdownExt?.whenReady) {
          await markdownExt.whenReady().catch(() => null);
        }
        if (mermaidExt?.whenReady) {
          await mermaidExt.whenReady().catch(() => null);
        }

        // 10. Open explorer and default editor
        try {
          const vscode = await import('vscode');
          await vscode.commands.executeCommand('workbench.view.explorer');
          await vscode.commands.executeCommand('vscode.open', monaco.Uri.file('/workspace/src/index.ts'));
        } catch {
          // Non-blocking fallback
        }
      })();
    }

    await sharedNativeInitPromise;
  }

  public async mountWorkbench(container: HTMLElement): Promise<WorkbenchMountHandle> {
    await this.initialize(this.currentLocale, container);
    container.classList.add('monaco-workbench-container');
    try {
      const vscode = await import('vscode');
      await vscode.commands.executeCommand('workbench.view.explorer');
    } catch {
      // Non-blocking fallback
    }
    return {
      dispose(): void {
        container.classList.remove('monaco-workbench-container');
      },
    };
  }
}

export class MockMonacoEngineAdapter implements IMonacoEngineAdapter {
  private initialized = false;

  public initialize(_locale: SupportedLanguagePackLocale, _container?: HTMLElement): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  public isAdapterInitialized(): boolean {
    return this.initialized;
  }

  public mountWorkbench(container: HTMLElement): Promise<WorkbenchMountHandle> {
    container.classList.add('monaco-workbench-container');
    return Promise.resolve({
      dispose: () => {
        container.classList.remove('monaco-workbench-container');
      },
    });
  }
}

export class MonacoWorkbenchService implements IMonacoWorkbenchService {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly engineAdapter: IMonacoEngineAdapter;
  private readonly locale: SupportedLanguagePackLocale;

  public constructor(engineAdapter?: IMonacoEngineAdapter, rawLocale?: string) {
    this.engineAdapter = engineAdapter ?? new NativeMonacoEngineAdapter();
    const detectedLocale =
      rawLocale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en');
    this.locale = resolveLanguagePackLocale(detectedLocale);
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async initializeServices(container?: HTMLElement): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      await this.engineAdapter.initialize(this.locale, container);
      this.initialized = true;
    })();

    return this.initPromise;
  }

  public async mountWorkbench(container: HTMLElement): Promise<WorkbenchMountHandle> {
    await this.initializeServices(container);
    return this.engineAdapter.mountWorkbench(container);
  }
}
