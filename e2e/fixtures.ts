import { type BrowserContext, test as base, chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';

/** Absolute path to the built Chrome MV3 extension directory */
const EXTENSION_PATH = path.resolve('.output/chrome-mv3');

function setMacOsTestLocale(): void {
  if (process.platform !== 'darwin') return;
  try {
    execSync('defaults write com.google.chrome.for.testing AppleLanguages \'("en-US")\'', { stdio: 'ignore' });
  } catch {
    // Ignore when running in restricted environments
  }
}

function clearMacOsTestLocale(): void {
  if (process.platform !== 'darwin') return;
  try {
    execSync('defaults delete com.google.chrome.for.testing AppleLanguages', { stdio: 'ignore' });
  } catch {
    // Ignore if already unset
  }
}

/**
 * Custom Playwright fixtures that launch Chromium with the extension loaded
 * and expose the dynamic extension ID to every test.
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    setMacOsTestLocale();
    const isHeadless = process.env.HEADLESS !== 'false';
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      locale: 'en-US',
      args: [
        ...(isHeadless ? ['--headless=new'] : []),
        '--lang=en-US',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      clearMacOsTestLocale();
    }
  },

  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', {
        timeout: 10_000,
      });
    }
    const url = background.url();
    const match = /chrome-extension:\/\/([a-z0-9]+)/.exec(url);
    const extId = match?.[1];
    if (!extId) {
      throw new Error(`Unable to resolve extension ID from background service worker: ${url}`);
    }
    await use(extId);
  },
});

export { expect } from '@playwright/test';
