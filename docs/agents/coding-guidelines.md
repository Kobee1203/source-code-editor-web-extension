# Coding Guidelines

This document outlines the strict coding rules and architecture conventions that must be followed in **Source Code Editor**.

## 1. Three-Layer Clean Architecture

All source code under `src/` must respect the three-layer dependency rule (`Layer 3 -> Layer 2 -> Layer 1`):

1. **Layer 1 — Domain & Infrastructure (`src/providers/`, `src/services/`, `src/types/`)**:
   - Pure TypeScript interfaces, domain services, and providers.
   - **Zero `vue` imports**: Layer 1 files must never import from `vue` or depend on Vue reactivity (`ref`, `computed`, `watch`) or `.vue` components.
2. **Layer 2 — Reactive Orchestration (`src/composables/`)**:
   - Modular Vue 3 composables bridging reactive state to Layer 1 services.
   - Never perform raw low-level protocol parsing or storage serialization directly in a composable when it belongs in a Layer 1 service.
3. **Layer 3 — UI Presentation & Entrypoints (`src/components/`, `src/entrypoints/`)**:
   - Domain-scoped Vue 3 components (`workbench/`, `editor/`, `explorer/`, `search/`, `scm/`, `extensions/`, `settings/`, `welcome/`, `common/`) and WXT entrypoints (`background.ts`, `editor/`).

## 2. Strict Typing (TypeScript)

- **No `any` or forced casts (`as`)**: Variables, parameters, return values, and parsed JSON payloads must be strictly typed end-to-end using type guards, runtime validation helpers, or generic interfaces instead of `any` or `as`.
- **No inline dynamic type imports**: Never use dynamic type imports like `import('@/providers/fileSystem').FileStat` inline. Always declare types via a standard top-level `import type` statement at the top of the file.

## 3. Import Organization

- **Explicit ES Imports**: WXT auto-imports are disabled (`imports: false` in `wxt.config.ts`). Every symbol must be explicitly imported.
- **Use Aliases**: Always prefer the `@/` alias (e.g., `@/providers/`, `@/services/`, `@/composables/`, `@/components/`, `@/types/`) over relative paths (`../`) when importing cross-directory modules.
- **Sorting and Grouping**: Imports are automatically grouped and sorted alphabetically via `@trivago/prettier-plugin-sort-imports` (`^vue`, `^wxt`, `<THIRD_PARTY_MODULES>`, `^@/(.*)$`, `^[./]`).
- **Type Imports Syntax**:
  - Utilize TypeScript's native concise syntax for mixed imports: `import { InMemoryFileSystemProvider, type IFileSystemProvider } from '@/providers/fileSystem'`.
  - When importing **only** types from a module, strictly use the top-level keyword to avoid runtime side-effects: `import type { IFileSystemProvider } from '@/providers/fileSystem'`.

## 4. CSS Architecture and Theming

- **Semantic and Dedicated Variables**: Never reuse a specific component's CSS variables for an unrelated component. Define semantic workbench variables (`--workbench-bg`, `--activity-bar-bg`, `--sidebar-bg`, `--editor-bg`, `--status-bar-bg`, `--panel-border`, etc.).
- **Shared Styles**: Global reset, theme variables, and shared layout primitives live in `src/styles/style.css` (and domain stylesheet modules in `src/styles/*.css`).
- **Dark / Light Mode Management**:
  - Default variables (Dark Theme) are declared in `:root` in `src/styles/style.css`.
  - Overrides for Light Theme (`[data-theme-type='light']`) are declared cleanly using semantic variable overrides.

## 5. Internationalization (i18n)

- **Multi-Locale YAML**: Translation strings live in `src/locales/*.yml` with `en.yml` as the canonical source of truth across all 9 supported locales (`en`, `fr`, `de`, `es`, `it`, `ja`, `pt_BR`, `pt_PT`, `zh_CN`).
- **Domain Grouping**: Group YAML keys by functional domain (extension manifest, activity bar, welcome view, status bar, commands).

## 6. Project Language

- **English Only**: Always use **English** for commit messages, GitHub issues, pull request descriptions, code comments, identifiers, and documentation.

## 7. Dead Code and Unnecessary Backward Compatibility

- **No dead or ghost code**: Avoid retaining unused variables, commented-out blocks, or dead reactive state.
- **No speculative backward compatibility**: For internal components, services, and composables within the repository, never preserve obsolete signatures or fallback shims out of speculative caution. Refactor call sites directly and keep interfaces lean and strictly typed.

## 8. DRY and Maintainable Architecture

- **Avoid code duplication (DRY)**: Never duplicate path normalization, URL validation, or storage serialization across multiple functions. Extract shared pure functions in Layer 1 (`src/types/`, `src/providers/`, `src/services/`).
- **Inspect template context before adding state (KISS)**: Keep component and composable state minimal and derived where possible.
- **No redundant defensive calls**: Never invoke a validation or normalization routine immediately before calling a function that already performs that exact step internally.

## 9. Separation of Concerns & Testing Hygiene

- **No test-specific code in production**: Never introduce guards, flags, shims, or lifecycle branches in production code solely to accommodate test runners. Production code must remain clean, idiomatic, and unaware of testing frameworks.
- **Test helpers & wrappers**: Provide dedicated test utilities in `tests/helpers/` or `tests/setup.ts` (`mockBrowser`).
- **Adhere to testing conventions**: Follow `docs/agents/testing.md` for mock lifecycle conventions (`clearMocks: true` globally — never call `vi.clearAllMocks()` manually), asynchronous event polling (`vi.waitFor`), floating promise handling (`void`), and Red-to-Green bug verification.

## 10. Post-Development Workflow

- **Verification Commands**: After completing any code changes, always execute the following commands to ensure the codebase remains clean and compiles successfully:
  - `pnpm run lint:fix` (Fix TS/JS/Vue lint errors)
  - `pnpm run lint:css:fix` (Fix CSS lint errors)
  - `pnpm run format` (Format codebase with Prettier)
  - `pnpm run compile` (Verify TypeScript compilation)
