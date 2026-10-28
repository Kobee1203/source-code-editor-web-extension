import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const EXTENSION_PATH = path.resolve('.output/chrome-mv3');
const SCREENSHOTS_DIR = path.resolve('store/screenshots');

async function generateScreenshots(): Promise<void> {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(`Built extension not found at ${EXTENSION_PATH}. Run "pnpm build" first.`);
  }

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 800 },
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

    const outPath = path.join(SCREENSHOTS_DIR, 'en-01-workbench-welcome.png');
    await page.screenshot({ path: outPath });
    console.log(`✅ Saved screenshot: ${outPath}`);
  } finally {
    await context.close();
  }
}

generateScreenshots().catch((err) => {
  console.error('Failed to generate screenshots:', err);
  process.exit(1);
});
