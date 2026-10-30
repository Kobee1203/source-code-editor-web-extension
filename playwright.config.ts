import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  /* Run tests sequentially — a single persistent browser context with the extension loaded */
  fullyParallel: false,
  workers: 1,
  /* Reporter configuration */
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
  },
  retries: 0,
  /* Auto-start the fixture server before tests */
  webServer: {
    command: 'pnpm exec tsx e2e/server/start.ts',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: !process.env.CI,
  },
});
