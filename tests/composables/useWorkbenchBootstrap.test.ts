import { mockBrowser } from '@@/tests/setup';
import { describe, expect, it } from 'vitest';
import { useWorkbenchBootstrap } from '@/composables/useWorkbenchBootstrap';

describe('composables/useWorkbenchBootstrap', () => {
  it('initializes with default explorer view and no active workspace context when query is empty', () => {
    const state = useWorkbenchBootstrap('');

    expect(state.activeView.value).toBe('explorer');
    expect(state.sidebarVisible.value).toBe(true);
    expect(state.theme.value).toBe('dark');
    expect(state.launchMode.value).toBe('tab');
    expect(state.runtimeMode.value).toBe('standalone-web');
    expect(state.hasActiveContext.value).toBe(false);
    expect(state.workspaceQuery.value).toEqual({
      workspaceId: null,
      repoUrl: null,
    });
  });

  it('activates scm view and workspace banner when initialized with repo and workspace query parameters', () => {
    const state = useWorkbenchBootstrap('?workspace=hello-world&repo=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World');

    expect(state.activeView.value).toBe('scm');
    expect(state.hasActiveContext.value).toBe(true);
    expect(state.workspaceQuery.value).toEqual({
      workspaceId: 'hello-world',
      repoUrl: 'https://github.com/octocat/Hello-World',
    });
  });

  it('switches activity views and collapses/expands sidebar when clicking the active view', () => {
    const state = useWorkbenchBootstrap('');

    state.selectActivityView('search');
    expect(state.activeView.value).toBe('search');
    expect(state.sidebarVisible.value).toBe(true);

    state.selectActivityView('search');
    expect(state.sidebarVisible.value).toBe(false);

    state.selectActivityView('search');
    expect(state.sidebarVisible.value).toBe(true);

    state.selectActivityView('extensions');
    expect(state.activeView.value).toBe('extensions');
    expect(state.sidebarVisible.value).toBe(true);
  });

  it('toggles theme between dark and light', () => {
    const state = useWorkbenchBootstrap('');
    expect(state.theme.value).toBe('dark');

    state.toggleTheme();
    expect(state.theme.value).toBe('light');

    state.toggleTheme();
    expect(state.theme.value).toBe('dark');
  });

  it('loads and toggles launch mode via runtime messaging with storage.local fallback', async () => {
    mockBrowser.runtime.sendMessage.mockResolvedValueOnce({
      ok: true,
      launchMode: 'popup',
    });

    const state = useWorkbenchBootstrap('');
    expect(await state.loadLaunchMode()).toBe('popup');
    expect(state.launchMode.value).toBe('popup');

    mockBrowser.runtime.sendMessage.mockRejectedValueOnce(new Error('Background worker asleep'));
    mockBrowser.storage.local.get.mockResolvedValueOnce({ launchMode: 'tab' });
    expect(await state.loadLaunchMode()).toBe('tab');
    expect(state.launchMode.value).toBe('tab');

    mockBrowser.runtime.sendMessage.mockResolvedValueOnce({ ok: true, launchMode: 'popup' });
    expect(await state.toggleLaunchMode()).toBe('popup');
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SET_LAUNCH_MODE',
      launchMode: 'popup',
    });

    mockBrowser.runtime.sendMessage.mockRejectedValueOnce(new Error('No listener'));
    expect(await state.toggleLaunchMode()).toBe('tab');
    expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
      launchMode: 'tab',
    });
  });
});
