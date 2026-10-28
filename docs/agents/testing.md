# Testing Guidelines & Conventions

This document outlines testing practices, architectural tiers, mock lifecycle management, and conventions for unit, integration, and end-to-end tests in **Source Code Editor**.

---

## 1. Test Architecture & Hierarchy

The test suite mirrors the 3-Layer Clean Architecture and is structured into three tiers:

| Tier                              | Directory                                                 | Runner               | Characteristics                                                                                                                                                                                                                |
| :-------------------------------- | :-------------------------------------------------------- | :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layer 1 Unit Tests**            | `tests/providers/`<br>`tests/services/`<br>`tests/types/` | Vitest (`happy-dom`) | Pure TypeScript tests for `IFileSystemProvider`, `IGitProvider`, `IExtensionCatalogService`, `IAuthService`, `ISettingsSyncService`, `INativeBridge`, and URL/message parsers. Zero Vue mounting needed; runs in milliseconds. |
| **Layer 2 & 3 Integration Tests** | `tests/composables/`<br>`tests/entrypoints/`              | Vitest (`happy-dom`) | Tests reactive composables (`useWorkbenchBootstrap`) and background service worker orchestration (`background.ts`: context menus, toolbar clicks, keyboard commands, tab vs popup window launching, runtime messages).         |
| **End-to-End (E2E) Tests**        | `e2e/`                                                    | Playwright           | Full Chromium browser tests running with the built extension unpacked from `.output/chrome-mv3`. Verifies Workbench rendering, Activity Bar navigation, launch mode switching, theme toggling, and repository query handling.  |

---

## 2. Vitest Mock Lifecycle & Hygiene

Global mock resetting is centrally configured in `vitest.config.ts`:

```ts
clearMocks: true,
restoreMocks: true,
unstubGlobals: true,
unstubEnvs: true,
pool: 'vmThreads',
```

- **No manual `vi.clearAllMocks()`**: Because `clearMocks: true` is enabled globally, Vitest automatically clears mock call histories and instances between each test. **Never** manually call `vi.clearAllMocks()` in `beforeEach` or `afterEach` hooks.
- **Mock setup single point of truth**: Shared browser API mocks live in `tests/setup.ts` (`mockBrowser`). When a WebExtension API is consumed (`browser.action`, `browser.commands`, `browser.contextMenus`, `browser.tabs`, `browser.windows`, `browser.storage`, `browser.runtime.connectNative`), configure it in `mockBrowser` inside `tests/setup.ts`.
- **Virtual module mocks**: WXT virtual modules (`#imports` and `#i18n`) are aliased in `vitest.config.ts` to `tests/helpers/wxtImports.ts` and `.wxt/i18n/index.ts`.

---

## 3. Asynchronous Testing & Floating Promises

- **No floating promises (`void` operator)**: TypeScript ESLint strictly enforces `@typescript-eslint/no-floating-promises`. When invoking event listeners that return `void | Promise<void>` in a fire-and-forget manner, prefix the call with `void` (e.g., `void onActionClicked(tab)`).
- **Deterministic polling with `vi.waitFor`**: Avoid arbitrary `setTimeout` delays when waiting for asynchronous side effects. Always use `await vi.waitFor(() => { expect(...); })`.
- **Support multiple listeners**: `tests/setup.ts` stores registered listeners so tests can trigger `onInstalled`, `action.onClicked`, `commands.onCommand`, `contextMenus.onClicked`, and `runtime.onMessage` deterministically.

---

## 4. Red-to-Green Workflow for Bug Fixes & Regressions

When resolving concurrency bugs, race conditions, or logic defects:

1. **Phase 1 (Red — Prove the Defect)**: Write a unit or integration test reproducing the exact failure scenario before modifying production code.
2. **Phase 2 (Green — Apply the Fix)**: Implement the narrowest responsible fix in the appropriate architecture layer and verify the test passes.
3. **Phase 3 (Boundary Verification)**: Add tests covering boundary conditions (invalid inputs, error codes like `ENOENT`/`EEXIST`, token sanitization, disconnected native ports).
