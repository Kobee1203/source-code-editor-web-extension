import { beforeEach, vi } from 'vitest';
import type { RuntimeResponse } from '@/types/messages';

export interface MockTabInfo {
  id?: number;
  url?: string;
}

export interface MockContextClickInfo {
  menuItemId: string | number;
  linkUrl?: string;
  pageUrl?: string;
  editable?: boolean;
}

export type OnInstalledListener = () => void;
export type OnActionClickedListener = (tab: MockTabInfo) => void;
export type OnCommandListener = (command: string, tab?: MockTabInfo) => void;
export type OnContextMenuClickedListener = (info: MockContextClickInfo, tab?: MockTabInfo) => void;
export type OnMessageListener = (message: unknown) => Promise<RuntimeResponse> | undefined;

export interface RegisteredListeners {
  onInstalled: OnInstalledListener[];
  onActionClicked: OnActionClickedListener[];
  onCommand: OnCommandListener[];
  onContextMenuClicked: OnContextMenuClickedListener[];
  onMessage: OnMessageListener[];
}

export const registeredListeners: RegisteredListeners = {
  onInstalled: [],
  onActionClicked: [],
  onCommand: [],
  onContextMenuClicked: [],
  onMessage: [],
};

export const mockBrowser = {
  runtime: {
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://dummy-id${path}`),
    connectNative: vi.fn(),
    onMessage: {
      addListener: vi.fn((listener: OnMessageListener) => {
        registeredListeners.onMessage.push(listener);
      }),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn((listener: OnInstalledListener) => {
        registeredListeners.onInstalled.push(listener);
      }),
    },
  },
  action: {
    onClicked: {
      addListener: vi.fn((listener: OnActionClickedListener) => {
        registeredListeners.onActionClicked.push(listener);
      }),
    },
  },
  commands: {
    onCommand: {
      addListener: vi.fn((listener: OnCommandListener) => {
        registeredListeners.onCommand.push(listener);
      }),
    },
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  contextMenus: {
    create: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    removeAll: vi.fn().mockResolvedValue(undefined),
    onClicked: {
      addListener: vi.fn((listener: OnContextMenuClickedListener) => {
        registeredListeners.onContextMenuClicked.push(listener);
      }),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    get: vi.fn().mockResolvedValue({ id: 1 }),
    onRemoved: {
      addListener: vi.fn(),
    },
    onUpdated: {
      addListener: vi.fn(),
    },
  },
  windows: {
    create: vi.fn().mockResolvedValue({ id: 100 }),
  },
};

vi.mock('wxt/browser', () => ({
  browser: mockBrowser,
}));

vi.mock('#imports', () => ({
  defineBackground: (fn: () => void) => ({ main: fn }),
}));

vi.mock('#i18n', () => ({
  i18n: {
    t: (key: string, substitutions?: unknown[]) =>
      substitutions && substitutions.length > 0 ? `${key}:${substitutions.join(',')}` : key,
  },
}));

beforeEach(() => {
  registeredListeners.onInstalled.length = 0;
  registeredListeners.onActionClicked.length = 0;
  registeredListeners.onCommand.length = 0;
  registeredListeners.onContextMenuClicked.length = 0;
  registeredListeners.onMessage.length = 0;

  mockBrowser.runtime.getURL.mockImplementation((path: string) => `chrome-extension://dummy-id${path}`);
  mockBrowser.storage.local.get.mockResolvedValue({});
  mockBrowser.storage.local.set.mockResolvedValue(undefined);
  mockBrowser.storage.session.get.mockResolvedValue({});
  mockBrowser.storage.session.set.mockResolvedValue(undefined);
  mockBrowser.storage.sync.get.mockResolvedValue({});
  mockBrowser.storage.sync.set.mockResolvedValue(undefined);
  mockBrowser.contextMenus.removeAll.mockResolvedValue(undefined);
  mockBrowser.tabs.create.mockResolvedValue({ id: 1 });
  mockBrowser.windows.create.mockResolvedValue({ id: 100 });
});
