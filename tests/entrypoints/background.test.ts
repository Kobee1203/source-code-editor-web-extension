import { mockBrowser, registeredListeners } from '@@/tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import background, { COMMAND_OPEN_EDITOR_ID, CONTEXT_MENU_OPEN_REPO_ID } from '@/entrypoints/background';

describe('entrypoints/background', () => {
  beforeEach(() => {
    background.main();
  });

  it('registers context menu on runtime.onInstalled', async () => {
    const onInstalled = registeredListeners.onInstalled[0];
    expect(onInstalled).toBeDefined();
    onInstalled?.();

    await vi.waitFor(() => {
      expect(mockBrowser.contextMenus.removeAll).toHaveBeenCalledTimes(1);
      expect(mockBrowser.contextMenus.create).toHaveBeenCalledWith({
        id: CONTEXT_MENU_OPEN_REPO_ID,
        title: 'contextMenuOpenRepo',
        contexts: ['page', 'link'],
        documentUrlPatterns: ['https://github.com/*/*', 'https://gitlab.com/*/*'],
      });
    });
  });

  it('opens editor in a tab on action.onClicked and attaches repo query when active tab is GitHub/GitLab', async () => {
    const onActionClicked = registeredListeners.onActionClicked[0];
    expect(onActionClicked).toBeDefined();

    onActionClicked?.({ id: 10, url: 'https://developer.mozilla.org/en-US/' });
    await vi.waitFor(() => {
      expect(mockBrowser.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://dummy-id/editor.html',
      });
    });

    onActionClicked?.({ id: 11, url: 'https://github.com/octocat/Hello-World/tree/main' });
    await vi.waitFor(() => {
      expect(mockBrowser.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://dummy-id/editor.html?repo=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World',
      });
    });
  });

  it('handles open-editor keyboard command and ignores unrelated commands', async () => {
    const onCommand = registeredListeners.onCommand[0];
    expect(onCommand).toBeDefined();

    onCommand?.('unrelated-command', { id: 1, url: 'https://github.com/octocat/Hello-World' });
    expect(mockBrowser.tabs.create).not.toHaveBeenCalled();

    onCommand?.(COMMAND_OPEN_EDITOR_ID, { id: 2, url: 'https://github.com/octocat/Hello-World' });
    await vi.waitFor(() => {
      expect(mockBrowser.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://dummy-id/editor.html?repo=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World',
      });
    });
  });

  it('handles context menu clicks on open-repo-in-editor using linkUrl, pageUrl, or tab.url', async () => {
    const onContextClicked = registeredListeners.onContextMenuClicked[0];
    expect(onContextClicked).toBeDefined();

    onContextClicked?.({ menuItemId: 'other-menu-item', pageUrl: 'https://github.com/octocat/Hello-World' });
    expect(mockBrowser.tabs.create).not.toHaveBeenCalled();

    onContextClicked?.(
      {
        menuItemId: CONTEXT_MENU_OPEN_REPO_ID,
        linkUrl: 'https://github.com/vuejs/core',
        pageUrl: 'https://github.com/octocat/Hello-World',
      },
      { id: 5, url: 'https://github.com/octocat/Hello-World' },
    );

    await vi.waitFor(() => {
      expect(mockBrowser.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://dummy-id/editor.html?repo=https%3A%2F%2Fgithub.com%2Fvuejs%2Fcore',
      });
    });
  });

  it('routes runtime.onMessage requests for OPEN_EDITOR and OPEN_REPOSITORY', async () => {
    const onMessage = registeredListeners.onMessage[0];
    expect(onMessage).toBeDefined();

    expect(onMessage?.({ type: 'PING_NATIVE_HOST' })).toBeUndefined();
    expect(onMessage?.(null)).toBeUndefined();

    const openEditorRes = await onMessage?.({
      type: 'OPEN_EDITOR',
      workspaceId: 'ws-demo',
    });
    expect(openEditorRes).toEqual({
      ok: true,
      tabId: 1,
      editorUrl: 'chrome-extension://dummy-id/editor.html?workspace=ws-demo',
    });

    const openValidRepoRes = await onMessage?.({
      type: 'OPEN_REPOSITORY',
      repoUrl: 'https://github.com/octocat/Hello-World/pulls',
    });
    expect(openValidRepoRes).toEqual({
      ok: true,
      tabId: 1,
      editorUrl: 'chrome-extension://dummy-id/editor.html?repo=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World',
    });

    const openInvalidRepoRes = await onMessage?.({
      type: 'OPEN_REPOSITORY',
      repoUrl: 'https://example.com/not-a-repo',
    });
    expect(openInvalidRepoRes).toEqual({
      ok: false,
      error: 'Unsupported repository URL: https://example.com/not-a-repo',
    });
  });
});
