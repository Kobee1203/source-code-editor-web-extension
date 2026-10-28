import { type ComputedRef, type Ref, computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { ThemeMode } from '@/services/settingsSync';
import {
  type LaunchMode,
  type RuntimeMode,
  type WorkspaceQuery,
  isLaunchMode,
  parseEditorQueryParams,
} from '@/types/messages';

export type WorkbenchActivityView = 'explorer' | 'search' | 'scm' | 'extensions';

export interface WorkbenchBootstrapState {
  activeView: Ref<WorkbenchActivityView>;
  sidebarVisible: Ref<boolean>;
  theme: Ref<ThemeMode>;
  launchMode: Ref<LaunchMode>;
  runtimeMode: Ref<RuntimeMode>;
  workspaceQuery: Ref<WorkspaceQuery>;
  hasActiveContext: ComputedRef<boolean>;
  selectActivityView: (view: WorkbenchActivityView) => void;
  toggleTheme: () => void;
  toggleLaunchMode: () => Promise<LaunchMode>;
  loadLaunchMode: () => Promise<LaunchMode>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function useWorkbenchBootstrap(initialSearch?: string): WorkbenchBootstrapState {
  const searchString = initialSearch ?? (typeof window !== 'undefined' ? window.location.search : '');
  const parsedQuery = parseEditorQueryParams(searchString);

  const activeView = ref<WorkbenchActivityView>(parsedQuery.repoUrl ? 'scm' : 'explorer');
  const sidebarVisible = ref<boolean>(true);
  const theme = ref<ThemeMode>('dark');
  const launchMode = ref<LaunchMode>('tab');
  const runtimeMode = ref<RuntimeMode>('standalone-web');
  const workspaceQuery = ref<WorkspaceQuery>(parsedQuery);

  const hasActiveContext = computed<boolean>(() =>
    Boolean(workspaceQuery.value.workspaceId || workspaceQuery.value.repoUrl),
  );

  function selectActivityView(view: WorkbenchActivityView): void {
    if (activeView.value === view && sidebarVisible.value) {
      sidebarVisible.value = false;
      return;
    }
    activeView.value = view;
    sidebarVisible.value = true;
  }

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  async function loadLaunchMode(): Promise<LaunchMode> {
    try {
      const response: unknown = await browser.runtime.sendMessage({ type: 'GET_LAUNCH_MODE' });
      if (isRecord(response) && response.ok === true && isLaunchMode(response.launchMode)) {
        launchMode.value = response.launchMode;
        return response.launchMode;
      }
    } catch {
      // Fallback to storage.local if background listener is not active
    }

    const stored = await browser.storage.local.get('launchMode');
    if (isLaunchMode(stored.launchMode)) {
      launchMode.value = stored.launchMode;
    }
    return launchMode.value;
  }

  async function toggleLaunchMode(): Promise<LaunchMode> {
    const nextMode: LaunchMode = launchMode.value === 'tab' ? 'popup' : 'tab';
    launchMode.value = nextMode;

    try {
      await browser.runtime.sendMessage({
        type: 'SET_LAUNCH_MODE',
        launchMode: nextMode,
      });
    } catch {
      await browser.storage.local.set({ launchMode: nextMode });
    }

    return nextMode;
  }

  return {
    activeView,
    sidebarVisible,
    theme,
    launchMode,
    runtimeMode,
    workspaceQuery,
    hasActiveContext,
    selectActivityView,
    toggleTheme,
    toggleLaunchMode,
    loadLaunchMode,
  };
}
