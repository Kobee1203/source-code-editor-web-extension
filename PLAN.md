# Source Code Editor — Architecture & Implementation Plan (Grill-Me Synthesis)

> **Reference Conversation**: `8903e651-726b-407e-893d-a67d2e8f583e`
> **Reference Infrastructure Repo**: `/Users/ndossantos/Developments/workspaces/source-viewer-web-extension`

This document records all **17 architectural decisions** resolved during the _Grill-Me_ design phase, the mandatory **5-Agent Development Pipeline**, and the milestone roadmap (Jalons 0 to 6).

---

## 1. Project Identity & Baseline Stack (Q1, Q2, Q13, Q17)

- **Project Path**: `/Users/ndossantos/Developments/workspaces/source-code-editor-web-extension`
- **Package / GitHub Repo Name**: `source-code-editor-web-extension` (Public GitHub repository, license `GPL-3.0-or-later`)
- **Extension Display Name**: `Source Code Editor`
- **Firefox Add-on ID (`gecko.id`)**: `source-code-editor@kobee1203.github.io`
- **Tooling & Infrastructure Reused from `source-viewer-web-extension`** (tooling only, no business code):
  - WXT (`manifestVersion: 3`, `imports: false` for explicit ES imports) + Vue 3.5 + TypeScript 6 strict
  - ESLint 10, Stylelint 17, Prettier (`@trivago/prettier-plugin-sort-imports`), Husky + `lint-staged`
  - Vitest 5 (`happy-dom`, `clearMocks: true`, `tests/setup.ts`) + Playwright E2E
  - `@wxt-dev/i18n` with multi-locale YAML files (`en` as canonical source)
  - Store automation scripts (`scripts/generate-screenshots.ts`, `generate-demo-video.ts`, `check-store-metadata.ts`, `sync-store-descriptions.ts`)
  - GitHub Actions workflows (`.github/workflows/validate.yml` and `release.yml` with `wxt submit` for Chrome, Firefox, and Edge)
- **Browser Entrypoints & Launch Modes (Q2)**:
  1. Clicking the extension toolbar icon (or global shortcut) opens `editor.html` in a dedicated browser tab **or** a standalone `popup` window (`browser.windows.create({ type: 'popup' })`, configurable in settings so shortcuts like `Ctrl+W`/`Cmd+W` can be captured).
  2. Context menu / action on GitHub or GitLab repository pages: _"Open repository in Source Code Editor"_.
  3. **Zero permanent content scripts** injected across arbitrary web pages.

---

## 2. Core Architecture: 3-Layer Clean Architecture + `@codingame/monaco-vscode-api` (Q3, Q8, Q14, Q15)

### 2.1 Three-Layer Separation (`src/`)

1. **Layer 1 — Domain & Infrastructure (`src/providers/` & `src/services/`)**:
   - Pure TypeScript modules and classes with **zero Vue dependencies**, unit-testable in milliseconds:
     - `IFileSystemProvider`: `ChromiumLocalFsProvider` (File System Access API `showDirectoryPicker`), `OpfsProvider` (Origin Private File System), and future `NativeHostFsProvider` (Approach B).
     - `IGitProvider`: `IsomorphicGitProvider` (HTTPS + OPFS/Local FS) and future `NativeGitProvider` (Approach B: native `git` with SSH/GPG/hooks).
     - `IExtensionCatalogService`: Built-in lazy-loaded language extensions + dynamic OpenVSX declarative extension installer (themes, icon packs, TextMate grammars, snippets, keymaps) + future Native Extension Host (Approach B).
     - `ISettingsSyncService` & `IAuthService`: `browser.storage.sync` + OAuth/PAT for GitHub & GitLab + Secret Gist / Private Snippet synchronization.
     - `INativeBridge`: Abstract **JSON-RPC 2.0** client over `browser.runtime.connectNative` (`optional_permissions: ['nativeMessaging']`).
2. **Layer 2 — Reactive Orchestration (`src/composables/`)**:
   - Modular Vue 3 composables (`useWorkspace`, `useEditorGroups`, `useFileExplorer`, `useGitScm`, `useGlobalSearch`, `useExtensions`, `useSettings`) bridging reactive state to Layer 1 services.
3. **Layer 3 — UI Presentation (`src/components/`)**:
   - Domain-scoped Vue 3 components: `workbench/`, `editor/`, `explorer/`, `search/`, `scm/`, `extensions/`, `settings/`, `welcome/`, `common/`.

### 2.2 Monaco & VS Code API Strategy (Q3, Q8)

- Use **`@codingame/monaco-vscode-api` (`38.0.4`) in Full Workbench Mode (`getWorkbenchServiceOverride`)** identical to the official CodinGame workbench demo (`demo/src/setup.workbench.classic.ts`):
  - Do NOT mix `getViewsServiceOverride` with `getWorkbenchServiceOverride`: `getWorkbenchServiceOverride` natively manages the full VS Code window layout (`BrowserWindow`, Activity Bar, Sidebar, Editor Groups, Bottom Panel, Status Bar, Title Bar, and Menus) within a single root container element (`#workbenchHost`).
  - **Workspace & File Explorer Initialization**:
    - Use `RegisteredFileSystemProvider(false)` and `RegisteredMemoryFile` from `@codingame/monaco-vscode-files-service-override` to register the virtual workspace file (`/workspace.code-workspace`) and initial workspace files (`/workspace/src/index.ts`, `/workspace/package.json`, `/workspace/README.md`).
    - Register the provider with `registerFileSystemOverlay(1, fileSystemProvider)`.
    - Provide `workspaceProvider` in `IWorkbenchConstructionOptions` pointing to `workspace: { workspaceUri: vscode.Uri.file('/workspace.code-workspace') }`.
    - Configure `defaultLayout.editors` in construction options so `/workspace/src/index.ts` is open on initial boot.
  - **File Icon Themes & Declarative Extensions**:
    - Include `@codingame/monaco-vscode-theme-seti-default-extension` and configure `workbench.iconTheme: "vs-seti"` so the Explorer tree displays real file type icons (`.ts`, `.json`, `.md`, directories, etc.).
    - Include theme defaults (`@codingame/monaco-vscode-theme-defaults-default-extension`) with `workbench.colorTheme: "Default Dark Modern"`.
    - Include language extensions (`typescript-basics`, `javascript`, `json`, `html`, `css`, `markdown-basics`, `yaml`, `python`, `rust`, `go`, `shellscript`).
  - **Web Workers & Manifest V3 CSP**:
    - In `wxt.config.ts`, configure `worker-src 'self' blob: http://localhost:3000 http://127.0.0.1:3000;` in development mode, and `worker-src 'self';` in production mode (since Chrome MV3 disallows `blob:` in production extension page CSP; bundled module workers are served from `'self'`).
    - Wire `MonacoEnvironment` without unhandled CSP violations.
  - **Canonical Patch**:
    - Use canonical `pnpm patch` on `@codingame/monaco-vscode-api@38.0.4` (`vs/base/browser/dom.js`) to replace `mainWindow.Function(...)` with an IIFE for strict Manifest V3 Content Security Policy compliance.
  - **Vue 3 WebExtension Host Shell**:
    - Vue 3 serves as the clean, full-bleed (`100vw` × `100vh`) application host in `App.vue`: `#workbenchHost` mounts the native VS Code workbench directly across the entire viewport without custom outer headers or duplicate navigation bars, matching the official CodinGame Full Workbench demo experience.
  - **Native Service Overrides Ecosystem**:
    - In addition to `workbench`, `files`, and `model`, the workbench integrates:
      - `@codingame/monaco-vscode-view-title-bar-service-override` (native top title bar & menus)
      - `@codingame/monaco-vscode-explorer-service-override` (Explorer view container)
      - `@codingame/monaco-vscode-outline-service-override` & `@codingame/monaco-vscode-timeline-service-override` (Explorer secondary viewlets)
      - `@codingame/monaco-vscode-search-service-override` (Find in workspace)
      - `@codingame/monaco-vscode-scm-service-override` (Source control view slot)
      - `@codingame/monaco-vscode-debug-service-override` (Run & Debug view slot)
      - `@codingame/monaco-vscode-testing-service-override` (Testing view slot)
      - `@codingame/monaco-vscode-extensions-service-override` (Extensions view slot with `enableWorkerExtensionHost: false` via `vscode/localExtensionHost`)
      - `@codingame/monaco-vscode-preferences-service-override` (Settings editor & keybindings)
      - `@codingame/monaco-vscode-quickaccess-service-override` (Command palette & quick pick)
      - `@codingame/monaco-vscode-view-status-bar-service-override` (native status bar)
      - `@codingame/monaco-vscode-snippets-service-override` (language snippets)
  - **Web Workers & Manifest V3 CSP**:
    - Extension workers are compiled as dedicated WXT unlisted scripts (`src/entrypoints/monaco-editor.worker.ts` and `src/entrypoints/monaco-textmate.worker.ts`) and loaded via `browser.runtime.getURL(...)` as `'self'`. This complies strictly with Chrome MV3 CSP (`worker-src 'self';`) and eliminates renderer crashes (`RESULT_CODE_KILLED_BAD_MESSAGE`).
  - **Milestone Boundaries**:
    - **Jalon 1 (Current)**: Full-bleed VS Code Workbench layout matching CodinGame demo with in-memory seeded workspace files (`/workspace/src/index.ts`, `package.json`, `README.md`), native theme picker (⚙️ -> Themes -> Color Theme) with all default themes (`Light Modern`, `Dark Modern`, `Dark+`, `Light+`), full TextMate syntax highlighting for TS/JS/JSON/HTML/CSS/MD/YAML/Python/Rust/Go/Shell, full Activity Bar with Explorer (Outline & Timeline), Search, SCM, Debug, Extensions, Testing, Settings gear, context menus, and native quick access/command palette.
    - **Jalon 2**: File System Access API & OPFS (`ChromiumLocalFsProvider`, `OpfsProvider`, Open Folder dialog, real disk persistence).
    - **Jalon 3**: Real Git SCM backend (`IsomorphicGitProvider`, GitHub/GitLab clone, stage/commit/diff).
    - **Jalon 4**: Settings persistence & sync.
    - **Jalon 5**: OpenVSX live marketplace extension search & download.
    - **Jalon 6**: Native Companion Host.
    - E2E tests must NOT merely check `.toBeAttached()` on generic containers: they must assert functional rendering:
      1. Zero console errors (`console.error` and `pageerror`).
      2. Zero CSP violations (`EvalError`, `worker-src`).
      3. Active editor tab visible with file title and breadcrumbs.
      4. Explorer sidebar populated with directory tree nodes and file items.
      5. Activity Bar icons visible with proper tooltips.
      6. Status Bar visible with line/col, encoding, and language mode.
      7. Color theme switching cascading to all native workbench parts without style desync.

---

## 3. File System, Git, Workbench & Security Decisions (Q4, Q5, Q6, Q9, Q10, Q11, Q16)

- **Remote Git Repositories (Q4)**: Shallow clone (`depth: 1` by default, configurable) into **OPFS** via `isomorphic-git`, enabling full offline editing, instant multi-file search, branches, side-by-side diffs, commits, and HTTPS push (CORS-free via extension `host_permissions`).
- **Firefox Local Folder Fallback in Approach A (Q9)**: Import local directory into **OPFS** via `webkitdirectory` / Drag & Drop, allowing full editing, direct Git commit/push, and `.zip` export, with a non-intrusive banner explaining that direct disk write on Firefox requires either Git push/ZIP export or the optional companion app (Approach B).
- **File Saving Strategy (Q10)**: Manual `Ctrl+S` / `Cmd+S` by default with dirty indicator (`●`) and automatic session draft backup, plus configurable `files.autoSave` (`off`, `afterDelay`, `onFocusChange`).
- **Welcome View & Multi-Workspaces (Q11)**: Welcome screen with _Open Local Folder_, _Clone / Open Remote Repository_, and _Recent Workspaces_ (persisted in IndexedDB). Multi-workspace support via URL parameter (`editor.html?workspace=<id>`).
- **Workbench Layout (Q6)**:
  - **Activity Bar (4 views)**: File Explorer, Global Search (`Ctrl+Shift+F`), Git Source Control (with side-by-side Monaco Diff Editor), Extensions (OpenVSX).
  - **Central Editor Area**: Multi-tab editor groups, horizontal/vertical split-view, breadcrumbs, Command Palette (`Ctrl+Shift+P` / `F1`), dual UI/JSON Settings & Keybindings editor.
  - **Collapsible Bottom Panel**: Problems (diagnostics), Output / Git Logs, and Terminal slot.
  - **Status Bar**: Git branch, sync status, diagnostics count, cursor/encoding/indentation/language, and active runtime mode (Standalone Web vs Local Companion).
- **Token Security (Q16)**: OAuth and Personal Access Tokens are stored **exclusively** in `browser.storage.local` (or `browser.storage.session`) and are strictly excluded from `browser.storage.sync` and Gist/Snippet exports.

---

## 4. Mandatory 5-Agent Development Pipeline (Q12)

Every milestone and feature MUST execute through this 5-step pipeline (documented in `AGENTS.md` and `docs/agents/workflow.md`):

1. **Agent 1 — Planner (`grill-me` + Plan / ADR)**: Resolves all design ambiguities with the user, updates `CONTEXT.md` / `docs/adr/`, and produces the implementation spec.
2. **Agent 2 — Developer (`ide-developer` subagent)**: Reads `AGENTS.md`, `docs/agents/coding-guidelines.md`, and `docs/agents/architecture.md`; implements production code on a dedicated feature branch.
3. **Agent 3 — QA Tester (`ide-tester` subagent)**: Reads `docs/agents/testing.md`; writes unit, integration, and E2E tests and runs `pnpm test`, `pnpm compile`, and `pnpm test:e2e`.
4. **Agent 4 — Reviewer (`ide-reviewer` subagent)**: Audits the diff against `AGENTS.md` and `docs/agents/*.md`, checking architecture boundaries, DRY, KISS, strict typing (no `any`/`as`), and runs `pnpm lint`, `pnpm lint:css`, `pnpm format:check`, `pnpm compile`, `pnpm test`. Loops back to Agent 2 & Agent 3 if any improvements are needed.
5. **Agent 5 — PR Creator (`ide-pr-creator` subagent)**: Commits with Conventional Commits in English, pushes the branch, and creates the GitHub Pull Request via `gh pr create`.

---

## 5. Milestones Roadmap (Q7)

- **Jalon 0 — Bootstrap, AI Documentation & Core Contracts (First PR)**:
  - Initialize repo and public GitHub repository `source-code-editor-web-extension`.
  - Set up WXT, Vue 3, `@codingame/monaco-vscode-api`, TypeScript strict, ESLint, Stylelint, Prettier, Husky, Vitest, Playwright, `@wxt-dev/i18n`, store scripts, and GitHub Actions workflows (`validate.yml`, `release.yml`).
  - Write `AGENTS.md`, `CONTEXT.md`, `docs/adr/0001-architecture-and-providers.md`, and `docs/agents/*` (`workflow.md`, `coding-guidelines.md`, `architecture.md`, `testing.md`, `release-process.md`, `domain.md`, `issue-tracker.md`, `triage-labels.md`).
  - Implement Layer 1 contracts (`IFileSystemProvider`, `IGitProvider`, `IExtensionCatalogService`, `ISettingsSyncService`, `INativeBridge`) + minimal `background.ts` and `editor` entrypoint with unit, integration, and E2E tests.
- **Jalon 1**: Workbench Layout & Monaco Editor / VS Code Services Integration.
- **Jalon 2**: File System Providers (`ChromiumLocalFsProvider` & `OpfsProvider`), File Explorer & Global Search.
- **Jalon 3**: Git Engine (`IsomorphicGitProvider`), GitHub/GitLab Auth & Source Control / Diff View.
- **Jalon 4**: Settings UI/JSON, Keybindings Editor & Settings Sync (`storage.sync` + Secret Gist/Snippet).
- **Jalon 5**: OpenVSX Extension Catalog & Declarative Extension Installer.
- **Jalon 6**: Approach B — Local Companion Binary (`Native Messaging` JSON-RPC 2.0) for Firefox direct disk I/O, native Git SSH/GPG, integrated Terminal, and full Node.js Extension Host.
