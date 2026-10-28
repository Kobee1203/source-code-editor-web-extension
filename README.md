# Source Code Editor — Web Extension

**Source Code Editor** is a multi-browser WebExtension (Chrome, Firefox, Edge — Manifest V3) providing a full VS Code-inspired IDE inside the browser, built with WXT, Vue 3, TypeScript 6, and `@codingame/monaco-vscode-api`.

---

## Key Features

- **VS Code-Inspired Workbench**: Activity Bar (Explorer, Search, Source Control, Extensions), collapsible Sidebar, multi-group Editor Area, Bottom Panel, and Status Bar.
- **Flexible Launch Modes**: Open `editor.html` in a regular browser tab or a standalone desktop-like popup window (`browser.windows.create({ type: 'popup' })`) that captures shortcuts like `Ctrl+W` / `Cmd+W`.
- **Pluggable File System Providers**:
  - Direct local folder read/write on Chromium via the File System Access API (`showDirectoryPicker`).
  - Origin Private File System (OPFS) workspace storage for remote Git clones and Firefox directory imports.
  - Optional Local Companion Native Host (`INativeBridge` over JSON-RPC 2.0) for full OS disk access, native Git, and integrated terminal.
- **Git & Remote Repositories**: Open any GitHub or GitLab repository directly from the browser toolbar or context menu (`Open repository in Source Code Editor`).
- **Store-Compliant Declarative Extensions**: Pre-bundled language grammars plus dynamic OpenVSX themes, icon packs, TextMate grammars, snippets, and keymaps.
- **Strict Token Security**: GitHub and GitLab OAuth/PAT credentials are stored exclusively in `browser.storage.local` or `browser.storage.session` and never leak into `browser.storage.sync` or exported settings profiles.

---

## Architecture

The codebase enforces a strict **3-Layer Clean Architecture**:

1. **Layer 1 — Domain & Infrastructure (`src/providers/`, `src/services/`, `src/types/`)**: Pure TypeScript contracts and adapters with zero Vue imports.
2. **Layer 2 — Reactive Orchestration (`src/composables/`)**: Modular Vue 3 composables bridging Layer 1 services to reactive state.
3. **Layer 3 — UI Presentation & Entrypoints (`src/components/`, `src/entrypoints/`)**: Vue 3 Workbench components and WXT entrypoints (`background.ts`, `editor/`).

See [`PLAN.md`](./PLAN.md), [`CONTEXT.md`](./CONTEXT.md), and [`docs/agents/architecture.md`](./docs/agents/architecture.md) for complete architectural documentation.

---

## Development

```bash
# Install dependencies
pnpm install

# Start development server (Chromium / Firefox / Edge)
pnpm dev
pnpm dev:firefox
pnpm dev:edge

# Run quality gates
pnpm lint
pnpm lint:css
pnpm format:check
pnpm compile
pnpm test
pnpm metadata:check
pnpm build
pnpm test:e2e
```

---

## License

[GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html) © Nicolas Dos Santos
