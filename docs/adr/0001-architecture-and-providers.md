# ADR-0001: 3-Layer Clean Architecture, Granular VS Code Services, and Dual-Runtime Providers

- **Status**: Accepted
- **Date**: 2026-10-28

---

## Context

We are building **Source Code Editor**, a multi-browser WebExtension (Chrome, Firefox, Edge — Manifest V3) providing a full VS Code-inspired IDE inside the browser. We must satisfy six competing constraints:

1. **Testability & Maintainability**: Complex IDE subsystems (File Systems, Git, Extension Catalog, Settings Sync, Auth, Native Messaging) must be unit-testable in milliseconds without mounting Vue components or spinning up a browser.
2. **UI Flexibility & Bundle Control**: We need VS Code's TextMate syntax highlighting, theme service, configuration service, keybindings, and language intelligence (`@codingame/monaco-vscode-api`), while keeping complete ownership of our custom Vue 3 Workbench UI and avoiding the heavy, rigid `workbench-service-override`.
3. **Manifest V3 Content Security Policy (CSP)**: Monaco Web Workers and `vscode-oniguruma` (WASM) must run inside extension pages without violating MV3 CSP rules.
4. **Web Store Compliance (Chrome Web Store & Firefox AMO Anti-RCE)**: Browser stores strictly forbid executing remotely hosted JavaScript code inside an extension context.
5. **Cross-Browser File System & Git Parity**: Chromium supports direct read/write disk access via `showDirectoryPicker` (File System Access API), whereas Firefox only supports directory import (`webkitdirectory` / Drag & Drop) and Origin Private File System (OPFS) unless paired with a native host.
6. **Secret & Token Isolation**: OAuth and Personal Access Tokens (PATs) for GitHub and GitLab must never leak into `browser.storage.sync` or exported Gists/Snippets.

---

## Decisions

### 1. Three-Layer Clean Architecture (`src/`)

We enforce a strict three-layer dependency rule (`Layer 3 -> Layer 2 -> Layer 1`):

- **Layer 1 — Domain & Infrastructure (`src/providers/`, `src/services/`, `src/types/`)**:
  - Pure TypeScript interfaces and classes with **zero `vue` imports**.
  - Defines `IFileSystemProvider`, `IGitProvider`, `IExtensionCatalogService`, `IAuthService`, `ISettingsSyncService`, and `INativeBridge`.
- **Layer 2 — Reactive Orchestration (`src/composables/`)**:
  - Modular Vue 3 composables (`useWorkbenchBootstrap`, `useWorkspace`, `useEditorGroups`, `useFileExplorer`, `useGitScm`, `useGlobalSearch`, `useExtensions`, `useSettings`) that adapt Layer 1 services into reactive refs and computed properties.
- **Layer 3 — UI Presentation & Entrypoints (`src/components/`, `src/entrypoints/`)**:
  - Domain-scoped Vue 3 components (`workbench/`, `editor/`, `explorer/`, `search/`, `scm/`, `extensions/`, `settings/`, `welcome/`, `common/`) and WXT entrypoints (`background.ts`, `editor/`).

### 2. Granular `@codingame/monaco-vscode-api` Service Overrides & MV3 CSP

- We integrate `@codingame/monaco-vscode-api` using **granular service overrides** (`textmate`, `theme`, `languages`, `configuration`, `keybindings`, `extensions`) inside our custom Vue 3 Workbench.
- Extension pages declare the Manifest V3 Content Security Policy:
  ```json
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'self';"
  }
  ```
  This enables `vscode-oniguruma` WASM compilation and dedicated Monaco Web Workers (`worker-src 'self'`).

### 3. Pluggable File System & Git Providers (Approach A vs Approach B)

- **File System (`IFileSystemProvider`)**:
  - `InMemoryFileSystemProvider`: Deterministic in-memory VFS for fast unit tests and ephemeral scratch workspaces.
  - `ChromiumLocalFsProvider`: Direct read/write disk access on Chromium/Edge via File System Access API (`showDirectoryPicker`).
  - `OpfsProvider`: Origin Private File System backend used for remote Git clones across all browsers and local directory imports on Firefox (`webkitdirectory` / Drag & Drop + `.zip` export).
  - `NativeHostFsProvider` (Approach B): Full local disk I/O across all browsers (including Firefox) via `INativeBridge`.
- **Git (`IGitProvider`)**:
  - `InMemoryGitProvider`: Deterministic in-memory Git implementation for unit testing and contract verification.
  - `IsomorphicGitProvider` (Approach A): Pure Web Git engine backed by `OpfsProvider` / `ChromiumLocalFsProvider` performing shallow clones (`depth: 1` by default), branching, staging, commits, side-by-side diffs, and CORS-free HTTPS push via extension `host_permissions`.
  - `NativeGitProvider` (Approach B): Delegates to the system `git` binary over `INativeBridge` for SSH remotes, GPG commit signing, and local Git hooks.

### 4. Store-Compliant Declarative Extension Catalog

- Built-in language grammars and workers (`@codingame/monaco-vscode-*-default-extension`) are pre-bundled at build time as lazy-loaded chunks.
- In `standalone-web` mode (`RuntimeMode = 'standalone-web'`), `DeclarativeExtensionCatalogService` queries OpenVSX and only allows installing extensions whose contributions are strictly declarative (`themes`, `iconThemes`, `grammars`, `snippets`, `keybindings`, `languages`). Any extension requiring arbitrary JS/Node execution (`runtime` contribution) is rejected in `standalone-web` mode and reserved for the Local Companion's Extension Host (`local-companion` mode).

### 5. Token Security & Settings Sync Boundary

- `BrowserLocalAuthService` stores GitHub and GitLab OAuth/PAT credentials **exclusively** in `browser.storage.local` (when `rememberMe` is true) or `browser.storage.session` (ephemeral session).
- `BrowserSettingsSyncService` persists non-sensitive `EditorSettings` in `browser.storage.sync` (with fallback to `browser.storage.local`) and runs a strict allowlist sanitizer on every export/import payload so credentials can never leak into `storage.sync` or Gist/Snippet backups.

### 6. JSON-RPC 2.0 Native Bridge (`INativeBridge`)

- Communication with the optional Local Companion binary uses **JSON-RPC 2.0** (`JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcNotification`) over `browser.runtime.connectNative` gated behind `optional_permissions: ['nativeMessaging']`.

---

## Consequences

- **Positive**:
  - Layer 1 providers and services can be tested exhaustively in Vitest in milliseconds without DOM/Vue overhead.
  - Full compliance with Chrome Web Store, Firefox AMO, and Microsoft Edge Add-ons remote-code policies.
  - Seamless progressive enhancement from `standalone-web` (zero external install) to `local-companion` (native disk, native Git, integrated terminal, Node Extension Host).
- **Trade-offs**:
  - Firefox users in `standalone-web` mode edit imported folders inside OPFS and export changes via Git push or `.zip` download unless they install the optional Local Companion binary.
