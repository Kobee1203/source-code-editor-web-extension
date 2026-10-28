import { describe, expect, it } from 'vitest';
import { InMemoryFileSystemProvider } from '@/providers/fileSystem';
import { GitError, InMemoryGitProvider } from '@/providers/git';

describe('providers/git', () => {
  it('constructs GitError with code and message', () => {
    const err = new GitError('GIT_NOT_INITIALIZED', 'Repo not initialized');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GitError');
    expect(err.code).toBe('GIT_NOT_INITIALIZED');
    expect(err.message).toBe('Repo not initialized');
  });

  it('rejects operations when repository is not initialized', async () => {
    const fs = new InMemoryFileSystemProvider();
    const git = new InMemoryGitProvider(fs);

    await expect(git.currentBranch('/uninitialized')).rejects.toMatchObject({
      code: 'GIT_NOT_INITIALIZED',
    });
    await expect(git.status('/uninitialized')).rejects.toMatchObject({
      code: 'GIT_NOT_INITIALIZED',
    });
    await expect(git.log('/uninitialized')).rejects.toMatchObject({
      code: 'GIT_NOT_INITIALIZED',
    });
  });

  it('clones a remote repository and creates initial commit', async () => {
    const fs = new InMemoryFileSystemProvider();
    const git = new InMemoryGitProvider(fs);

    await expect(git.clone({ url: '   ', dir: '/repo' })).rejects.toMatchObject({
      code: 'GIT_INVALID_ARGUMENT',
    });

    await git.clone({
      url: 'https://github.com/octocat/Hello-World',
      dir: '/repo',
      ref: 'main',
    });

    expect(await git.currentBranch('/repo')).toBe('main');
    expect(await fs.readTextFile('/repo/README.md')).toContain('# Hello-World');

    const log = await git.log('/repo');
    expect(log).toHaveLength(1);
    expect(log[0]?.message).toBe('chore: initial clone');
    expect(await git.status('/repo')).toEqual([]);
  });

  it('tracks untracked, added, modified, and deleted files through stage, unstage, diff, and commit', async () => {
    const fs = new InMemoryFileSystemProvider();
    const git = new InMemoryGitProvider(fs);

    await git.init('/workspace', 'main');
    await fs.createDirectory('/workspace/.git');
    await fs.writeFile('/workspace/.git/config', 'ignored');
    await fs.createDirectory('/workspace/src', { recursive: true });
    await fs.writeFile('/workspace/src/index.ts', 'export const v = 1;\n');

    const initialStatus = await git.status('/workspace');
    expect(initialStatus).toEqual([
      {
        path: 'src/index.ts',
        staged: false,
        status: 'untracked',
      },
    ]);

    await git.stage('/workspace', ['src/index.ts']);
    expect(await git.status('/workspace')).toEqual([
      {
        path: 'src/index.ts',
        staged: true,
        status: 'added',
      },
    ]);

    await git.unstage('/workspace', ['src/index.ts']);
    expect(await git.status('/workspace')).toEqual([
      {
        path: 'src/index.ts',
        staged: false,
        status: 'untracked',
      },
    ]);

    await expect(
      git.commit('/workspace', 'feat: initial', { name: 'Dev', email: 'dev@example.com' }),
    ).rejects.toMatchObject({
      code: 'GIT_NOTHING_TO_COMMIT',
    });

    await git.stage('/workspace', ['/src/index.ts']);
    await expect(git.commit('/workspace', '   ', { name: 'Dev', email: 'dev@example.com' })).rejects.toMatchObject({
      code: 'GIT_INVALID_ARGUMENT',
    });

    const firstCommit = await git.commit('/workspace', 'feat: add index', {
      name: 'Dev',
      email: 'dev@example.com',
    });
    expect(firstCommit.oid).toBe('commit-000001');
    expect(await git.status('/workspace')).toEqual([]);

    await fs.writeFile('/workspace/src/index.ts', 'export const v = 2;\n');
    expect(await git.status('/workspace')).toEqual([
      {
        path: 'src/index.ts',
        staged: false,
        status: 'modified',
      },
    ]);

    const diffModified = await git.diff('/workspace', 'src/index.ts');
    expect(diffModified).toEqual({
      path: 'src/index.ts',
      originalContent: 'export const v = 1;\n',
      modifiedContent: 'export const v = 2;\n',
    });

    await fs.delete('/workspace/src/index.ts');
    expect(await git.status('/workspace')).toEqual([
      {
        path: 'src/index.ts',
        staged: false,
        status: 'deleted',
      },
    ]);

    const diffDeleted = await git.diff('/workspace', 'src/index.ts');
    expect(diffDeleted).toEqual({
      path: 'src/index.ts',
      originalContent: 'export const v = 1;\n',
      modifiedContent: '',
    });

    await git.stage('/workspace', ['src/index.ts']);
    await git.commit('/workspace', 'chore: remove index', {
      name: 'Dev',
      email: 'dev@example.com',
    });
    expect(await git.status('/workspace')).toEqual([]);
  });

  it('creates, lists, and checks out branches and handles push/pull', async () => {
    const fs = new InMemoryFileSystemProvider();
    const git = new InMemoryGitProvider(fs);

    await git.clone({
      url: 'https://github.com/octocat/Hello-World',
      dir: '/repo',
    });

    await expect(git.createBranch('/repo', '   ')).rejects.toMatchObject({
      code: 'GIT_INVALID_ARGUMENT',
    });
    await expect(git.createBranch('/repo', 'main')).rejects.toMatchObject({
      code: 'GIT_BRANCH_EXISTS',
    });

    await git.createBranch('/repo', 'feat/branch-test', true);
    expect(await git.currentBranch('/repo')).toBe('feat/branch-test');

    const branches = await git.listBranches('/repo');
    expect(branches).toEqual([
      { name: 'main', current: false },
      { name: 'feat/branch-test', current: true },
    ]);

    await fs.writeFile('/repo/README.md', '# Updated on feature branch\n');
    await git.stage('/repo', ['README.md']);
    await git.commit('/repo', 'docs: update readme', {
      name: 'Dev',
      email: 'dev@example.com',
    });

    await git.checkout('/repo', 'main');
    expect(await git.currentBranch('/repo')).toBe('main');
    expect(await fs.readTextFile('/repo/README.md')).toBe('# Hello-World\n');

    await expect(git.checkout('/repo', 'non-existent')).rejects.toMatchObject({
      code: 'GIT_BRANCH_NOT_FOUND',
    });

    await expect(git.push('/repo', { token: '   ' })).rejects.toMatchObject({
      code: 'GIT_AUTH_REQUIRED',
    });
    await expect(git.push('/repo', { token: 'ghp_valid_token' })).resolves.toBeUndefined();
    await expect(git.pull('/repo')).resolves.toBeUndefined();
  });
});
