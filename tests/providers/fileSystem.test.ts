import { describe, expect, it } from 'vitest';
import {
  type FileChangeEvent,
  FileSystemError,
  InMemoryFileSystemProvider,
  baseName,
  normalizeFsPath,
  parentDirPath,
} from '@/providers/fileSystem';

describe('providers/fileSystem', () => {
  describe('path helpers', () => {
    it('normalizes paths and clamps parent traversal at root', () => {
      expect(normalizeFsPath('')).toBe('/');
      expect(normalizeFsPath('/')).toBe('/');
      expect(normalizeFsPath('src\\components//App.vue')).toBe('/src/components/App.vue');
      expect(normalizeFsPath('/a/b/./c/../d/')).toBe('/a/b/d');
      expect(normalizeFsPath('/../../outside/root')).toBe('/outside/root');
    });

    it('resolves parent directory and base name accurately', () => {
      expect(parentDirPath('/')).toBe('/');
      expect(parentDirPath('/file.ts')).toBe('/');
      expect(parentDirPath('/src/index.ts')).toBe('/src');
      expect(baseName('/')).toBe('');
      expect(baseName('/file.ts')).toBe('file.ts');
      expect(baseName('/src/index.ts')).toBe('index.ts');
    });

    it('constructs FileSystemError with code, path, and message', () => {
      const defaultErr = new FileSystemError('ENOENT', '/missing.ts');
      expect(defaultErr).toBeInstanceOf(Error);
      expect(defaultErr.name).toBe('FileSystemError');
      expect(defaultErr.code).toBe('ENOENT');
      expect(defaultErr.path).toBe('/missing.ts');
      expect(defaultErr.message).toBe('ENOENT: /missing.ts');

      const customErr = new FileSystemError('EACCES', '/secret', 'Access denied');
      expect(customErr.message).toBe('Access denied');
    });
  });

  describe('InMemoryFileSystemProvider', () => {
    it('initializes with root directory and expected capabilities', async () => {
      const fs = new InMemoryFileSystemProvider('custom-mem');
      expect(fs.id).toBe('custom-mem');
      expect(fs.capabilities).toEqual({
        readonly: false,
        supportsWatch: true,
        supportsDirectDiskWrite: false,
        requiresExportFallback: true,
      });

      expect(await fs.exists('/')).toBe(true);
      const rootStat = await fs.stat('/');
      expect(rootStat.type).toBe('directory');
      expect(rootStat.size).toBe(0);
    });

    it('writes, reads, stats, and checks existence of text and binary files', async () => {
      const fs = new InMemoryFileSystemProvider();
      await fs.createDirectory('/src');
      await fs.writeFile('/src/hello.ts', 'export const x = 42;\n');

      expect(await fs.exists('/src/hello.ts')).toBe(true);
      expect(await fs.readTextFile('/src/hello.ts')).toBe('export const x = 42;\n');

      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      await fs.writeFile('/src/data.bin', binaryData);
      const readBinary = await fs.readFile('/src/data.bin');
      expect(Array.from(readBinary)).toEqual([1, 2, 3, 4, 5]);

      const stat = await fs.stat('/src/data.bin');
      expect(stat.type).toBe('file');
      expect(stat.size).toBe(5);
    });

    it('enforces create, overwrite, parent directory, and type constraints on writeFile and readFile', async () => {
      const fs = new InMemoryFileSystemProvider();

      await expect(fs.stat('/non-existent')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(fs.readFile('/non-existent')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(fs.writeFile('/missing-parent/file.ts', 'hello')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(fs.writeFile('/no-create.ts', 'hello', { create: false })).rejects.toMatchObject({
        code: 'ENOENT',
      });

      await fs.writeFile('/file.ts', 'v1');
      await expect(fs.writeFile('/file.ts', 'v2', { overwrite: false })).rejects.toMatchObject({
        code: 'EEXIST',
      });
      await expect(fs.writeFile('/file.ts/child.ts', 'invalid')).rejects.toMatchObject({
        code: 'ENOTDIR',
      });

      await fs.createDirectory('/dir');
      await expect(fs.readFile('/dir')).rejects.toMatchObject({
        code: 'EISDIR',
      });
      await expect(fs.writeFile('/dir', 'cannot overwrite dir')).rejects.toMatchObject({
        code: 'EISDIR',
      });
    });

    it('creates directories recursively and non-recursively and sorts readDirectory entries', async () => {
      const fs = new InMemoryFileSystemProvider();

      await fs.createDirectory('/');
      await expect(fs.createDirectory('/a/b/c', { recursive: false })).rejects.toMatchObject({
        code: 'ENOENT',
      });

      await fs.createDirectory('/a/b/c', { recursive: true });
      await fs.createDirectory('/a/b/c', { recursive: true });
      await expect(fs.createDirectory('/a/b/c', { recursive: false })).rejects.toMatchObject({
        code: 'EEXIST',
      });

      await fs.writeFile('/a/file-b.ts', 'b');
      await fs.writeFile('/a/file-a.ts', 'a');
      await fs.createDirectory('/a/dir-z');

      await expect(fs.createDirectory('/a/file-a.ts/nested', { recursive: true })).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
      await expect(fs.createDirectory('/a/file-a.ts/sub', { recursive: false })).rejects.toMatchObject({
        code: 'ENOTDIR',
      });

      const entries = await fs.readDirectory('/a');
      expect(entries.map((e) => `${e.type}:${e.name}`)).toEqual([
        'directory:b',
        'directory:dir-z',
        'file:file-a.ts',
        'file:file-b.ts',
      ]);

      await expect(fs.readDirectory('/missing-dir')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(fs.readDirectory('/a/file-a.ts')).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });

    it('deletes files and directories with recursive guard', async () => {
      const fs = new InMemoryFileSystemProvider();

      await expect(fs.delete('/')).rejects.toMatchObject({
        code: 'EINVAL',
      });
      await expect(fs.delete('/does-not-exist')).rejects.toMatchObject({
        code: 'ENOENT',
      });

      await fs.createDirectory('/pkg/src', { recursive: true });
      await fs.writeFile('/pkg/src/main.ts', 'console.log(1);');

      await expect(fs.delete('/pkg', { recursive: false })).rejects.toMatchObject({
        code: 'EINVAL',
      });

      await fs.delete('/pkg', { recursive: true });
      expect(await fs.exists('/pkg')).toBe(false);
      expect(await fs.exists('/pkg/src/main.ts')).toBe(false);
    });

    it('renames files and directory trees while validating targets', async () => {
      const fs = new InMemoryFileSystemProvider();

      await expect(fs.rename('/', '/new-root')).rejects.toMatchObject({
        code: 'EINVAL',
      });
      await expect(fs.rename('/missing', '/target')).rejects.toMatchObject({
        code: 'ENOENT',
      });

      await fs.createDirectory('/src/components', { recursive: true });
      await fs.writeFile('/src/components/Button.vue', '<template />');
      await fs.writeFile('/existing.txt', 'taken');

      await expect(fs.rename('/src/components/Button.vue', '/no-parent/Button.vue')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(fs.rename('/src/components/Button.vue', '/existing.txt/Button.vue')).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
      await expect(
        fs.rename('/src/components/Button.vue', '/existing.txt', { overwrite: false }),
      ).rejects.toMatchObject({
        code: 'EEXIST',
      });

      await fs.rename('/src', '/src');
      expect(await fs.exists('/src/components/Button.vue')).toBe(true);

      await fs.rename('/src', '/app');
      expect(await fs.exists('/src')).toBe(false);
      expect(await fs.exists('/app/components/Button.vue')).toBe(true);
      expect(await fs.readTextFile('/app/components/Button.vue')).toBe('<template />');
    });

    it('emits watch events and stops notifying after dispose', async () => {
      const fs = new InMemoryFileSystemProvider();
      const events: FileChangeEvent[] = [];

      const dispose = fs.watch((event) => {
        events.push(event);
      });

      await fs.createDirectory('/dir');
      await fs.writeFile('/dir/app.ts', 'v1');
      await fs.writeFile('/dir/app.ts', 'v2');
      await fs.delete('/dir/app.ts');

      dispose();
      await fs.writeFile('/dir/ignored.ts', 'v3');

      expect(events).toEqual([
        { type: 'created', path: '/dir' },
        { type: 'created', path: '/dir/app.ts' },
        { type: 'changed', path: '/dir/app.ts' },
        { type: 'deleted', path: '/dir/app.ts' },
      ]);
    });
  });
});
