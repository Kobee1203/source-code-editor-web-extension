import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const EXTENSION_PATH = path.resolve('.output/chrome-mv3');
const VIDEO_RAW_DIR = path.resolve('store/video/raw');

async function generateDemoVideo(): Promise<void> {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(`Built extension not found at ${EXTENSION_PATH}. Run "pnpm build" first.`);
  }

  fs.mkdirSync(VIDEO_RAW_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: VIDEO_RAW_DIR,
      size: { width: 1280, height: 800 },
    },
    args: [
      '--headless=new',
      '--lang=en-US',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  try {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }
    const match = /chrome-extension:\/\/([a-z0-9]+)/.exec(background.url());
    const extensionId = match?.[1];
    if (!extensionId) {
      throw new Error('Could not resolve extension ID');
    }

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/editor.html`);
    await page.waitForSelector('[data-testid="workbench-shell"]');
    await page.click('[data-testid="activity-item-scm"]');
    await page.click('[data-testid="activity-item-extensions"]');
    await page.click('[data-testid="theme-toggle-button"]');
  } finally {
    await context.close();
  }

  console.log(`✅ Demo video recorded in ${VIDEO_RAW_DIR}`);
}

generateDemoVideo().catch((err) => {
  console.error('Failed to generate demo video:', err);
  process.exit(1);
});
