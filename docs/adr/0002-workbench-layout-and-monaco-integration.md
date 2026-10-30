# ADR-0002: Workbench Layout Decomposition, Editor Groups State Machine, and `@codingame/monaco-vscode-api` Adapter

- **Status**: Accepted
- **Date**: 2026-10-28

---

## Context

In **Jalon 1 (Workbench Layout & Monaco Editor / VS Code Services Integration)**, we evolve the bootstrap shell from Jalon 0 into a full, modular VS Code-inspired Workbench hosted in `editor.html`. We must satisfy five core requirements:

1. **Strict 3-Layer Clean Architecture**:
   - All domain models, editor group state transitions, language detection, command registry filtering, and `@codingame/monaco-vscode-api` lifecycle management must live in **Layer 1 (`src/services/`, `src/types/`)** with **zero `vue` imports**.
   - **Layer 2 (`src/composables/`)** must expose clean reactive state and actions to **Layer 3 (`src/components/`)**.
2. **Multi-Tab Editor Groups & Split-View**:
   - Users need multi-tab editing with dirty state indicators (`●`), manual save (`Ctrl+S` / `Cmd+S`), configurable auto-save (`off`, `afterDelay`, `onFocusChange`), file path breadcrumbs, side-by-side diff tabs, and horizontal/vertical editor group splitting (`single`, `split-horizontal`, `split-vertical`).
3. **Native `@codingame/monaco-vscode-api` & VS Code Services Integration**:
   - We integrate the complete `@codingame/monaco-vscode-api@38.0.4` ecosystem (`monaco-editor@npm:@codingame/monaco-vscode-editor-api@38.0.4`, `vscode@npm:@codingame/monaco-vscode-extension-api@38.0.4`) with:
     - Granular service overrides: `configuration`, `keybindings`, `languages`, `localization`, `model`, `textmate`, and `theme` (on top of the built-in `base`, `host`, `layout`, `environment`, `extensions`, `files`, and `quickaccess` overrides).
     - Default declarative VS Code extensions: `theme-defaults`, `typescript-basics`, `javascript`, `json`, `html`, `css`, `markdown-basics`, `yaml`, `python`, `rust`, `go`, and `shellscript`.
     - Localization packs (`@codingame/monaco-vscode-language-pack-de`, `es`, `fr`, `it`, `ja`, `pt-br`, `zh-hans`) dynamically loaded according to the browser UI locale before `initialize()`.
     - Web Workers (`editorWorkerService`, `TextMateWorker`, `extensionHostWorkerMain`) via `MonacoEnvironment.getWorker`.
     - Build-time `.vsix` bundling support via `@codingame/monaco-vscode-rollup-vsix-plugin` in `wxt.config.ts`.
     - Live editor diagnostics (`IMarkerService.onMarkerChanged`) routed to the Workbench Bottom Panel's _Problems_ tab.
     - Clean dependency injection (`IMonacoEngineAdapter` defaulting to `NativeMonacoEngineAdapter`) so production code has zero test-specific branches while remaining 100% unit-testable in Vitest (`happy-dom`).
4. **Command Palette & Collapsible Bottom Panel**:
   - A keyboard-driven Command Palette (`Ctrl+Shift+P` / `F1`) must fuzzy-search and execute registered Workbench commands.
   - A collapsible Bottom Panel (`Ctrl+J`) must host **Problems** (diagnostics), **Output / Git Logs**, and **Terminal** (explaining Standalone Web vs Local Companion PTY capabilities).
5. **Backward-Compatible E2E & Store Automation Selectors**:
   - Existing `data-testid` attributes used by `e2e/editor.spec.ts`, `scripts/generate-screenshots.ts`, and `scripts/generate-demo-video.ts` must be preserved while adding new selectors for tabs, split-view, breadcrumbs, Monaco editor host, bottom panel, and Command Palette.

---

## Decisions

### 1. Layer 1 Domain Types & Services (`src/types/workbench.ts`, `src/services/`)

- **`src/types/workbench.ts`**:
  - Defines pure TypeScript types for `EditorTab`, `EditorGroupState`, `EditorSplitDirection` (`'single'` | `'split-horizontal'` | `'split-vertical'`), `CursorPosition`, `BreadcrumbSegment`, `BottomPanelTab` (`'problems'` | `'output'` | `'terminal'`), `DiagnosticItem`, `OutputLogEntry`, and `CommandContribution`.
- **`src/services/monacoWorkbenchService.ts` (`IMonacoWorkbenchService`, `IMonacoEngineAdapter`, `NativeMonacoEngineAdapter` & `MonacoWorkbenchService`)**:
  - Pure TypeScript service managing:
    - Localization pack loading (`fr`, `de`, `es`, `it`, `ja`, `pt-br`, `zh-hans`), lazy initialization of `@codingame/monaco-vscode-api` (`initialize()` with `configuration`, `keybindings`, `languages`, `localization`, `model`, `textmate`, and `theme` service overrides), default declarative VS Code extensions (`theme-defaults`, `typescript-basics`, `javascript`, `json`, `html`, `css`, `markdown-basics`, `yaml`, `python`, `rust`, `go`, `shellscript`), and `MonacoEnvironment.getWorker` (`editor.worker`, `TextMateWorker`, `extensionHost.worker`).
    - Language resolution via VS Code's `ILanguageService` (`guessLanguageIdByFilepathOrFirstLine`, `getLanguageName`) and `monaco.languages.getLanguages()`.
    - Breadcrumb computation from normalized POSIX paths (`buildBreadcrumbs`).
    - Creation and disposal of native `createConfiguredEditor` and side-by-side `createConfiguredDiffEditor` instances (`mountCodeEditor`, `mountDiffEditor`) backed by `monaco.editor.createModel` / `monaco.Uri.file`.
    - Live diagnostics subscription via `IMarkerService.onMarkerChanged` (`onDiagnosticsChange`) feeding into the Bottom Panel's _Problems_ tab.
    - Theme synchronization (`Default Dark Modern` / `Default Light Modern` via `IWorkbenchThemeService` and `monaco.editor.setTheme`) and `EditorSettings` propagation (`fontSize`, `tabSize`, `wordWrap`) via `IConfigurationService`.
- **`src/services/editorGroupModel.ts` (`EditorGroupModelService`)**:
  - Pure TypeScript state machine managing one or more `EditorGroupState` panes, opening/activating/closing tabs, updating buffer contents, tracking `isDirty` against `savedContent`, saving documents via `IFileSystemProvider`, splitting/closing editor groups, and updating cursor coordinates.
- **`src/services/commandRegistry.ts` (`CommandRegistryService`)**:
  - Pure TypeScript command registry supporting registration, fuzzy query matching (`searchCommands`), keyboard shortcut lookup, and command execution.

### 2. Layer 2 Reactive Composables (`src/composables/`)

- **`useEditorGroups.ts`**: Reactive wrapper around `EditorGroupModelService` and `IFileSystemProvider` providing reactive `groups`, `activeGroupId`, `activeGroup`, `activeTab`, `splitDirection`, `breadcrumbs`, `openFileTab`, `openDiffTab`, `closeTab`, `selectTab`, `updateTabContent`, `saveActiveTab`, `setSplitDirection`, and `updateCursorPosition`.
- **`useBottomPanel.ts`**: Reactive state for the collapsible Bottom Panel (`panelVisible`, `activePanelTab`, `diagnostics`, `outputLogs`, `togglePanel`, `selectPanelTab`, `appendOutputLog`, `setDiagnostics`).
- **`useCommandPalette.ts`**: Reactive state for the Command Palette modal (`isOpen`, `searchQuery`, `filteredCommands`, `selectedIndex`, `openPalette`, `closePalette`, `executeSelectedCommand`, `executeCommandById`).
- **`useWorkbenchBootstrap.ts`**: Coordinates top-level Workbench state, seeding a sample in-memory workspace (`InMemoryFileSystemProvider`) with starter files so users can immediately open files from the Explorer or Welcome View, edit code in Monaco, view side-by-side diffs, use the Command Palette, and inspect the Bottom Panel.

### 3. Native Full VS Code Workbench Architecture (`@codingame/monaco-vscode-workbench-service-override`)

- **Full Workbench Architecture & Service Override Selection**:
  - We exclusively leverage **`@codingame/monaco-vscode-workbench-service-override`** for workbench layout management.
  - **Avoid Colliding Layout Overrides**: We do NOT mix `getViewsServiceOverride` with `getWorkbenchServiceOverride`. In `@codingame/monaco-vscode-views-service-override`, parts are rendered into an off-screen container designed for manual `attachPart` calls, which collides with `getWorkbenchServiceOverride`'s native `BrowserWindow` layout tree.
  - **Single Full-Bleed Root Container**: The native workbench mounts into the `#workbenchHost` container element provided by `App.vue`, occupying `100vw` × `100vh` without custom outer headers or duplicate navigation bars, automatically rendering:
    - Activity Bar (`.part.activitybar`) with icons for Explorer, Search, Source Control, Run & Debug, Extensions, Testing, and Settings gear.
    - Side Bar (`.part.sidebar`) with native File Explorer tree, Outline, and Timeline.
    - Editor Area (`.part.editor`) with native editor groups, tabs, breadcrumbs, split editors, and dirty tracking.
    - Status Bar (`.part.statusbar`) with language mode, line/col indicator, encoding, and error counts.
    - Title Bar and Menu Bar with full context menu support.
  - **Complete Service Overrides Suite**:
    - `@codingame/monaco-vscode-workbench-service-override`
    - `@codingame/monaco-vscode-view-title-bar-service-override`
    - `@codingame/monaco-vscode-explorer-service-override`
    - `@codingame/monaco-vscode-outline-service-override`
    - `@codingame/monaco-vscode-timeline-service-override`
    - `@codingame/monaco-vscode-search-service-override`
    - `@codingame/monaco-vscode-scm-service-override`
    - `@codingame/monaco-vscode-debug-service-override`
    - `@codingame/monaco-vscode-testing-service-override`
    - `@codingame/monaco-vscode-extensions-service-override` (configured with `enableWorkerExtensionHost: false` and `vscode/localExtensionHost`)
    - `@codingame/monaco-vscode-preferences-service-override`
    - `@codingame/monaco-vscode-quickaccess-service-override`
    - `@codingame/monaco-vscode-view-status-bar-service-override`
    - `@codingame/monaco-vscode-snippets-service-override`

- **Virtual File System & Workspace Initialization**:
  - Seed workspace using `@codingame/monaco-vscode-files-service-override`:
    - Instantiate `RegisteredFileSystemProvider(false)` and register memory files via `RegisteredMemoryFile`.
    - Create a `.code-workspace` file (`/workspace.code-workspace`) with `folders: [{ path: '/workspace' }]`.
    - Populate `/workspace` with starter files: `/workspace/src/index.ts`, `/workspace/package.json`, `/workspace/README.md`.
    - Register overlay: `registerFileSystemOverlay(1, fileSystemProvider)`.
    - Provide `workspaceProvider` in `IWorkbenchConstructionOptions` with `workspace: { workspaceUri: vscode.Uri.file('/workspace.code-workspace') }` and `trusted: true`.
    - Configure `constructOptions.defaultLayout.editors` with `/workspace/src/index.ts` and `force: true` to ensure the editor is open and focused on initial boot and reload.

- **File Icon Themes & Declarative Extensions**:
  - Pre-bundle `@codingame/monaco-vscode-theme-seti-default-extension` to provide Seti file and directory icons in the Explorer tree.
  - Initialize user configuration with `workbench.iconTheme: "vs-seti"` and `workbench.colorTheme: "Default Dark Modern"`.
  - Bundle core language and grammar extensions: `theme-defaults`, `typescript-basics`, `javascript`, `json`, `html`, `css`, `markdown-basics`, `yaml`, `python`, `rust`, `go`, `shellscript`.

- **Web Workers & Manifest V3 CSP Configuration**:
  - In `wxt.config.ts`, configure `worker-src 'self';` in both development and production.
  - Bundle dedicated web workers using WXT unlisted scripts (`src/entrypoints/monaco-editor.worker.ts` and `src/entrypoints/monaco-textmate.worker.ts`).
  - Configure `MonacoEnvironment.getWorker` using `browser.runtime.getURL('/monaco-editor.js')` and `browser.runtime.getURL('/monaco-textmate.js')`. This avoids both CSP violations with `blob:` URLs and renderer termination crashes (`RESULT_CODE_KILLED_BAD_MESSAGE`) from external dev server URLs.

- **Milestone Scope Boundaries**:
  - **Jalon 1 (Current)**: Full-bleed VS Code Workbench layout matching CodinGame demo with in-memory seeded workspace files (`/workspace/src/index.ts`, `package.json`, `README.md`), native theme picker (⚙️ -> Themes -> Color Theme) with all default themes (`Light Modern`, `Dark Modern`, `Dark+`, `Light+`), full TextMate syntax highlighting for TS/JS/JSON/HTML/CSS/MD/YAML/Python/Rust/Go/Shell, full Activity Bar with Explorer (Outline & Timeline), Search, SCM, Debug, Extensions, Testing, Settings gear, context menus, and native quick access/command palette.
  - **Jalon 2**: File System Access API & OPFS (`ChromiumLocalFsProvider`, `OpfsProvider`, Open Folder dialog, real disk persistence).
  - **Jalon 3**: Real Git SCM backend (`IsomorphicGitProvider`, GitHub/GitLab clone, stage/commit/diff).
  - **Jalon 4**: Settings persistence & sync.
  - **Jalon 5**: OpenVSX live marketplace extension search & download.
  - **Jalon 6**: Native Companion Host.

- **Rigorous Verification & Subagent Quality Contract**:
  - Test suites and reviewer checks must never pass on simple DOM attachment (`toBeAttached`). Tests MUST assert functional reality:
    1. Zero console errors (`pageerror` and `console.error`).
    2. Active editor tab rendered with file title and breadcrumbs.
    3. Explorer tree visible with directories, files, and file icons.
    4. Activity Bar and Status Bar visible and populated with native items.
    5. Dark/Light theme switching properly changes CSS styles across all workbench parts.

---

## Consequences

- **Positive**:
  - `App.vue` becomes a clean, declarative composition root delegating to domain-scoped components in `src/components/`.
  - All editor group operations, command filtering, language detection, and Monaco lifecycle logic are 100% unit-testable in Layer 1 without mounting Vue.
  - Real `@codingame/monaco-vscode-api` editors and diff editors run in the extension workbench while remaining compliant with Manifest V3 CSP (`script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';`).
