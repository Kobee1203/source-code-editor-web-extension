import { defineConfig } from 'wxt';
import vsixPlugin from '@codingame/monaco-vscode-rollup-vsix-plugin';
import fs from 'node:fs';
import path from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  // Force MV3 for all browsers (Firefox defaults to MV2).
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue', '@wxt-dev/i18n/module'],
  // Explicit ES imports everywhere (no auto-imports) for readability and store reviewability.
  imports: false,
  vite: () => {
    let outDir = '';
    const savedHtmlAssets = new Map<string, string | Uint8Array>();

    return {
      plugins: [
        vsixPlugin(),
        {
          name: 'wxt-monaco-csp-and-html-fix',
          configResolved(config) {
            outDir = config.build.outDir;
          },
          transform(code, id) {
            // Replace mainWindow.Function(`...`) for connection-observer with a direct IIFE
            // to comply with Chrome Manifest V3 CSP (no 'unsafe-eval' allowed).
            if (id.includes('vs/base/browser/dom') && code.includes('connection-observer')) {
              return code.replace(
                /mainWindow\.Function\(`[\s\S]*?return customElements\.get\('connection-observer'\);[\s\S]*?`\)\(\);?/,
                `(() => {
                  if (!customElements.get('connection-observer')) {
                    class ConnectionObserverElement extends HTMLElement {
                      connectedCallback() {
                        this.onDidConnect?.();
                      }
                      disconnectedCallback() {
                        this.onDidDisconnect?.();
                      }
                    }
                    customElements.define('connection-observer', ConnectionObserverElement);
                  }
                  return customElements.get('connection-observer');
                })();`,
              );
            }
            return null;
          },
          generateBundle(_options, bundle) {
            for (const [fileName, item] of Object.entries(bundle)) {
              // WXT's moveHtmlFiles treats all *.html files as extension entrypoints.
              // Non-entrypoint helper HTML files from dependencies (e.g. webview iframe assets)
              // must not be emitted as top-level HTML chunks to prevent moveHtmlFiles from crashing.
              // We retain their contents and write them directly to outDir in closeBundle.
              // If an HTML asset contains an inline script (e.g. webview index.html), extract it
              // to a companion .js file so it complies with Chrome MV3 CSP (no inline scripts/hashes).
              if (fileName.endsWith('.html') && fileName !== 'editor.html') {
                const rawContent = 'source' in item ? item.source : 'code' in item ? item.code : '';
                const contentString = typeof rawContent === 'string' ? rawContent : rawContent.toString();
                const scriptRegex = /<script async type="module">([\s\S]*?)<\/script>/;
                const scriptMatch = contentString.match(scriptRegex);
                if (scriptMatch && scriptMatch[1] != null) {
                  let scriptCode = scriptMatch[1];
                  // Remove inline _vscodeApiScript to comply with MV3 CSP (no inline scripts allowed)
                  scriptCode = scriptCode.replace(
                    /if\s*\(\s*options\.allowScripts\s*\)\s*\{\s*const defaultScript = newDocument\.createElement\('script'\);[\s\S]*?newDocument\.head\.prepend\(defaultScript\);\s*\}/,
                    '/* defaultScript inline script removed for MV3 CSP */',
                  );
                  // Attach acquireVsCodeApi directly to newFrame.contentWindow without inline script tag
                  scriptCode = scriptCode.replace(
                    /contentDocument\.open\(\);\s*contentDocument\.write\(newDocument\);\s*contentDocument\.close\(\);/,
                    `const getApiInstance = () => {
                      const postMsg = (channel, data, transfer) => {
                        window.parent[vscodePostMessageFuncName]?.(channel, data, transfer);
                      };
                      let acquired = false;
                      let state = data.state;
                      return () => {
                        if (acquired && !options.allowMultipleAPIAcquire) {
                          throw new Error('An instance of the VS Code APIs has already been acquired');
                        }
                        acquired = true;
                        return Object.freeze({
                          postMessage: (message, transfer) => postMsg('onmessage', { message, transfer }, transfer),
                          setState: (newState) => { state = newState; postMsg('do-update-state', JSON.stringify(newState)); return newState; },
                          getState: () => state,
                        });
                      };
                    };
                    try { newFrame.contentWindow.acquireVsCodeApi = getApiInstance(); } catch {}
                    contentDocument.open();
                    try { newFrame.contentWindow.acquireVsCodeApi = getApiInstance(); } catch {}
                    contentDocument.write(newDocument);
                    contentDocument.close();
                    try { newFrame.contentWindow.acquireVsCodeApi = getApiInstance(); } catch {}`,
                  );
                  const jsFileName = fileName.replace(/\.html$/, '.js');
                  const jsBaseName = path.basename(jsFileName);
                  const updatedHtml = contentString.replace(
                    scriptRegex,
                    `<script async type="module" src="./${jsBaseName}"></script>`,
                  );
                  savedHtmlAssets.set(fileName, updatedHtml);
                  savedHtmlAssets.set(jsFileName, scriptCode);
                } else {
                  savedHtmlAssets.set(fileName, rawContent);
                }
                delete bundle[fileName];
                continue;
              }

              // Wrap CommonJS extension bundles emitted by vsix plugin in a closed function scope
              // passing (globalThis.module, globalThis.exports, globalThis.require).
              // This prevents top-level variable declarations (e.g. `function te`) from polluting `window`
              // and colliding across extensions when loaded via CSP-safe <script src="...">.
              // Match strictly assets/extension-*.js (do NOT match chunks/*.js which are ES modules).
              if (fileName.match(/^assets\/extension-.*\.js$/)) {
                if ('code' in item && typeof item.code === 'string') {
                  item.code = `(function(module, exports, require) {\n${item.code}\n})(globalThis.module, globalThis.exports, globalThis.require);`;
                } else if ('source' in item) {
                  const src = typeof item.source === 'string' ? item.source : item.source.toString();
                  item.source = `(function(module, exports, require) {\n${src}\n})(globalThis.module, globalThis.exports, globalThis.require);`;
                }
              }
            }
          },
          async closeBundle() {
            if (savedHtmlAssets.size > 0 && outDir) {
              for (const [fileName, content] of savedHtmlAssets.entries()) {
                const destPath = path.resolve(outDir, fileName);
                await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
                await fs.promises.writeFile(destPath, content);
              }
            }
            if (outDir) {
              const assetsDir = path.resolve(outDir, 'assets');
              if (fs.existsSync(assetsDir)) {
                // Copy all resources from mermaid default extension if omitted by Vite deduplication
                const mermaidResDir = path.resolve(
                  'node_modules/@codingame/monaco-vscode-mermaid-markdown-features-default-extension/resources',
                );
                if (fs.existsSync(mermaidResDir)) {
                  const resFiles = await fs.promises.readdir(mermaidResDir);
                  for (const resFile of resFiles) {
                    if (resFile.endsWith('.js')) {
                      const dest = path.resolve(assetsDir, resFile);
                      if (!fs.existsSync(dest)) {
                        await fs.promises.copyFile(path.resolve(mermaidResDir, resFile), dest);
                      }
                    }
                  }
                }

                // Also create explicit alias copies for known mermaid re-exports
                const aliases: Record<string, string> = {
                  'chunk-FNK4WUGV.js': 'chunk-AUJBCLOB.js',
                  'classDiagram-v2-JRS7N3AN-4AIFW5SM.js': 'classDiagram-DTDB5LWJ-6ITNCIK6.js',
                };
                for (const [aliasName, targetName] of Object.entries(aliases)) {
                  const targetPath = path.resolve(assetsDir, targetName);
                  const aliasPath = path.resolve(assetsDir, aliasName);
                  if (fs.existsSync(targetPath) && !fs.existsSync(aliasPath)) {
                    await fs.promises.copyFile(targetPath, aliasPath);
                  }
                }

                const files = await fs.promises.readdir(assetsDir);
                for (const file of files) {
                  // Match hashed files like `chunk-AUJBCLOB-PDamJQ2a.js`
                  // and create unhashed aliases `chunk-AUJBCLOB.js` for dynamic imports
                  const match = file.match(/^(.+)-[A-Za-z0-9_-]{8}\.js$/);
                  if (match && match[1]) {
                    const unhashedName = `${match[1]}.js`;
                    const src = path.resolve(assetsDir, file);
                    const dest = path.resolve(assetsDir, unhashedName);
                    if (!fs.existsSync(dest)) {
                      await fs.promises.copyFile(src, dest);
                    }
                  }
                }
              }
            }
          },
        },
      ],
      worker: {
        format: 'es',
      },
      build: {
        target: 'esnext',
        chunkSizeWarningLimit: 5000,
        assetsInlineLimit: 0,
      },
    };
  },
  manifest: ({ browser }) => ({
    name: 'Source Code Editor',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['activeTab', 'tabs', 'storage', 'contextMenus'],
    optional_permissions: ['nativeMessaging'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; frame-src 'self'; worker-src 'self'; object-src 'self';",
    },
    web_accessible_resources: [
      {
        resources: ['assets/*', 'icon/*', 'editor.html'],
        matches: ['<all_urls>'],
      },
    ],
    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: {
        16: 'icon/16.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    commands: {
      'open-editor': {
        suggested_key: {
          default: 'Alt+Shift+E',
          mac: 'Alt+Shift+E',
        },
        description: '__MSG_commandOpenEditor__',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'source-code-editor@kobee1203.github.io',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
