import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  // Force MV3 for all browsers (Firefox defaults to MV2).
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue', '@wxt-dev/i18n/module'],
  // Explicit ES imports everywhere (no auto-imports) for readability and store reviewability.
  imports: false,
  vite: () => ({
    build: {
      chunkSizeWarningLimit: 1000,
    },
  }),
  manifest: ({ browser }) => ({
    name: 'Source Code Editor',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['activeTab', 'tabs', 'storage', 'contextMenus'],
    optional_permissions: ['nativeMessaging'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'self';",
    },
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
