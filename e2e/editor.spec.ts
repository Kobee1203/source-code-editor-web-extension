import { expect, test } from './fixtures';

test.describe('Source Code Editor Workbench E2E', () => {
  test('renders full-bleed native VS Code Workbench with all activity bar views, explorer outline/timeline, and zero errors', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`chrome-extension://${extensionId}/editor.html`);

    // 1. Extension shell renders full-screen without unwanted custom header
    const shell = page.getByTestId('workbench-shell');
    await expect(shell).toBeVisible();
    await expect(page.getByTestId('extension-header')).toHaveCount(0);

    // 2. Native VS Code Workbench container mounts
    const workbenchContainer = page.getByTestId('workbench-container');
    await expect(workbenchContainer).toBeVisible();

    const monacoWorkbench = workbenchContainer.locator('.monaco-workbench');
    await expect(monacoWorkbench).toBeVisible({ timeout: 20_000 });

    // 3. Native Title Bar with VS Code menu (File, Edit, Selection, etc.)
    const titleBar = workbenchContainer.locator('.part.titlebar');
    await expect(titleBar).toBeVisible();

    // 4. Native Activity Bar is visible and populated with action items matching the CodinGame demo
    const activityBar = workbenchContainer.locator('.part.activitybar');
    await expect(activityBar).toBeVisible();

    const activityBarItems = activityBar.locator('.action-item');
    await expect(activityBarItems.first()).toBeVisible();
    expect(await activityBarItems.count()).toBeGreaterThanOrEqual(4);

    const explorerButton = activityBar.locator('.codicon-explorer-view-icon');
    await expect(explorerButton).toBeVisible();

    const searchButton = activityBar.locator('.codicon-search-view-icon');
    await expect(searchButton).toBeVisible();

    const scmButton = activityBar.locator('.codicon-source-control-view-icon');
    await expect(scmButton).toBeVisible();

    const debugButton = activityBar.locator('.codicon-run-view-icon');
    await expect(debugButton).toBeVisible();

    const settingsButton = activityBar.locator('.codicon-settings-view-bar-icon');
    await expect(settingsButton).toBeVisible();

    // Reveal Explorer view in Sidebar if not already active
    const explorerItem = activityBar
      .locator('.action-item')
      .filter({ has: page.locator('.codicon-explorer-view-icon') });
    const isExplorerActive = await explorerItem.evaluate((el) => el.classList.contains('checked'));
    if (!isExplorerActive) {
      await explorerButton.click();
    }

    // 5. Native Sidebar is visible and displays workspace files in the Explorer tree
    const sidebar = workbenchContainer.locator('.part.sidebar');
    await expect(sidebar).toBeVisible();

    const sidebarRows = sidebar.locator('.monaco-list-row');
    await expect(sidebarRows.first()).toBeVisible({ timeout: 10_000 });
    await expect(sidebarRows.filter({ hasText: 'package.json' })).toBeVisible({ timeout: 10_000 });
    await expect(sidebarRows.filter({ hasText: 'README.md' })).toBeVisible({ timeout: 10_000 });

    // Verify Outline and Timeline are present in Explorer sidebar
    const outlineHeader = sidebar.locator('.pane-header').filter({ hasText: /Outline/i });
    await expect(outlineHeader).toBeVisible();

    const timelineHeader = sidebar.locator('.pane-header').filter({ hasText: /Timeline/i });
    await expect(timelineHeader).toBeVisible();

    // Verify icon label spacing (box-sizing: content-box and padding-right: 6px)
    const iconLabelBefore = await sidebar
      .locator('.monaco-icon-label')
      .first()
      .evaluate((el) => {
        const style = window.getComputedStyle(el, '::before');
        return {
          boxSizing: style.boxSizing,
          paddingRight: style.paddingRight,
        };
      });
    expect(iconLabelBefore.boxSizing).toBe('content-box');
    expect(iconLabelBefore.paddingRight).toBe('6px');

    // 6. Native Editor Area displays an active editor tab with index.ts and breadcrumbs
    const editorPart = workbenchContainer.locator('.part.editor');
    await expect(editorPart).toBeVisible();

    const activeTab = editorPart.locator('.tab.active, .tab').filter({ hasText: 'index.ts' });
    await expect(activeTab).toBeVisible();

    const breadcrumbs = editorPart.locator('.breadcrumbs-widget, .monaco-breadcrumbs').filter({ hasText: 'index.ts' });
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs).toContainText('index.ts');

    // Verify Monaco editor DOM instance is active inside editor part
    const monacoEditor = editorPart.locator('.monaco-editor');
    await expect(monacoEditor).toBeVisible();

    // 7. Native Status Bar is visible and shows language and cursor information
    const statusbar = workbenchContainer.locator('.part.statusbar');
    await expect(statusbar).toBeVisible();
    await expect(statusbar.locator('.statusbar-item').first()).toBeVisible();
    await expect(statusbar).toContainText(/(Ln \d+, Col \d+|L \d+, col \d+|UTF-8|Layout)/);

    // Language mode is resolved natively by the default language extensions (no manual registration)
    await expect(statusbar).toContainText('TypeScript', { timeout: 10_000 });

    // 8. Verify strictly zero console errors, zero page errors, and zero CSP violations
    const cspErrors = pageErrors.filter((e) => e.includes('EvalError') || e.includes('Content Security Policy'));
    expect(cspErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('Fetching additional builtin extensions from gallery') &&
        !e.includes('fetching additional builtin extensions from gallery'),
    );
    expect(realConsoleErrors).toEqual([]);

    await page.close();
  });

  test('initializes native VS Code Workbench in French locale without CSP or runtime errors', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'language', {
        get: () => 'fr-FR',
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['fr-FR', 'fr'],
      });
    });

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`chrome-extension://${extensionId}/editor.html`);

    const workbenchContainer = page.getByTestId('workbench-container');
    await expect(workbenchContainer).toBeVisible();

    const monacoWorkbench = workbenchContainer.locator('.monaco-workbench');
    await expect(monacoWorkbench).toBeVisible({ timeout: 20_000 });

    // Native Activity Bar with localized action items
    const activityBar = workbenchContainer.locator('.part.activitybar');
    await expect(activityBar).toBeVisible();

    const explorerButton = activityBar.locator('.codicon-explorer-view-icon');
    await expect(explorerButton).toBeVisible();

    const searchButton = activityBar.locator('.codicon-search-view-icon');
    await expect(searchButton).toBeVisible();

    // Reveal Explorer view in Sidebar if not already active
    const explorerItem = activityBar
      .locator('.action-item')
      .filter({ has: page.locator('.codicon-explorer-view-icon') });
    const isExplorerActive = await explorerItem.evaluate((el) => el.classList.contains('checked'));
    if (!isExplorerActive) {
      await explorerButton.click();
    }

    // Native Sidebar with workspace files in French locale
    const sidebar = workbenchContainer.locator('.part.sidebar');
    await expect(sidebar).toBeVisible();

    const sidebarRows = sidebar.locator('.monaco-list-row');
    await expect(sidebarRows.first()).toBeVisible({ timeout: 10_000 });
    await expect(sidebarRows.filter({ hasText: 'package.json' })).toBeVisible({ timeout: 10_000 });
    await expect(sidebarRows.filter({ hasText: 'README.md' })).toBeVisible({ timeout: 10_000 });

    // Native Editor Area
    const editorPart = workbenchContainer.locator('.part.editor');
    await expect(editorPart).toBeVisible();

    // Native Status Bar with French localization
    const statusbar = workbenchContainer.locator('.part.statusbar');
    await expect(statusbar).toBeVisible();
    await expect(statusbar.locator('.statusbar-item').first()).toBeVisible();

    // Open README.md from the Explorer sidebar
    await sidebarRows.filter({ hasText: 'README.md' }).dblclick();

    const readmeTab = editorPart.locator('.tab.active, .tab').filter({ hasText: 'README.md' });
    await expect(readmeTab).toBeVisible({ timeout: 15_000 });

    // Verify Markdown language mode is recognized in status bar
    await expect(statusbar).toContainText(/Markdown/i, { timeout: 10_000 });

    // Focus editor
    await editorPart.locator('.monaco-editor').first().click();

    // Verify editor type dropdown (e.g. Text Editor ⌵) is visible for markdown files
    const editorTypeDropdown = editorPart.locator('.breadcrumbs-editor-type');
    await expect(editorTypeDropdown).toBeVisible({ timeout: 10_000 });
    await expect(editorTypeDropdown).toContainText(/(Text Editor|Éditeur de texte)/i);

    // Verify Preview to Side toolbar action is visible and click it
    const previewAction = editorPart.locator('.action-item [class*="open-preview"]').first();
    await expect(previewAction).toBeVisible({ timeout: 10_000 });
    await previewAction.click();

    // Verify Markdown Preview panel/tab is opened
    const previewTab = editorPart.locator('.tab').filter({ hasText: /(Preview|Aperçu) README.md/i });
    await expect(previewTab).toBeVisible({ timeout: 15_000 });

    // Verify webview iframe is created for the preview
    const webviewElement = workbenchContainer.locator('iframe, .webview').first();
    await expect(webviewElement).toBeVisible({ timeout: 15_000 });

    // Open package.json from the Explorer sidebar
    await sidebarRows.filter({ hasText: 'package.json' }).dblclick();

    // Native Editor Area displays an editor tab for package.json
    const activeTab = editorPart.locator('.tab.active, .tab').filter({ hasText: 'package.json' });
    await expect(activeTab).toBeVisible({ timeout: 15_000 });

    const breadcrumbs = editorPart
      .locator('.breadcrumbs-widget, .monaco-breadcrumbs')
      .filter({ hasText: 'package.json' });
    await expect(breadcrumbs).toBeVisible({ timeout: 10_000 });
    await expect(breadcrumbs).toContainText('package.json');

    await expect(statusbar).toContainText('JSON', { timeout: 10_000 });
    await expect(statusbar).toContainText(/(L \d+, col \d+|Ln \d+, Col \d+|UTF-8|Layout)/);

    // Verify strictly zero console errors, zero page errors, and zero CSP violations
    const cspErrors = pageErrors.filter((e) => e.includes('EvalError') || e.includes('Content Security Policy'));
    expect(cspErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('Fetching additional builtin extensions from gallery') &&
        !e.includes('fetching additional builtin extensions from gallery'),
    );
    expect(realConsoleErrors).toEqual([]);

    await page.close();
  });
});
