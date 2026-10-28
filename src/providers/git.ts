import { type IFileSystemProvider, normalizeFsPath } from '@/providers/fileSystem';

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'unmodified';

export interface GitStatusEntry {
  path: string;
  staged: boolean;
  status: GitFileStatus;
}

export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitCredentials {
  username?: string;
  token: string;
}

export interface GitCloneOptions {
  url: string;
  dir: string;
  ref?: string;
  depth?: number;
  singleBranch?: boolean;
  credentials?: GitCredentials;
}

export interface GitCommitInfo {
  oid: string;
  message: string;
  author: GitAuthor;
  timestamp: number;
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  remote?: string;
}

export interface GitDiffResult {
  path: string;
  originalContent: string;
  modifiedContent: string;
}

export interface GitProviderCapabilities {
  supportsSsh: boolean;
  supportsGpgSigning: boolean;
  supportsShallowClone: boolean;
}

export type GitErrorCode =
  | 'GIT_NOT_INITIALIZED'
  | 'GIT_BRANCH_EXISTS'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_NOTHING_TO_COMMIT'
  | 'GIT_AUTH_REQUIRED'
  | 'GIT_INVALID_ARGUMENT';

export class GitError extends Error {
  public readonly code: GitErrorCode;

  public constructor(code: GitErrorCode, message: string) {
    super(message);
    this.name = 'GitError';
    this.code = code;
  }
}

export interface IGitProvider {
  readonly id: string;
  readonly capabilities: GitProviderCapabilities;

  init(dir: string, defaultBranch?: string): Promise<void>;
  clone(options: GitCloneOptions): Promise<void>;
  currentBranch(dir: string): Promise<string>;
  listBranches(dir: string): Promise<GitBranchInfo[]>;
  createBranch(dir: string, branchName: string, checkout?: boolean): Promise<void>;
  checkout(dir: string, branchName: string): Promise<void>;
  status(dir: string): Promise<GitStatusEntry[]>;
  stage(dir: string, paths: string[]): Promise<void>;
  unstage(dir: string, paths: string[]): Promise<void>;
  commit(dir: string, message: string, author: GitAuthor): Promise<GitCommitInfo>;
  log(dir: string, maxCount?: number): Promise<GitCommitInfo[]>;
  diff(dir: string, filePath: string): Promise<GitDiffResult>;
  push(dir: string, credentials?: GitCredentials): Promise<void>;
  pull(dir: string, credentials?: GitCredentials): Promise<void>;
}

interface RepoState {
  currentBranch: string;
  branches: Map<string, Map<string, string>>;
  stagedPaths: Set<string>;
  commits: GitCommitInfo[];
  remoteUrl?: string;
  pushedOids: Set<string>;
}

/**
 * Deterministic in-memory implementation of `IGitProvider` backed by an `IFileSystemProvider`.
 * Used for fast Layer 1 contract testing and offline staging/commit simulations.
 */
export class InMemoryGitProvider implements IGitProvider {
  public readonly id = 'in-memory-git';
  public readonly capabilities: GitProviderCapabilities = {
    supportsSsh: false,
    supportsGpgSigning: false,
    supportsShallowClone: true,
  };

  private readonly fs: IFileSystemProvider;
  private readonly repos = new Map<string, RepoState>();

  public constructor(fs: IFileSystemProvider) {
    this.fs = fs;
  }

  public async init(dir: string, defaultBranch = 'main'): Promise<void> {
    const normalizedDir = normalizeFsPath(dir);
    await this.fs.createDirectory(normalizedDir, { recursive: true });

    const branches = new Map<string, Map<string, string>>();
    branches.set(defaultBranch, new Map<string, string>());

    this.repos.set(normalizedDir, {
      currentBranch: defaultBranch,
      branches,
      stagedPaths: new Set<string>(),
      commits: [],
      pushedOids: new Set<string>(),
    });
  }

  public async clone(options: GitCloneOptions): Promise<void> {
    if (!options.url.trim()) {
      throw new GitError('GIT_INVALID_ARGUMENT', 'Repository clone URL must not be empty');
    }
    const normalizedDir = normalizeFsPath(options.dir);
    const branch = options.ref ?? 'main';
    await this.init(normalizedDir, branch);

    const repo = this.getRepoOrThrow(normalizedDir);
    repo.remoteUrl = options.url;

    const readmePath = normalizeFsPath(`${normalizedDir}/README.md`);
    const initialReadme = `# ${options.url.split('/').pop() ?? 'Repository'}\n`;
    await this.fs.writeFile(readmePath, initialReadme, { create: true, overwrite: true });
    await this.stage(normalizedDir, ['README.md']);
    await this.commit(normalizedDir, 'chore: initial clone', {
      name: 'Source Code Editor',
      email: 'editor@local',
    });
  }

  public async currentBranch(dir: string): Promise<string> {
    const repo = this.getRepoOrThrow(normalizeFsPath(dir));
    return Promise.resolve(repo.currentBranch);
  }

  public async listBranches(dir: string): Promise<GitBranchInfo[]> {
    const repo = this.getRepoOrThrow(normalizeFsPath(dir));
    const list: GitBranchInfo[] = [];
    for (const name of repo.branches.keys()) {
      list.push({
        name,
        current: name === repo.currentBranch,
      });
    }
    return Promise.resolve(list);
  }

  public async createBranch(dir: string, branchName: string, checkout = false): Promise<void> {
    const repo = this.getRepoOrThrow(normalizeFsPath(dir));
    const trimmed = branchName.trim();
    if (!trimmed) {
      throw new GitError('GIT_INVALID_ARGUMENT', 'Branch name cannot be empty');
    }
    if (repo.branches.has(trimmed)) {
      throw new GitError('GIT_BRANCH_EXISTS', `Branch already exists: ${trimmed}`);
    }

    const headSnapshot = repo.branches.get(repo.currentBranch) ?? new Map<string, string>();
    repo.branches.set(trimmed, new Map(headSnapshot));
    if (checkout) {
      repo.currentBranch = trimmed;
    }
    return Promise.resolve();
  }

  public async checkout(dir: string, branchName: string): Promise<void> {
    const normalizedDir = normalizeFsPath(dir);
    const repo = this.getRepoOrThrow(normalizedDir);
    const targetSnapshot = repo.branches.get(branchName);
    if (!targetSnapshot) {
      throw new GitError('GIT_BRANCH_NOT_FOUND', `Branch not found: ${branchName}`);
    }

    repo.currentBranch = branchName;
    for (const [relativePath, content] of targetSnapshot.entries()) {
      const fullPath = normalizeFsPath(`${normalizedDir}/${relativePath}`);
      await this.fs.writeFile(fullPath, content, { create: true, overwrite: true });
    }
  }

  public async status(dir: string): Promise<GitStatusEntry[]> {
    const normalizedDir = normalizeFsPath(dir);
    const repo = this.getRepoOrThrow(normalizedDir);
    const headSnapshot = repo.branches.get(repo.currentBranch) ?? new Map<string, string>();
    const workingFiles = await this.collectWorkingFiles(normalizedDir, normalizedDir);

    const allPaths = new Set<string>([...headSnapshot.keys(), ...workingFiles.keys()]);
    const entries: GitStatusEntry[] = [];

    for (const relativePath of Array.from(allPaths).sort()) {
      const inHead = headSnapshot.get(relativePath);
      const inWork = workingFiles.get(relativePath);
      const isStaged = repo.stagedPaths.has(relativePath);

      if (inHead === undefined && inWork !== undefined) {
        entries.push({
          path: relativePath,
          staged: isStaged,
          status: isStaged ? 'added' : 'untracked',
        });
      } else if (inHead !== undefined && inWork === undefined) {
        entries.push({
          path: relativePath,
          staged: isStaged,
          status: 'deleted',
        });
      } else if (inHead !== undefined && inWork !== undefined && inHead !== inWork) {
        entries.push({
          path: relativePath,
          staged: isStaged,
          status: 'modified',
        });
      }
    }

    return entries;
  }

  public async stage(dir: string, paths: string[]): Promise<void> {
    const repo = this.getRepoOrThrow(normalizeFsPath(dir));
    for (const rawPath of paths) {
      const normalized = rawPath.replace(/^\/+/, '');
      if (normalized) {
        repo.stagedPaths.add(normalized);
      }
    }
    return Promise.resolve();
  }

  public async unstage(dir: string, paths: string[]): Promise<void> {
    const repo = this.getRepoOrThrow(normalizeFsPath(dir));
    for (const rawPath of paths) {
      const normalized = rawPath.replace(/^\/+/, '');
      repo.stagedPaths.delete(normalized);
    }
    return Promise.resolve();
  }

  public async commit(dir: string, message: string, author: GitAuthor): Promise<GitCommitInfo> {
    const normalizedDir = normalizeFsPath(dir);
    const repo = this.getRepoOrThrow(normalizedDir);
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      throw new GitError('GIT_INVALID_ARGUMENT', 'Commit message must not be empty');
    }
    if (repo.stagedPaths.size === 0) {
      throw new GitError('GIT_NOTHING_TO_COMMIT', 'No staged changes to commit');
    }

    const headSnapshot = repo.branches.get(repo.currentBranch) ?? new Map<string, string>();
    const workingFiles = await this.collectWorkingFiles(normalizedDir, normalizedDir);

    for (const stagedPath of repo.stagedPaths) {
      const currentContent = workingFiles.get(stagedPath);
      if (currentContent === undefined) {
        headSnapshot.delete(stagedPath);
      } else {
        headSnapshot.set(stagedPath, currentContent);
      }
    }

    repo.branches.set(repo.currentBranch, headSnapshot);
    repo.stagedPaths.clear();

    const commitInfo: GitCommitInfo = {
      oid: `commit-${(repo.commits.length + 1).toString().padStart(6, '0')}`,
      message: trimmedMessage,
      author,
      timestamp: Date.now(),
    };
    repo.commits.unshift(commitInfo);
    return commitInfo;
  }

  public async log(dir: string, maxCount = 50): Promise<GitCommitInfo[]> {
    const repo = this.getRepoOrThrow(normalizeFsPath(dir));
    return Promise.resolve(repo.commits.slice(0, maxCount));
  }

  public async diff(dir: string, filePath: string): Promise<GitDiffResult> {
    const normalizedDir = normalizeFsPath(dir);
    const repo = this.getRepoOrThrow(normalizedDir);
    const cleanRel = filePath.replace(/^\/+/, '');
    const headSnapshot = repo.branches.get(repo.currentBranch) ?? new Map<string, string>();
    const originalContent = headSnapshot.get(cleanRel) ?? '';

    const fullPath = normalizeFsPath(`${normalizedDir}/${cleanRel}`);
    const exists = await this.fs.exists(fullPath);
    const modifiedContent = exists ? await this.fs.readTextFile(fullPath) : '';

    return {
      path: cleanRel,
      originalContent,
      modifiedContent,
    };
  }

  public async push(dir: string, credentials?: GitCredentials): Promise<void> {
    const repo = this.getRepoOrThrow(normalizeFsPath(dir));
    if (repo.remoteUrl && repo.remoteUrl.startsWith('https://') && credentials && !credentials.token.trim()) {
      throw new GitError('GIT_AUTH_REQUIRED', 'Valid token is required to push to remote repository');
    }
    for (const c of repo.commits) {
      repo.pushedOids.add(c.oid);
    }
    return Promise.resolve();
  }

  public async pull(dir: string): Promise<void> {
    this.getRepoOrThrow(normalizeFsPath(dir));
    return Promise.resolve();
  }

  private getRepoOrThrow(normalizedDir: string): RepoState {
    const repo = this.repos.get(normalizedDir);
    if (!repo) {
      throw new GitError('GIT_NOT_INITIALIZED', `Git repository not initialized in ${normalizedDir}`);
    }
    return repo;
  }

  private async collectWorkingFiles(rootDir: string, currentDir: string): Promise<Map<string, string>> {
    const entries = await this.fs.readDirectory(currentDir);
    const result = new Map<string, string>();

    for (const entry of entries) {
      if (entry.name === '.git') {
        continue;
      }
      if (entry.type === 'directory') {
        const nested = await this.collectWorkingFiles(rootDir, entry.path);
        for (const [k, v] of nested.entries()) {
          result.set(k, v);
        }
      } else {
        const relativePath = rootDir === '/' ? entry.path.slice(1) : entry.path.slice(rootDir.length + 1);
        const content = await this.fs.readTextFile(entry.path);
        result.set(relativePath, content);
      }
    }

    return result;
  }
}
