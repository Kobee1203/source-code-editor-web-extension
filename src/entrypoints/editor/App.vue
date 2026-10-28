<script setup lang="ts">
import { computed, onMounted } from 'vue';
import {
  Blocks,
  Code2,
  Files,
  FolderGit2,
  FolderOpen,
  GitBranch,
  History,
  Moon,
  Search,
  Settings,
  Sun,
} from '@lucide/vue';
import { type WorkbenchActivityView, useWorkbenchBootstrap } from '@/composables/useWorkbenchBootstrap';
import { type I18nSimpleKey, t } from '@/utils/i18n';

const {
  activeView,
  sidebarVisible,
  theme,
  launchMode,
  runtimeMode,
  workspaceQuery,
  hasActiveContext,
  selectActivityView,
  toggleTheme,
  toggleLaunchMode,
  loadLaunchMode,
} = useWorkbenchBootstrap();

interface ActivityItem {
  id: WorkbenchActivityView;
  labelKey: I18nSimpleKey;
}

const activityItems: ReadonlyArray<ActivityItem> = [
  { id: 'explorer', labelKey: 'activityExplorer' },
  { id: 'search', labelKey: 'activitySearch' },
  { id: 'scm', labelKey: 'activityScm' },
  { id: 'extensions', labelKey: 'activityExtensions' },
];

const activeSidebarTitle = computed<string>(() => {
  switch (activeView.value) {
    case 'explorer':
      return t('activityExplorer');
    case 'search':
      return t('activitySearch');
    case 'scm':
      return t('activityScm');
    case 'extensions':
      return t('activityExtensions');
  }
});

const launchModeLabel = computed<string>(() =>
  launchMode.value === 'popup' ? t('statusLaunchModePopup') : t('statusLaunchModeTab'),
);

const runtimeModeLabel = computed<string>(() =>
  runtimeMode.value === 'local-companion' ? t('statusRuntimeCompanion') : t('statusRuntimeStandalone'),
);

onMounted(() => {
  void loadLaunchMode();
});
</script>

<template>
  <div class="workbench-shell" :data-theme-type="theme" data-testid="workbench-shell">
    <div class="workbench-body">
      <nav class="activity-bar" aria-label="Activity Bar" data-testid="activity-bar">
        <div class="activity-bar-top">
          <button
            v-for="item in activityItems"
            :key="item.id"
            type="button"
            class="activity-bar-button"
            :class="{ 'is-active': activeView === item.id && sidebarVisible }"
            :title="t(item.labelKey)"
            :aria-label="t(item.labelKey)"
            :data-testid="`activity-item-${item.id}`"
            @click="selectActivityView(item.id)"
          >
            <Files v-if="item.id === 'explorer'" :size="20" />
            <Search v-else-if="item.id === 'search'" :size="20" />
            <GitBranch v-else-if="item.id === 'scm'" :size="20" />
            <Blocks v-else :size="20" />
          </button>
        </div>

        <div class="activity-bar-bottom">
          <button
            type="button"
            class="activity-bar-button"
            :title="t('activityThemeToggle')"
            :aria-label="t('activityThemeToggle')"
            data-testid="theme-toggle-button"
            @click="toggleTheme"
          >
            <Sun v-if="theme === 'dark'" :size="18" />
            <Moon v-else :size="18" />
          </button>
          <button
            type="button"
            class="activity-bar-button"
            :title="t('activitySettings')"
            :aria-label="t('activitySettings')"
            data-testid="settings-button"
          >
            <Settings :size="18" />
          </button>
        </div>
      </nav>

      <aside v-if="sidebarVisible" class="sidebar-panel" data-testid="sidebar-panel">
        <header class="sidebar-header">
          <span class="sidebar-title" data-testid="sidebar-title">{{ activeSidebarTitle }}</span>
        </header>

        <div class="sidebar-content">
          <div v-if="activeView === 'explorer'" data-testid="sidebar-view-explorer">
            <p class="sidebar-empty-text">{{ t('sidebarExplorerEmpty') }}</p>
          </div>

          <div v-else-if="activeView === 'search'" data-testid="sidebar-view-search">
            <input
              type="search"
              class="sidebar-search-input"
              :placeholder="t('sidebarSearchPlaceholder')"
              aria-label="Workspace Search"
            />
            <p class="sidebar-empty-text">{{ t('sidebarSearchEmpty') }}</p>
          </div>

          <div v-else-if="activeView === 'scm'" data-testid="sidebar-view-scm">
            <p class="sidebar-empty-text">{{ t('sidebarScmEmpty') }}</p>
          </div>

          <div v-else data-testid="sidebar-view-extensions">
            <p class="sidebar-empty-text">{{ t('sidebarExtensionsEmpty') }}</p>
          </div>
        </div>
      </aside>

      <main class="editor-area" data-testid="editor-area">
        <section class="welcome-view" data-testid="welcome-view">
          <div class="welcome-header">
            <div class="welcome-logo">
              <Code2 :size="36" />
            </div>
            <div>
              <h1 class="welcome-title">{{ t('welcomeTitle') }}</h1>
              <p class="welcome-subtitle">{{ t('welcomeSubtitle') }}</p>
            </div>
          </div>

          <div v-if="hasActiveContext" class="active-context-banner" data-testid="active-context-banner">
            <div v-if="workspaceQuery.workspaceId" class="context-pill" data-testid="active-workspace-pill">
              <span class="context-badge">{{ t('welcomeActiveWorkspaceBadge') }}</span>
              <code class="context-value">{{ workspaceQuery.workspaceId }}</code>
            </div>
            <div v-if="workspaceQuery.repoUrl" class="context-pill" data-testid="active-repo-pill">
              <span class="context-badge">{{ t('welcomeActiveRepoBadge') }}</span>
              <code class="context-value">{{ workspaceQuery.repoUrl }}</code>
            </div>
          </div>

          <div class="welcome-cards">
            <article class="welcome-card" data-testid="welcome-card-local-folder">
              <div class="welcome-card-icon">
                <FolderOpen :size="22" />
              </div>
              <div class="welcome-card-body">
                <h2 class="welcome-card-title">{{ t('welcomeOpenLocalFolderTitle') }}</h2>
                <p class="welcome-card-desc">{{ t('welcomeOpenLocalFolderDesc') }}</p>
              </div>
            </article>

            <article class="welcome-card" data-testid="welcome-card-clone-repo">
              <div class="welcome-card-icon">
                <FolderGit2 :size="22" />
              </div>
              <div class="welcome-card-body">
                <h2 class="welcome-card-title">{{ t('welcomeCloneRepoTitle') }}</h2>
                <p class="welcome-card-desc">{{ t('welcomeCloneRepoDesc') }}</p>
              </div>
            </article>

            <article class="welcome-card" data-testid="welcome-card-recent-workspaces">
              <div class="welcome-card-icon">
                <History :size="22" />
              </div>
              <div class="welcome-card-body">
                <h2 class="welcome-card-title">{{ t('welcomeRecentWorkspacesTitle') }}</h2>
                <p class="welcome-card-desc">{{ t('welcomeRecentWorkspacesDesc') }}</p>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>

    <footer class="status-bar" data-testid="status-bar">
      <div class="status-bar-left">
        <span class="status-bar-item" data-testid="status-branch">
          <GitBranch :size="14" />
          <span>{{ t('statusBranchMain') }}</span>
        </span>
        <span class="status-bar-item" data-testid="status-problems">
          {{ t('statusProblemsCount') }}
        </span>
      </div>

      <div class="status-bar-right">
        <button
          type="button"
          class="status-bar-item status-bar-action"
          data-testid="launch-mode-toggle"
          @click="toggleLaunchMode"
        >
          {{ launchModeLabel }}
        </button>
        <span class="status-bar-item" data-testid="status-runtime-mode">
          {{ runtimeModeLabel }}
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.workbench-shell[data-theme-type='light'] {
  --workbench-bg: #fff;
  --workbench-fg: #1f2328;
  --activity-bar-bg: #2c2c2c;
  --activity-bar-fg: #999;
  --activity-bar-active-fg: #fff;
  --activity-bar-active-border: #005fb8;
  --sidebar-bg: #f3f3f3;
  --sidebar-fg: #1f2328;
  --sidebar-header-fg: #57606a;
  --editor-bg: #fff;
  --editor-card-bg: #f6f8fa;
  --editor-card-hover-bg: #eaeef2;
  --editor-card-border: #d0d7de;
  --panel-border: #e5e5e5;
  --status-bar-bg: #005fb8;
  --status-bar-fg: #fff;
  --accent-primary: #005fb8;
  --badge-bg: #005fb8;
  --badge-fg: #fff;
  --muted-fg: #57606a;
  --input-bg: #fff;
  --input-fg: #1f2328;
  --input-border: #d0d7de;
}

.workbench-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: var(--workbench-fg);
  background-color: var(--workbench-bg);
}

.workbench-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.activity-bar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 48px;
  background-color: var(--activity-bar-bg);
  border-right: 1px solid var(--panel-border);
}

.activity-bar-top,
.activity-bar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.activity-bar-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--activity-bar-fg);
  border-left: 2px solid transparent;
  transition: color 0.15s ease;
}

.activity-bar-button:hover {
  color: var(--activity-bar-active-fg);
}

.activity-bar-button.is-active {
  color: var(--activity-bar-active-fg);
  border-left-color: var(--activity-bar-active-border);
}

.sidebar-panel {
  display: flex;
  flex-direction: column;
  width: 260px;
  color: var(--sidebar-fg);
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--panel-border);
}

.sidebar-header {
  display: flex;
  align-items: center;
  height: 35px;
  padding: 0 16px;
  font-size: 11px;
  font-weight: 600;
  color: var(--sidebar-header-fg);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sidebar-content {
  flex: 1;
  padding: 12px 16px;
  overflow-y: auto;
}

.sidebar-search-input {
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--input-fg);
  background-color: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 4px;
}

.sidebar-empty-text {
  font-size: 12px;
  color: var(--muted-fg);
}

.editor-area {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow-y: auto;
  background-color: var(--editor-bg);
}

.welcome-view {
  width: 100%;
  max-width: 720px;
}

.welcome-header {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
}

.welcome-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  color: var(--accent-primary);
  background-color: var(--editor-card-bg);
  border: 1px solid var(--editor-card-border);
  border-radius: 12px;
}

.welcome-title {
  font-size: 24px;
  font-weight: 600;
}

.welcome-subtitle {
  font-size: 13px;
  color: var(--muted-fg);
}

.active-context-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  background-color: var(--editor-card-bg);
  border: 1px solid var(--accent-primary);
  border-radius: 8px;
}

.context-pill {
  display: flex;
  gap: 10px;
  align-items: center;
}

.context-badge {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--badge-fg);
  background-color: var(--badge-bg);
  border-radius: 4px;
}

.context-value {
  font-family: var(--font-mono);
  font-size: 12px;
}

.welcome-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
}

.welcome-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  background-color: var(--editor-card-bg);
  border: 1px solid var(--editor-card-border);
  border-radius: 8px;
  transition: background-color 0.15s ease;
}

.welcome-card:hover {
  background-color: var(--editor-card-hover-bg);
}

.welcome-card-icon {
  color: var(--accent-primary);
}

.welcome-card-title {
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
}

.welcome-card-desc {
  font-size: 12px;
  color: var(--muted-fg);
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--status-bar-fg);
  background-color: var(--status-bar-bg);
}

.status-bar-left,
.status-bar-right {
  display: flex;
  gap: 14px;
  align-items: center;
}

.status-bar-item {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 24px;
  padding: 0 6px;
}

.status-bar-action:hover {
  background-color: var(--status-bar-hover-bg);
}
</style>
