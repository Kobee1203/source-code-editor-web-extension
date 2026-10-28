# Architecture & Cross-Context Messaging

This document defines the 3-Layer Clean Architecture, execution contexts, runtime & native messaging contracts, and core workflows of the **Source Code Editor Web Extension** (Manifest V3).

## Table of Contents

1. [Three-Layer Clean Architecture](#three-layer-clean-architecture)
2. [System Architecture & Execution Contexts](#system-architecture--execution-contexts)
3. [Execution Contexts Matrix](#execution-contexts-matrix)
4. [Communication Transports & Contracts](#communication-transports--contracts)
5. [Key Workflows & Sequence Diagrams](#key-workflows--sequence-diagrams)
   - [Workflow 1: Launching the Workbench (Tab vs Standalone Popup Window)](#workflow-1-launching-the-workbench-tab-vs-standalone-popup-window)
   - [Workflow 2: Opening a GitHub or GitLab Repository via Context Menu or Active Tab](#workflow-2-opening-a-github-or-gitlab-repository-via-context-menu-or-active-tab)
   - [Workflow 3: Settings Sync vs Token Security Boundary](#workflow-3-settings-sync-vs-token-security-boundary)
   - [Workflow 4: Approach B — JSON-RPC 2.0 Native Bridge to Local Companion](#workflow-4-approach-b--json-rpc-20-native-bridge-to-local-companion)

---

## Three-Layer Clean Architecture

All code in `src/` is organized into three concentric layers with strict inward-only dependencies (`Layer 3 -> Layer 2 -> Layer 1`):

```mermaid
flowchart TB
    subgraph Layer3["Layer 3 — UI Presentation & Entrypoints (src/components/, src/entrypoints/)"]
        BG["background.ts\n(Action, Shortcut, Context Menu, Tab/Popup Router)"]
        App["editor/App.vue\n(Workbench Shell: Activity Bar, Sidebar, Editor Area, Status Bar)"]
    end

    subgraph Layer2["Layer 2 — Reactive Orchestration (src/composables/)"]
        C_Boot["useWorkbenchBootstrap.ts"]
        C_Work["useWorkspace / useEditorGroups / useFileExplorer"]
        C_Scm["useGitScm / useGlobalSearch / useExtensions / useSettings"]
    end

    subgraph Layer1["Layer 1 — Pure Domain & Infrastructure (src/providers/, src/services/, src/types/) — ZERO Vue Imports"]
        FS["IFileSystemProvider\n(InMemory, ChromiumLocalFs, Opfs, NativeHostFs)"]
        GIT["IGitProvider\n(InMemory, IsomorphicGit, NativeGit)"]
        EXT["IExtensionCatalogService\n(DeclarativeExtensionCatalogService)"]
        AUTH["IAuthService\n(BrowserLocalAuthService)"]
        SYNC["ISettingsSyncService\n(BrowserSettingsSyncService)"]
        BRIDGE["INativeBridge\n(JsonRpcNativeBridge)"]
        MSG["types/messages.ts\n(Runtime contracts & URL parsers)"]
    end

    BG --> MSG
    App --> C_Boot
    App --> C_Work
    App --> C_Scm
    C_Boot --> MSG
    C_Work --> FS
    C_Scm --> GIT
    C_Scm --> EXT
    C_Scm --> AUTH
    C_Scm --> SYNC
    FS -.->|Approach B| BRIDGE
    GIT -.->|Approach B| BRIDGE
```

---

## System Architecture & Execution Contexts

The extension runs with **zero permanent content scripts** on web pages. It operates across four isolated execution contexts governed by Manifest V3 security rules:

```mermaid
flowchart LR
    subgraph BrowserUI["Browser UI & Host Pages"]
        Toolbar["Toolbar Action / Alt+Shift+E"]
        CtxMenu["Context Menu on\ngithub.com/*/* & gitlab.com/*/*"]
    end

    subgraph BackgroundSW["Background Service Worker"]
        SW["background.ts"]
    end

    subgraph WorkbenchContext["Extension Workbench Context (editor.html)"]
        WB["Vue 3 Workbench + @codingame/monaco-vscode-api"]
        Workers["Monaco & TextMate WASM Web Workers\n(script-src 'self' 'wasm-unsafe-eval')"]
        OPFS["Origin Private File System (OPFS)\n& File System Access API"]
        WB <--> Workers
        WB <--> OPFS
    end

    subgraph BrowserStorage["WebExtension Storage"]
        LocalStore["browser.storage.local / session\n(launchMode, OAuth/PAT tokens)"]
        SyncStore["browser.storage.sync\n(Sanitized EditorSettings)"]
    end

    subgraph NativeHost["Optional Local Companion (Approach B)"]
        Companion["Native Host Binary\n(Native FS, Native Git, PTY Terminal, Extension Host)"]
    end

    Toolbar --> SW
    CtxMenu --> SW
    SW -->|tabs.create / windows.create| WB
    WB <-->|browser.runtime.sendMessage| SW
    SW <--> LocalStore
    WB <--> LocalStore
    WB <--> SyncStore
    WB <-->|JSON-RPC 2.0 via connectNative| Companion
```

---

## Execution Contexts Matrix

| Context                           | Entry Point                                 | Lifecycle                                                                                          | Privileges & Capabilities                                                                                                                                                                                                                            | Constraints                                                                                                                                                                  |
| :-------------------------------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Background Service Worker**     | `src/entrypoints/background.ts`             | Event-driven (terminated when idle in MV3)                                                         | Registers declarative context menus on GitHub/GitLab, handles toolbar clicks and `open-editor` command, opens `editor.html` in a tab or popup window, manages `launchMode` in `browser.storage.local`.                                               | No DOM access. Must remain stateless across idle restarts.                                                                                                                   |
| **Workbench Page (Tab or Popup)** | `src/entrypoints/editor/index.html`         | Persistent while the editor tab or standalone popup window is open                                 | Full WebExtension APIs (`storage`, `runtime`), File System Access API (`showDirectoryPicker`), Origin Private File System (`navigator.storage.getDirectory()`), CORS-free `fetch` via `<all_urls>` host permissions, Monaco & TextMate WASM workers. | Governed by MV3 CSP (`script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'self';`). Cannot execute arbitrary remote JS extensions in `standalone-web` mode. |
| **Monaco & TextMate Workers**     | Dedicated Web Workers (`worker-src 'self'`) | Spawned by Workbench                                                                               | High-performance tokenization (`vscode-oniguruma` WASM), language services (TS/JS/CSS/HTML/JSON), and workspace indexing off the main thread.                                                                                                        | No direct DOM or `browser.*` API access.                                                                                                                                     |
| **Local Companion Native Host**   | External OS binary (`INativeBridge`)        | Spawned on demand via `browser.runtime.connectNative` when `nativeMessaging` permission is granted | Direct OS file system I/O on all browsers (including Firefox), native `git` CLI (SSH/GPG/hooks), PTY terminal, and full Node.js VS Code Extension Host.                                                                                              | Optional (`RuntimeMode = 'local-companion'`). Communicates strictly via JSON-RPC 2.0 over stdio.                                                                             |

---

## Communication Transports & Contracts

### 1. Runtime Messages (`src/types/messages.ts`)

| Message Type      | Direction                               | Request Interface                                                                                                 | Response Interface                                                                             | Description                                                                                                |
| :---------------- | :-------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| `OPEN_EDITOR`     | Workbench / UI $\rightarrow$ Background | `OpenEditorRequest`<br>`{ type: 'OPEN_EDITOR', workspaceId?: string, repoUrl?: string, launchMode?: LaunchMode }` | `RuntimeResponse`<br>`{ ok: true, launchMode: LaunchMode, tabId?: number, windowId?: number }` | Opens `editor.html` (with optional `?workspace=` or `?repo=`) in a browser tab or standalone popup window. |
| `OPEN_REPOSITORY` | UI $\rightarrow$ Background             | `OpenRepositoryRequest`<br>`{ type: 'OPEN_REPOSITORY', repoUrl: string, launchMode?: LaunchMode }`                | `RuntimeResponse`                                                                              | Validates a GitHub/GitLab repository URL and launches `editor.html?repo=<encoded>`.                        |
| `GET_LAUNCH_MODE` | Workbench $\rightarrow$ Background      | `GetLaunchModeRequest`<br>`{ type: 'GET_LAUNCH_MODE' }`                                                           | `RuntimeResponse`<br>`{ ok: true, launchMode: LaunchMode }`                                    | Reads the stored `launchMode` (`'tab'` \| `'popup'`) from `browser.storage.local`.                         |
| `SET_LAUNCH_MODE` | Workbench $\rightarrow$ Background      | `SetLaunchModeRequest`<br>`{ type: 'SET_LAUNCH_MODE', launchMode: LaunchMode }`                                   | `RuntimeResponse`<br>`{ ok: true, launchMode: LaunchMode }`                                    | Persists the user's preferred `launchMode` (`'tab'` \| `'popup'`) in `browser.storage.local`.              |

### 2. JSON-RPC 2.0 Native Bridge (`src/services/nativeBridge.ts`)

- **Transport**: `browser.runtime.connectNative(hostName)` (`Port.postMessage` / `Port.onMessage`).
- **Envelope**:
  - Request: `{ jsonrpc: '2.0', id: number | string, method: string, params?: Record<string, unknown> }`
  - Response: `{ jsonrpc: '2.0', id: number | string, result?: unknown, error?: { code: number, message: string, data?: unknown } }`
  - Notification: `{ jsonrpc: '2.0', method: string, params?: Record<string, unknown> }`

---

## Key Workflows & Sequence Diagrams

### Workflow 1: Launching the Workbench (Tab vs Standalone Popup Window)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as Browser Toolbar / Shortcut
    participant SW as background.ts
    participant Storage as browser.storage.local
    participant Target as browser.tabs / browser.windows

    User->>Browser: Click Extension Icon or press Alt+Shift+E
    Browser->>SW: action.onClicked(activeTab) / commands.onCommand('open-editor')
    SW->>SW: extractRepositoryUrlFromTabUrl(activeTab.url)
    SW->>Storage: get('launchMode')
    Storage-->>SW: 'tab' (default) or 'popup'
    alt launchMode === 'popup'
        SW->>Target: browser.windows.create({ url: editorUrl, type: 'popup', width: 1440, height: 900 })
    else launchMode === 'tab'
        SW->>Target: browser.tabs.create({ url: editorUrl })
    end
```

### Workflow 2: Opening a GitHub or GitLab Repository via Context Menu or Active Tab

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Page as GitHub / GitLab Repo Page
    participant SW as background.ts
    participant Editor as editor.html (useWorkbenchBootstrap)

    User->>Page: Right-click -> "Open repository in Source Code Editor"
    Page->>SW: contextMenus.onClicked(info, tab)
    SW->>SW: extractRepositoryUrlFromTabUrl(info.pageUrl ?? tab.url)
    SW->>Editor: Open editor.html?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo
    Editor->>Editor: parseEditorQueryParams(window.location.search)
    Editor->>Editor: Activate Repository Workspace banner & SCM context
```

### Workflow 3: Settings Sync vs Token Security Boundary

```mermaid
sequenceDiagram
    autonumber
    participant UI as Workbench UI
    participant Auth as BrowserLocalAuthService
    participant Sync as BrowserSettingsSyncService
    participant Local as browser.storage.local / session
    participant Cloud as browser.storage.sync / Gist Export

    UI->>Auth: saveToken({ provider: 'github', token: 'ghp_secret...', rememberMe: true })
    Auth->>Local: Persist under 'sce.auth.tokens' (NEVER in storage.sync)
    UI->>Sync: exportProfile() / updateSettings(...)
    Sync->>Sync: sanitizeSettingsObject() (strict allowlist of EditorSettings keys)
    Sync->>Cloud: Write sanitized EditorSettings (zero token/secret fields)
```

### Workflow 4: Approach B — JSON-RPC 2.0 Native Bridge to Local Companion

```mermaid
sequenceDiagram
    autonumber
    participant Service as Layer 1 Provider (FS / Git)
    participant Bridge as JsonRpcNativeBridge
    participant Port as browser.runtime.Port (connectNative)
    participant Host as Local Companion Binary

    Service->>Bridge: connect('io.github.kobee1203.source_code_editor')
    Bridge->>Port: browser.runtime.connectNative(hostName)
    Service->>Bridge: request('fs.readFile', { path: '/workspace/index.ts' })
    Bridge->>Port: postMessage({ jsonrpc: '2.0', id: 1, method: 'fs.readFile', params: { path: '/workspace/index.ts' } })
    Port->>Host: stdio JSON frame
    Host-->>Port: { jsonrpc: '2.0', id: 1, result: { contentBase64: '...' } }
    Port-->>Bridge: onMessage listener resolves pending Request #1
    Bridge-->>Service: Decoded result
```
