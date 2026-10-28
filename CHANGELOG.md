# Changelog

All notable changes to **Source Code Editor** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-28

### Added

- Initial bootstrap of **Source Code Editor** (Manifest V3) for Chrome, Firefox, and Edge using WXT, Vue 3, TypeScript 6, and `@codingame/monaco-vscode-api`.
- 3-Layer Clean Architecture with pure TypeScript Layer 1 contracts and baseline implementations (`IFileSystemProvider`, `IGitProvider`, `IExtensionCatalogService`, `IAuthService`, `ISettingsSyncService`, `INativeBridge`).
- Background service worker (`background.ts`) supporting toolbar action, `Alt+Shift+E` keyboard shortcut, GitHub/GitLab context menu (`open-repo-in-editor`), and configurable Tab vs Standalone Popup Window launch modes.
- Workbench shell (`editor.html`) with Activity Bar, Sidebar views, Welcome View, Dark/Light theme toggle, and Status Bar.
- Multi-locale internationalization (`src/locales/*.yml`) and store metadata validation across 9 languages (`en`, `fr`, `de`, `es`, `it`, `ja`, `pt_BR`, `pt_PT`, `zh_CN`).
