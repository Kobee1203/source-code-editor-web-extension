import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    pool: 'vmThreads',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@@': resolve(import.meta.dirname, '.'),
      '#i18n': resolve(import.meta.dirname, './.wxt/i18n/index.ts'),
      '#imports': resolve(import.meta.dirname, './tests/helpers/wxtImports.ts'),
    },
  },
});
