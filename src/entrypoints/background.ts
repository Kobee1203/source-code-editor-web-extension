import { browser } from 'wxt/browser';
import { defineBackground } from '#imports';
import {
  type LaunchMode,
  type RuntimeResponse,
  buildEditorPath,
  extractRepositoryUrlFromTabUrl,
  isLaunchMode,
  isRuntimeMessage,
} from '@/types/messages';
import { t } from '@/utils/i18n';

export const CONTEXT_MENU_OPEN_REPO_ID = 'open-repo-in-editor';
export const COMMAND_OPEN_EDITOR_ID = 'open-editor';
export const LAUNCH_MODE_STORAGE_KEY = 'launchMode';

const POPUP_WINDOW_WIDTH = 1440;
const POPUP_WINDOW_HEIGHT = 900;

export default defineBackground(() => {
  async function getStoredLaunchMode(): Promise<LaunchMode> {
    const stored = await browser.storage.local.get(LAUNCH_MODE_STORAGE_KEY);
    const raw = stored[LAUNCH_MODE_STORAGE_KEY];
    return isLaunchMode(raw) ? raw : 'tab';
  }

  async function setStoredLaunchMode(launchMode: LaunchMode): Promise<LaunchMode> {
    await browser.storage.local.set({ [LAUNCH_MODE_STORAGE_KEY]: launchMode });
    return launchMode;
  }

  async function launchEditorWorkbench(options?: {
    workspaceId?: string;
    repoUrl?: string;
    launchMode?: LaunchMode;
  }): Promise<RuntimeResponse> {
    const mode = options?.launchMode ?? (await getStoredLaunchMode());
    const editorPath = buildEditorPath({
      workspaceId: options?.workspaceId,
      repoUrl: options?.repoUrl,
    });
    const editorUrl = browser.runtime.getURL('/editor.html') + editorPath.slice('/editor.html'.length);

    if (mode === 'popup' && browser.windows?.create) {
      const createdWindow = await browser.windows.create({
        url: editorUrl,
        type: 'popup',
        width: POPUP_WINDOW_WIDTH,
        height: POPUP_WINDOW_HEIGHT,
      });
      return {
        ok: true,
        launchMode: 'popup',
        windowId: createdWindow?.id,
        editorUrl,
      };
    }

    const createdTab = await browser.tabs.create({ url: editorUrl });
    return {
      ok: true,
      launchMode: 'tab',
      tabId: createdTab.id,
      editorUrl,
    };
  }

  async function registerContextMenus(): Promise<void> {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: CONTEXT_MENU_OPEN_REPO_ID,
      title: t('contextMenuOpenRepo'),
      contexts: ['page', 'link'],
      documentUrlPatterns: ['https://github.com/*/*', 'https://gitlab.com/*/*'],
    });
  }

  browser.runtime.onInstalled.addListener(() => {
    void registerContextMenus();
  });

  browser.action.onClicked.addListener((tab) => {
    const repoUrl = extractRepositoryUrlFromTabUrl(tab.url) ?? undefined;
    void launchEditorWorkbench({ repoUrl });
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === COMMAND_OPEN_EDITOR_ID) {
      const repoUrl = extractRepositoryUrlFromTabUrl(tab?.url) ?? undefined;
      void launchEditorWorkbench({ repoUrl });
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_OPEN_REPO_ID) {
      return;
    }
    const candidateUrl = info.linkUrl ?? info.pageUrl ?? tab?.url;
    const repoUrl = extractRepositoryUrlFromTabUrl(candidateUrl) ?? undefined;
    void launchEditorWorkbench({ repoUrl });
  });

  browser.runtime.onMessage.addListener((rawMessage: unknown): Promise<RuntimeResponse> | undefined => {
    if (!isRuntimeMessage(rawMessage)) {
      return undefined;
    }

    switch (rawMessage.type) {
      case 'OPEN_EDITOR':
        return launchEditorWorkbench({
          workspaceId: rawMessage.workspaceId,
          repoUrl: rawMessage.repoUrl,
          launchMode: rawMessage.launchMode,
        });

      case 'OPEN_REPOSITORY': {
        const normalizedRepo = extractRepositoryUrlFromTabUrl(rawMessage.repoUrl);
        if (!normalizedRepo) {
          return Promise.resolve({
            ok: false,
            error: `Unsupported repository URL: ${rawMessage.repoUrl}`,
          });
        }
        return launchEditorWorkbench({
          repoUrl: normalizedRepo,
          launchMode: rawMessage.launchMode,
        });
      }

      case 'GET_LAUNCH_MODE':
        return getStoredLaunchMode().then((launchMode) => ({
          ok: true,
          launchMode,
        }));

      case 'SET_LAUNCH_MODE':
        return setStoredLaunchMode(rawMessage.launchMode).then((launchMode) => ({
          ok: true,
          launchMode,
        }));
    }
  });
});
