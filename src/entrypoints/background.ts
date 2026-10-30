import { browser } from 'wxt/browser';
import { defineBackground } from '#imports';
import {
  type RuntimeResponse,
  buildEditorPath,
  extractRepositoryUrlFromTabUrl,
  isRuntimeMessage,
} from '@/types/messages';
import { t } from '@/utils/i18n';

export const CONTEXT_MENU_OPEN_REPO_ID = 'open-repo-in-editor';
export const COMMAND_OPEN_EDITOR_ID = 'open-editor';

export default defineBackground(() => {
  async function launchEditorWorkbench(options?: { workspaceId?: string; repoUrl?: string }): Promise<RuntimeResponse> {
    const editorPath = buildEditorPath({
      workspaceId: options?.workspaceId,
      repoUrl: options?.repoUrl,
    });
    const editorUrl = browser.runtime.getURL('/editor.html') + editorPath.slice('/editor.html'.length);
    const createdTab = await browser.tabs.create({ url: editorUrl });
    return {
      ok: true,
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
        });
      }
    }
  });
});
