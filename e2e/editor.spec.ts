import { expect, test } from './fixtures';

test.describe('Source Code Editor Workbench E2E', () => {
  test('renders Workbench shell, Welcome cards, Activity Bar views, theme toggle, and launch mode switch', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/editor.html`);

    const shell = page.getByTestId('workbench-shell');
    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute('data-theme-type', 'dark');

    await expect(page.getByTestId('welcome-view')).toBeVisible();
    await expect(page.getByTestId('welcome-card-local-folder')).toContainText('Open Local Folder');
    await expect(page.getByTestId('welcome-card-clone-repo')).toContainText('Clone / Open Remote Repository');
    await expect(page.getByTestId('welcome-card-recent-workspaces')).toContainText('Recent Workspaces');

    await expect(page.getByTestId('status-runtime-mode')).toContainText('Standalone Web');
    await expect(page.getByTestId('sidebar-title')).toHaveText('Explorer');
    await expect(page.getByTestId('sidebar-view-explorer')).toBeVisible();

    await page.getByTestId('activity-item-search').click();
    await expect(page.getByTestId('sidebar-title')).toHaveText('Search');
    await expect(page.getByTestId('sidebar-view-search')).toBeVisible();

    await page.getByTestId('activity-item-scm').click();
    await expect(page.getByTestId('sidebar-title')).toHaveText('Source Control');
    await expect(page.getByTestId('sidebar-view-scm')).toBeVisible();

    await page.getByTestId('activity-item-extensions').click();
    await expect(page.getByTestId('sidebar-title')).toHaveText('Extensions');
    await expect(page.getByTestId('sidebar-view-extensions')).toBeVisible();

    await page.getByTestId('theme-toggle-button').click();
    await expect(shell).toHaveAttribute('data-theme-type', 'light');

    const launchToggle = page.getByTestId('launch-mode-toggle');
    await expect(launchToggle).toContainText('Launch: Tab');
    await launchToggle.click();
    await expect(launchToggle).toContainText('Launch: Popup Window');

    await page.close();
  });

  test('displays active workspace and repository context banners when opened with query parameters', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/editor.html?workspace=hello-world&repo=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World`,
    );

    await expect(page.getByTestId('active-context-banner')).toBeVisible();
    await expect(page.getByTestId('active-workspace-pill')).toContainText('hello-world');
    await expect(page.getByTestId('active-repo-pill')).toContainText('https://github.com/octocat/Hello-World');
    await expect(page.getByTestId('sidebar-title')).toHaveText('Source Control');

    await page.close();
  });
});
