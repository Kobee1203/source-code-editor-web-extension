## Agent skills

### 5-Agent Development Pipeline

Every milestone, feature, and fix must follow the mandatory 5-Agent Development Pipeline (`Planner` -> `ide-developer` -> `ide-tester` -> `ide-reviewer` -> `ide-pr-creator`). See `docs/agents/workflow.md`.

### Issue tracker

GitHub issues via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo layout (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.

### Coding guidelines

Strict rules for 3-Layer Clean Architecture (Layer 1 pure TypeScript with zero Vue imports), TypeScript typing (no `any` or forced `as`), import organization (`@/` aliases, `import type` syntax), CSS architecture (semantic variables, dark/light themes), i18n structure, English-only communication, and post-development verification (`lint`, `lint:css`, `format`, `compile`). See `docs/agents/coding-guidelines.md`.

### Architecture & messaging

System architecture, 3-Layer Clean Architecture (`src/providers/`, `src/services/`, `src/composables/`, `src/components/`), execution contexts (Service Worker, Standalone Editor Tab/Popup, Monaco Web Workers, Local Companion Native Host), runtime messaging contracts, and JSON-RPC 2.0 Native Bridge. See `docs/agents/architecture.md`.

### Testing conventions

Test tier hierarchy (Layer 1 Pure Unit, Layer 2/3 Composable & Entrypoint Integration, Playwright E2E), Vitest lifecycle and mock hygiene (`clearMocks: true`), WebExtension API mocking (`mockBrowser`), asynchronous event testing, and Red-to-Green bug verification. See `docs/agents/testing.md`.

### Release process

GitHub Actions release pipeline, GitHub repository secrets configuration, web store submissions (Chrome, Firefox, Edge), and version bumping workflow. See `docs/agents/release-process.md`.
