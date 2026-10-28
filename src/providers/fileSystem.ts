export type FileEntryType = 'file' | 'directory';

export interface FileStat {
  type: FileEntryType;
  size: number;
  mtime: number;
  ctime: number;
  readonly?: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  type: FileEntryType;
}

export interface FileSystemCapabilities {
  readonly: boolean;
  supportsWatch: boolean;
  supportsDirectDiskWrite: boolean;
  requiresExportFallback: boolean;
}

export type FileChangeKind = 'created' | 'changed' | 'deleted';

export interface FileChangeEvent {
  type: FileChangeKind;
  path: string;
}

export type FileSystemErrorCode = 'ENOENT' | 'EEXIST' | 'EISDIR' | 'ENOTDIR' | 'EACCES' | 'EINVAL';

export class FileSystemError extends Error {
  public readonly code: FileSystemErrorCode;
  public readonly path: string;

  public constructor(code: FileSystemErrorCode, path: string, message?: string) {
    super(message ?? `${code}: ${path}`);
    this.name = 'FileSystemError';
    this.code = code;
    this.path = path;
  }
}

export interface IFileSystemProvider {
  readonly id: string;
  readonly capabilities: FileSystemCapabilities;

  stat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeFile(
    path: string,
    content: Uint8Array | string,
    options?: { create?: boolean; overwrite?: boolean },
  ): Promise<void>;
  readDirectory(path: string): Promise<FileEntry[]>;
  createDirectory(path: string, options?: { recursive?: boolean }): Promise<void>;
  delete(path: string, options?: { recursive?: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string, options?: { overwrite?: boolean }): Promise<void>;
  watch(listener: (event: FileChangeEvent) => void): () => void;
}

/**
 * Normalizes any virtual or POSIX path into a canonical absolute path starting with `/`.
 * Rejects path traversal segments (`..`) that escape root by clamping at `/`.
 */
export function normalizeFsPath(rawPath: string): string {
  const unified = rawPath.replace(/\\/g, '/').trim();
  const segments = unified.split('/');
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }

  return '/' + resolved.join('/');
}

export function parentDirPath(normalizedPath: string): string {
  if (normalizedPath === '/') {
    return '/';
  }
  const lastSlash = normalizedPath.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : normalizedPath.slice(0, lastSlash);
}

export function baseName(normalizedPath: string): string {
  if (normalizedPath === '/') {
    return '';
  }
  const lastSlash = normalizedPath.lastIndexOf('/');
  return normalizedPath.slice(lastSlash + 1);
}

interface InMemoryNode {
  type: FileEntryType;
  content: Uint8Array;
  ctime: number;
  mtime: number;
}

/**
 * Deterministic in-memory implementation of `IFileSystemProvider` for unit tests and scratch workspaces.
 */
export class InMemoryFileSystemProvider implements IFileSystemProvider {
  public readonly id: string;
  public readonly capabilities: FileSystemCapabilities = {
    readonly: false,
    supportsWatch: true,
    supportsDirectDiskWrite: false,
    requiresExportFallback: true,
  };

  private readonly nodes = new Map<string, InMemoryNode>();
  private readonly listeners = new Set<(event: FileChangeEvent) => void>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder('utf-8');

  public constructor(id = 'in-memory') {
    this.id = id;
    const now = Date.now();
    this.nodes.set('/', {
      type: 'directory',
      content: new Uint8Array(0),
      ctime: now,
      mtime: now,
    });
  }

  public stat(path: string): Promise<FileStat> {
    const normalized = normalizeFsPath(path);
    const node = this.nodes.get(normalized);
    if (!node) {
      return Promise.reject(new FileSystemError('ENOENT', normalized, `File or directory not found: ${normalized}`));
    }
    return Promise.resolve({
      type: node.type,
      size: node.type === 'file' ? node.content.byteLength : 0,
      ctime: node.ctime,
      mtime: node.mtime,
      readonly: false,
    });
  }

  public exists(path: string): Promise<boolean> {
    const normalized = normalizeFsPath(path);
    return Promise.resolve(this.nodes.has(normalized));
  }

  public readFile(path: string): Promise<Uint8Array> {
    const normalized = normalizeFsPath(path);
    const node = this.nodes.get(normalized);
    if (!node) {
      return Promise.reject(new FileSystemError('ENOENT', normalized, `File not found: ${normalized}`));
    }
    if (node.type === 'directory') {
      return Promise.reject(new FileSystemError('EISDIR', normalized, `Cannot read directory as file: ${normalized}`));
    }
    return Promise.resolve(new Uint8Array(node.content));
  }

  public async readTextFile(path: string): Promise<string> {
    const bytes = await this.readFile(path);
    return this.decoder.decode(bytes);
  }

  public writeFile(
    path: string,
    content: Uint8Array | string,
    options?: { create?: boolean; overwrite?: boolean },
  ): Promise<void> {
    const normalized = normalizeFsPath(path);
    const create = options?.create ?? true;
    const overwrite = options?.overwrite ?? true;

    const parent = parentDirPath(normalized);
    const parentNode = this.nodes.get(parent);
    if (!parentNode) {
      return Promise.reject(new FileSystemError('ENOENT', parent, `Parent directory does not exist: ${parent}`));
    }
    if (parentNode.type !== 'directory') {
      return Promise.reject(new FileSystemError('ENOTDIR', parent, `Parent path is not a directory: ${parent}`));
    }

    const existing = this.nodes.get(normalized);
    if (existing) {
      if (existing.type === 'directory') {
        return Promise.reject(
          new FileSystemError('EISDIR', normalized, `Cannot overwrite directory with file: ${normalized}`),
        );
      }
      if (!overwrite) {
        return Promise.reject(new FileSystemError('EEXIST', normalized, `File already exists: ${normalized}`));
      }
    } else if (!create) {
      return Promise.reject(new FileSystemError('ENOENT', normalized, `File does not exist: ${normalized}`));
    }

    const bytes = typeof content === 'string' ? this.encoder.encode(content) : new Uint8Array(content);
    const now = Date.now();
    this.nodes.set(normalized, {
      type: 'file',
      content: bytes,
      ctime: existing?.ctime ?? now,
      mtime: now,
    });

    this.emit({
      type: existing ? 'changed' : 'created',
      path: normalized,
    });
    return Promise.resolve();
  }

  public readDirectory(path: string): Promise<FileEntry[]> {
    const normalized = normalizeFsPath(path);
    const node = this.nodes.get(normalized);
    if (!node) {
      return Promise.reject(new FileSystemError('ENOENT', normalized, `Directory not found: ${normalized}`));
    }
    if (node.type !== 'directory') {
      return Promise.reject(new FileSystemError('ENOTDIR', normalized, `Path is not a directory: ${normalized}`));
    }

    const entries: FileEntry[] = [];
    for (const [entryPath, entryNode] of this.nodes.entries()) {
      if (entryPath === '/' || entryPath === normalized) {
        continue;
      }
      if (parentDirPath(entryPath) === normalized) {
        entries.push({
          name: baseName(entryPath),
          path: entryPath,
          type: entryNode.type,
        });
      }
    }

    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return Promise.resolve(entries);
  }

  public createDirectory(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalized = normalizeFsPath(path);
    const recursive = options?.recursive ?? false;

    if (normalized === '/') {
      return Promise.resolve();
    }

    const existing = this.nodes.get(normalized);
    if (existing) {
      if (existing.type === 'directory' && recursive) {
        return Promise.resolve();
      }
      return Promise.reject(new FileSystemError('EEXIST', normalized, `Path already exists: ${normalized}`));
    }

    if (recursive) {
      const segments = normalized.split('/').filter(Boolean);
      let current = '';
      const now = Date.now();
      for (const segment of segments) {
        current += '/' + segment;
        const currentNode = this.nodes.get(current);
        if (!currentNode) {
          this.nodes.set(current, {
            type: 'directory',
            content: new Uint8Array(0),
            ctime: now,
            mtime: now,
          });
          this.emit({ type: 'created', path: current });
        } else if (currentNode.type !== 'directory') {
          return Promise.reject(new FileSystemError('ENOTDIR', current, `Ancestor is not a directory: ${current}`));
        }
      }
      return Promise.resolve();
    }

    const parent = parentDirPath(normalized);
    const parentNode = this.nodes.get(parent);
    if (!parentNode) {
      return Promise.reject(new FileSystemError('ENOENT', parent, `Parent directory not found: ${parent}`));
    }
    if (parentNode.type !== 'directory') {
      return Promise.reject(new FileSystemError('ENOTDIR', parent, `Parent is not a directory: ${parent}`));
    }

    const now = Date.now();
    this.nodes.set(normalized, {
      type: 'directory',
      content: new Uint8Array(0),
      ctime: now,
      mtime: now,
    });
    this.emit({ type: 'created', path: normalized });
    return Promise.resolve();
  }

  public delete(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalized = normalizeFsPath(path);
    if (normalized === '/') {
      return Promise.reject(new FileSystemError('EINVAL', normalized, 'Cannot delete root directory'));
    }

    const node = this.nodes.get(normalized);
    if (!node) {
      return Promise.reject(new FileSystemError('ENOENT', normalized, `Path not found: ${normalized}`));
    }

    const recursive = options?.recursive ?? false;
    const prefix = `${normalized}/`;
    const descendants = Array.from(this.nodes.keys()).filter((key) => key.startsWith(prefix));

    if (node.type === 'directory' && descendants.length > 0 && !recursive) {
      return Promise.reject(
        new FileSystemError('EINVAL', normalized, `Directory is not empty (use recursive: true): ${normalized}`),
      );
    }

    for (const descendant of descendants) {
      this.nodes.delete(descendant);
      this.emit({ type: 'deleted', path: descendant });
    }

    this.nodes.delete(normalized);
    this.emit({ type: 'deleted', path: normalized });
    return Promise.resolve();
  }

  public rename(oldPath: string, newPath: string, options?: { overwrite?: boolean }): Promise<void> {
    const source = normalizeFsPath(oldPath);
    const target = normalizeFsPath(newPath);
    const overwrite = options?.overwrite ?? false;

    if (source === '/' || target === '/') {
      return Promise.reject(new FileSystemError('EINVAL', source, 'Cannot rename root directory'));
    }

    const sourceNode = this.nodes.get(source);
    if (!sourceNode) {
      return Promise.reject(new FileSystemError('ENOENT', source, `Source not found: ${source}`));
    }

    const targetParent = parentDirPath(target);
    const targetParentNode = this.nodes.get(targetParent);
    if (!targetParentNode) {
      return Promise.reject(new FileSystemError('ENOENT', targetParent, `Target parent not found: ${targetParent}`));
    }
    if (targetParentNode.type !== 'directory') {
      return Promise.reject(
        new FileSystemError('ENOTDIR', targetParent, `Target parent is not a directory: ${targetParent}`),
      );
    }

    if (source === target) {
      return Promise.resolve();
    }

    const existingTarget = this.nodes.get(target);
    if (existingTarget && !overwrite) {
      return Promise.reject(new FileSystemError('EEXIST', target, `Target already exists: ${target}`));
    }

    const now = Date.now();
    const prefix = `${source}/`;
    const entriesToMove = Array.from(this.nodes.entries()).filter(([k]) => k === source || k.startsWith(prefix));

    for (const [key, value] of entriesToMove) {
      const relocated = key === source ? target : `${target}${key.slice(source.length)}`;
      this.nodes.delete(key);
      this.nodes.set(relocated, {
        ...value,
        mtime: now,
      });
      this.emit({ type: 'deleted', path: key });
      this.emit({ type: 'created', path: relocated });
    }

    return Promise.resolve();
  }

  public watch(listener: (event: FileChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: FileChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
