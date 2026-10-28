export type LaunchMode = 'tab' | 'popup';

export type RuntimeMode = 'standalone-web' | 'local-companion';

export interface WorkspaceQuery {
  workspaceId: string | null;
  repoUrl: string | null;
}

export interface OpenEditorRequest {
  type: 'OPEN_EDITOR';
  workspaceId?: string;
  repoUrl?: string;
  launchMode?: LaunchMode;
}

export interface OpenRepositoryRequest {
  type: 'OPEN_REPOSITORY';
  repoUrl: string;
  launchMode?: LaunchMode;
}

export interface GetLaunchModeRequest {
  type: 'GET_LAUNCH_MODE';
}

export interface SetLaunchModeRequest {
  type: 'SET_LAUNCH_MODE';
  launchMode: LaunchMode;
}

export type RuntimeMessage = OpenEditorRequest | OpenRepositoryRequest | GetLaunchModeRequest | SetLaunchModeRequest;

export interface RuntimeSuccessResponse {
  ok: true;
  launchMode: LaunchMode;
  tabId?: number;
  windowId?: number;
  editorUrl?: string;
}

export interface RuntimeErrorResponse {
  ok: false;
  error: string;
}

export type RuntimeResponse = RuntimeSuccessResponse | RuntimeErrorResponse;

const RESERVED_GITHUB_PATHS = new Set([
  'about',
  'account',
  'codespaces',
  'collections',
  'contact',
  'copilot',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'gist',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'notifications',
  'organizations',
  'orgs',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'session',
  'settings',
  'signup',
  'site',
  'sponsors',
  'team',
  'topics',
  'trending',
  'users',
  'watching',
]);

const RESERVED_GITLAB_PATHS = new Set([
  '-',
  'abuse_reports',
  'admin',
  'api',
  'assets',
  'dashboard',
  'explore',
  'groups',
  'help',
  'import',
  'jwt',
  'oauth',
  'profile',
  'projects',
  'search',
  'snippets',
  'uploads',
  'users',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isLaunchMode(value: unknown): value is LaunchMode {
  return value === 'tab' || value === 'popup';
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'OPEN_EDITOR': {
      const validWorkspace = value.workspaceId === undefined || typeof value.workspaceId === 'string';
      const validRepo = value.repoUrl === undefined || typeof value.repoUrl === 'string';
      const validMode = value.launchMode === undefined || isLaunchMode(value.launchMode);
      return validWorkspace && validRepo && validMode;
    }
    case 'OPEN_REPOSITORY': {
      const validMode = value.launchMode === undefined || isLaunchMode(value.launchMode);
      return typeof value.repoUrl === 'string' && value.repoUrl.trim().length > 0 && validMode;
    }
    case 'GET_LAUNCH_MODE':
      return true;
    case 'SET_LAUNCH_MODE':
      return isLaunchMode(value.launchMode);
    default:
      return false;
  }
}

/**
 * Extracts a canonical HTTPS repository URL (`https://github.com/owner/repo` or `https://gitlab.com/group/.../repo`)
 * from a browser tab URL, or returns `null` if the URL does not point to a valid GitHub/GitLab repository.
 */
export function extractRepositoryUrlFromTabUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'gitlab.com') {
    return null;
  }

  const segments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const second = segments[1];
  if (!owner || !second) {
    return null;
  }

  if (host === 'github.com') {
    if (RESERVED_GITHUB_PATHS.has(owner.toLowerCase())) {
      return null;
    }
    const repoName = second.replace(/\.git$/i, '');
    if (!repoName) {
      return null;
    }
    return `https://github.com/${owner}/${repoName}`;
  }

  // GitLab supports nested subgroups before `/-/` (e.g., /group/subgroup/repo/-/tree/main)
  if (RESERVED_GITLAB_PATHS.has(owner.toLowerCase())) {
    return null;
  }

  const dashIndex = segments.indexOf('-');
  const repoSegments = dashIndex !== -1 ? segments.slice(0, dashIndex) : segments.slice(0, 2);
  if (repoSegments.length < 2) {
    return null;
  }

  const normalizedSegments = repoSegments.map((seg, idx) =>
    idx === repoSegments.length - 1 ? seg.replace(/\.git$/i, '') : seg,
  );
  if (normalizedSegments.some((seg) => seg.length === 0)) {
    return null;
  }

  return `https://gitlab.com/${normalizedSegments.join('/')}`;
}

/**
 * Builds the extension relative path or full URL for `editor.html` with optional query parameters.
 */
export function buildEditorPath(options?: { workspaceId?: string; repoUrl?: string }): string {
  const params = new URLSearchParams();
  const workspaceId = options?.workspaceId?.trim();
  const repoUrl = options?.repoUrl?.trim();

  if (workspaceId) {
    params.set('workspace', workspaceId);
  }
  if (repoUrl) {
    params.set('repo', repoUrl);
  }

  const query = params.toString();
  return query.length > 0 ? `/editor.html?${query}` : '/editor.html';
}

export function buildEditorUrl(baseExtensionUrl: string, options?: { workspaceId?: string; repoUrl?: string }): string {
  const normalizedBase = baseExtensionUrl.replace(/\/+$/, '');
  const relativePath = buildEditorPath(options);
  if (normalizedBase.endsWith('/editor.html')) {
    const suffix = relativePath.slice('/editor.html'.length);
    return `${normalizedBase}${suffix}`;
  }
  return `${normalizedBase}${relativePath}`;
}

/**
 * Parses `?workspace=<id>&repo=<url>` query parameters from a URL search string.
 */
export function parseEditorQueryParams(search: string): WorkspaceQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawWorkspace = params.get('workspace')?.trim() ?? '';
  const rawRepo = params.get('repo')?.trim() ?? '';

  const workspaceId = rawWorkspace.length > 0 ? rawWorkspace : null;
  const repoUrl = extractRepositoryUrlFromTabUrl(rawRepo);

  return {
    workspaceId,
    repoUrl,
  };
}
