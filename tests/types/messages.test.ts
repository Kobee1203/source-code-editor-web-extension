import { describe, expect, it } from 'vitest';
import {
  buildEditorPath,
  buildEditorUrl,
  extractRepositoryUrlFromTabUrl,
  isLaunchMode,
  isRuntimeMessage,
  parseEditorQueryParams,
} from '@/types/messages';

describe('types/messages', () => {
  describe('isLaunchMode', () => {
    it('returns true for valid launch modes', () => {
      expect(isLaunchMode('tab')).toBe(true);
      expect(isLaunchMode('popup')).toBe(true);
    });

    it('returns false for invalid launch modes', () => {
      expect(isLaunchMode('window')).toBe(false);
      expect(isLaunchMode('')).toBe(false);
      expect(isLaunchMode(null)).toBe(false);
      expect(isLaunchMode(undefined)).toBe(false);
      expect(isLaunchMode(42)).toBe(false);
    });
  });

  describe('isRuntimeMessage', () => {
    it('validates OPEN_EDITOR messages', () => {
      expect(isRuntimeMessage({ type: 'OPEN_EDITOR' })).toBe(true);
      expect(
        isRuntimeMessage({
          type: 'OPEN_EDITOR',
          workspaceId: 'ws-1',
          repoUrl: 'https://github.com/octocat/Hello-World',
          launchMode: 'popup',
        }),
      ).toBe(true);
      expect(isRuntimeMessage({ type: 'OPEN_EDITOR', workspaceId: 123 })).toBe(false);
      expect(isRuntimeMessage({ type: 'OPEN_EDITOR', repoUrl: false })).toBe(false);
      expect(isRuntimeMessage({ type: 'OPEN_EDITOR', launchMode: 'fullscreen' })).toBe(false);
    });

    it('validates OPEN_REPOSITORY messages', () => {
      expect(
        isRuntimeMessage({
          type: 'OPEN_REPOSITORY',
          repoUrl: 'https://github.com/octocat/Hello-World',
        }),
      ).toBe(true);
      expect(
        isRuntimeMessage({
          type: 'OPEN_REPOSITORY',
          repoUrl: 'https://gitlab.com/gitlab-org/gitlab',
          launchMode: 'tab',
        }),
      ).toBe(true);
      expect(isRuntimeMessage({ type: 'OPEN_REPOSITORY', repoUrl: '   ' })).toBe(false);
      expect(isRuntimeMessage({ type: 'OPEN_REPOSITORY' })).toBe(false);
      expect(
        isRuntimeMessage({
          type: 'OPEN_REPOSITORY',
          repoUrl: 'https://github.com/octocat/Hello-World',
          launchMode: 'invalid',
        }),
      ).toBe(false);
    });

    it('validates GET_LAUNCH_MODE and SET_LAUNCH_MODE messages', () => {
      expect(isRuntimeMessage({ type: 'GET_LAUNCH_MODE' })).toBe(true);
      expect(isRuntimeMessage({ type: 'SET_LAUNCH_MODE', launchMode: 'tab' })).toBe(true);
      expect(isRuntimeMessage({ type: 'SET_LAUNCH_MODE', launchMode: 'popup' })).toBe(true);
      expect(isRuntimeMessage({ type: 'SET_LAUNCH_MODE', launchMode: 'invalid' })).toBe(false);
      expect(isRuntimeMessage({ type: 'SET_LAUNCH_MODE' })).toBe(false);
    });

    it('rejects non-objects and unknown message types', () => {
      expect(isRuntimeMessage(null)).toBe(false);
      expect(isRuntimeMessage(undefined)).toBe(false);
      expect(isRuntimeMessage('OPEN_EDITOR')).toBe(false);
      expect(isRuntimeMessage([])).toBe(false);
      expect(isRuntimeMessage({ type: 'UNKNOWN_MESSAGE' })).toBe(false);
      expect(isRuntimeMessage({ type: 123 })).toBe(false);
    });
  });

  describe('extractRepositoryUrlFromTabUrl', () => {
    it('extracts canonical GitHub repository URLs from root, branches, files, and .git suffixes', () => {
      expect(extractRepositoryUrlFromTabUrl('https://github.com/octocat/Hello-World')).toBe(
        'https://github.com/octocat/Hello-World',
      );
      expect(extractRepositoryUrlFromTabUrl('https://github.com/octocat/Hello-World/tree/main/src/index.ts')).toBe(
        'https://github.com/octocat/Hello-World',
      );
      expect(extractRepositoryUrlFromTabUrl('https://github.com/octocat/Hello-World.git')).toBe(
        'https://github.com/octocat/Hello-World',
      );
      expect(extractRepositoryUrlFromTabUrl('http://github.com/torvalds/linux/pulls')).toBe(
        'https://github.com/torvalds/linux',
      );
    });

    it('extracts canonical GitLab repository URLs including nested subgroups', () => {
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/gitlab-org/gitlab')).toBe(
        'https://gitlab.com/gitlab-org/gitlab',
      );
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/group/subgroup/project/-/tree/main/README.md')).toBe(
        'https://gitlab.com/group/subgroup/project',
      );
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/group/project.git')).toBe(
        'https://gitlab.com/group/project',
      );
    });

    it('returns null for reserved GitHub and GitLab paths', () => {
      expect(extractRepositoryUrlFromTabUrl('https://github.com/settings/profile')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://github.com/marketplace/actions')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://github.com/orgs/vuejs/repositories')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://github.com/explore/topics')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/explore/projects')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/dashboard/projects')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/groups/gitlab-org')).toBeNull();
    });

    it('returns null for non-repository URLs, unsupported hosts, and non-HTTP protocols', () => {
      expect(extractRepositoryUrlFromTabUrl(null)).toBeNull();
      expect(extractRepositoryUrlFromTabUrl(undefined)).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('not a valid url')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('chrome://extensions')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('ftp://github.com/octocat/Hello-World')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://bitbucket.org/owner/repo')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://github.com/octocat')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://github.com/octocat/.git')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/group/-/tree/main')).toBeNull();
      expect(extractRepositoryUrlFromTabUrl('https://gitlab.com/group/.git')).toBeNull();
    });
  });

  describe('buildEditorPath and buildEditorUrl', () => {
    it('builds bare editor path when no options are provided', () => {
      expect(buildEditorPath()).toBe('/editor.html');
      expect(buildEditorPath({})).toBe('/editor.html');
      expect(buildEditorUrl('chrome-extension://abc123/')).toBe('chrome-extension://abc123/editor.html');
      expect(buildEditorUrl('chrome-extension://abc123/editor.html')).toBe('chrome-extension://abc123/editor.html');
    });

    it('encodes workspaceId and repoUrl parameters in editor path and full URL', () => {
      const pathWithBoth = buildEditorPath({
        workspaceId: 'my-workspace',
        repoUrl: 'https://github.com/octocat/Hello-World',
      });
      expect(pathWithBoth).toBe(
        '/editor.html?workspace=my-workspace&repo=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World',
      );

      const fullUrl = buildEditorUrl('chrome-extension://abc123/editor.html', {
        workspaceId: 'ws-42',
      });
      expect(fullUrl).toBe('chrome-extension://abc123/editor.html?workspace=ws-42');
    });
  });

  describe('parseEditorQueryParams', () => {
    it('parses empty query strings into null fields', () => {
      expect(parseEditorQueryParams('')).toEqual({
        workspaceId: null,
        repoUrl: null,
      });
      expect(parseEditorQueryParams('?')).toEqual({
        workspaceId: null,
        repoUrl: null,
      });
    });

    it('extracts valid workspaceId and canonicalizes repoUrl', () => {
      const parsed = parseEditorQueryParams(
        '?workspace=hello-world&repo=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World%2Ftree%2Fmain',
      );
      expect(parsed).toEqual({
        workspaceId: 'hello-world',
        repoUrl: 'https://github.com/octocat/Hello-World',
      });
    });

    it('handles query strings without leading question mark and rejects invalid repo URLs', () => {
      const parsed = parseEditorQueryParams('workspace=local-proj&repo=https://github.com/settings/tokens');
      expect(parsed).toEqual({
        workspaceId: 'local-proj',
        repoUrl: null,
      });
    });
  });
});
