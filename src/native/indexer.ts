/**
 * @file indexer.ts
 * @description TypeScript wrapper for native Incremental Index Engine
 * @version 1.0.0
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

// ESM compatibility: get __dirname and require equivalents
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Types
export type Language =
  | 'unknown'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'cpp'
  | 'c'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin';

export interface FileEntry {
  path: string;
  contentHash: string;
  size: number;
  mtime: number;
  language: Language;
  isIndexed: boolean;
}

export interface DirEntry {
  path: string;
  merkleHash: string;
  fileCount: number;
  dirCount: number;
}

export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface FileChange {
  type: ChangeType;
  path: string;
  oldPath?: string;
  oldHash: string;
  newHash: string;
}

export interface ScanResult {
  files: FileEntry[];
  directories: DirEntry[];
  totalSize: number;
  totalFiles: number;
  totalDirs: number;
  scanTimeMs: number;
  error?: string;
}

export interface DiffResult {
  changes: FileChange[];
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  renamedCount: number;
  diffTimeMs: number;
  error?: string;
}

export interface IndexerConfig {
  includePatterns?: string[];
  excludePatterns?: string[];
  followSymlinks?: boolean;
  computeContentHash?: boolean;
  detectRenames?: boolean;
  maxFileSize?: number;
  parallelWorkers?: number;
}

// Native module interface
interface NativeIndexerModule {
  Indexer: new (config?: IndexerConfig) => NativeIndexer;
  FileIndex: new () => NativeFileIndex;
  hashFile: (path: string) => string;
  hashString: (content: string) => string;
  scan: (rootPath: string, config?: IndexerConfig) => ScanResult;
  globMatch: (path: string, pattern: string) => boolean;
  version: string;
}

interface NativeIndexer {
  scan(rootPath: string): ScanResult;
  diff(oldScan: ScanResult, newScan: ScanResult): DiffResult;
  setConfig(config: IndexerConfig): void;
  getConfig(): IndexerConfig;
}

interface NativeFileIndex {
  add(entry: FileEntry): void;
  remove(path: string): void;
  get(path: string): FileEntry | null;
  contains(path: string): boolean;
  getAll(): FileEntry[];
  getByLanguage(language: Language): FileEntry[];
  size(): number;
  clear(): void;
  save(path: string): boolean;
  load(path: string): boolean;
  merkleHash(): string;
}

// Try to load native module
let nativeModule: NativeIndexerModule | null = null;
let loadError: Error | null = null;

try {
  const possiblePaths = [
    '../native/build/Release/archicore_indexer.node',
    '../native/build/Debug/archicore_indexer.node',
    '../../native/build/Release/archicore_indexer.node',
    '../../native/build/Debug/archicore_indexer.node',
  ];

  for (const modulePath of possiblePaths) {
    try {
      const fullPath = path.resolve(__dirname, modulePath);
      nativeModule = require(fullPath);
      break;
    } catch {
      // Try next path
    }
  }
} catch (e) {
  loadError = e as Error;
}

/**
 * Check if native indexer is available
 */
export function isNativeAvailable(): boolean {
  return nativeModule !== null;
}

/**
 * Get native module load error if any
 */
export function getNativeLoadError(): Error | null {
  return loadError;
}

// Default exclude patterns
const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/__pycache__/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/vendor/**',
  '**/.venv/**',
  '**/target/**',
];

/**
 * Simple glob pattern matching (JS fallback)
 */
function jsGlobMatch(filePath: string, pattern: string): boolean {
  // Convert glob to regex
  let regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\?/g, '[^/\\\\]');

  try {
    const rx = new RegExp(`^${regexStr}$`, 'i');
    return rx.test(filePath);
  } catch {
    return false;
  }
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, Language> = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.py': 'python',
    '.pyw': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.h': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
  };
  return langMap[ext] || 'unknown';
}

/**
 * Simple hash function (JS fallback)
 */
function jsHashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    // Convert to numeric string (like xxHash64)
    return BigInt('0x' + hash.slice(0, 16)).toString();
  } catch {
    return '0';
  }
}

function jsHashString(content: string): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return BigInt('0x' + hash.slice(0, 16)).toString();
}

/**
 * JavaScript scan fallback
 */
async function jsScan(rootPath: string, config: IndexerConfig = {}): Promise<ScanResult> {
  const startTime = performance.now();

  const excludePatterns = config.excludePatterns ?? DEFAULT_EXCLUDES;
  const includePatterns = config.includePatterns ?? [];
  const maxFileSize = config.maxFileSize ?? 10 * 1024 * 1024;
  const computeHash = config.computeContentHash ?? true;

  const files: FileEntry[] = [];
  const directories: DirEntry[] = [];
  let totalSize = 0;

  function shouldExclude(relPath: string): boolean {
    for (const pattern of excludePatterns) {
      if (jsGlobMatch(relPath, pattern)) return true;
    }
    return false;
  }

  function shouldInclude(relPath: string): boolean {
    if (includePatterns.length === 0) return true;
    for (const pattern of includePatterns) {
      if (jsGlobMatch(relPath, pattern)) return true;
    }
    return false;
  }

  async function walkDir(dir: string, relDir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relDir, entry.name).replace(/\\/g, '/');

      if (shouldExclude(relPath)) continue;

      if (entry.isDirectory()) {
        directories.push({
          path: relPath,
          merkleHash: '0',
          fileCount: 0,
          dirCount: 0,
        });
        await walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        if (!shouldInclude(relPath)) continue;

        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.size > maxFileSize) continue;

          files.push({
            path: relPath,
            contentHash: computeHash ? jsHashFile(fullPath) : '0',
            size: stat.size,
            mtime: stat.mtimeMs,
            language: detectLanguage(relPath),
            isIndexed: false,
          });

          totalSize += stat.size;
        } catch {
          // Skip files we can't read
        }
      }
    }
  }

  try {
    await walkDir(rootPath, '');
  } catch (e) {
    return {
      files: [],
      directories: [],
      totalSize: 0,
      totalFiles: 0,
      totalDirs: 0,
      scanTimeMs: 0,
      error: (e as Error).message,
    };
  }

  const endTime = performance.now();

  return {
    files,
    directories,
    totalSize,
    totalFiles: files.length,
    totalDirs: directories.length,
    scanTimeMs: endTime - startTime,
  };
}

/**
 * JavaScript diff fallback
 */
function jsDiff(oldScan: ScanResult, newScan: ScanResult, detectRenames = true): DiffResult {
  const startTime = performance.now();

  const changes: FileChange[] = [];
  let addedCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;
  let renamedCount = 0;

  const oldFiles = new Map<string, FileEntry>();
  const newFiles = new Map<string, FileEntry>();

  for (const file of oldScan.files) {
    oldFiles.set(file.path, file);
  }
  for (const file of newScan.files) {
    newFiles.set(file.path, file);
  }

  // Detect renames by content hash
  const renamedOldPaths = new Set<string>();
  const renamedNewPaths = new Set<string>();

  if (detectRenames) {
    const oldByHash = new Map<string, string[]>();
    const newByHash = new Map<string, string[]>();

    for (const [path, file] of oldFiles) {
      if (file.contentHash !== '0') {
        const paths = oldByHash.get(file.contentHash) ?? [];
        paths.push(path);
        oldByHash.set(file.contentHash, paths);
      }
    }
    for (const [path, file] of newFiles) {
      if (file.contentHash !== '0') {
        const paths = newByHash.get(file.contentHash) ?? [];
        paths.push(path);
        newByHash.set(file.contentHash, paths);
      }
    }

    for (const [hash, oldPaths] of oldByHash) {
      const newPaths = newByHash.get(hash);
      if (!newPaths) continue;

      for (const oldPath of oldPaths) {
        if (newFiles.has(oldPath)) continue; // File still exists

        for (const newPath of newPaths) {
          if (oldFiles.has(newPath)) continue; // File existed before

          changes.push({
            type: 'renamed',
            path: newPath,
            oldPath,
            oldHash: hash,
            newHash: hash,
          });
          renamedOldPaths.add(oldPath);
          renamedNewPaths.add(newPath);
          renamedCount++;
          break;
        }
      }
    }
  }

  // Find added and modified
  for (const [path, newFile] of newFiles) {
    if (renamedNewPaths.has(path)) continue;

    const oldFile = oldFiles.get(path);
    if (!oldFile) {
      changes.push({
        type: 'added',
        path,
        oldHash: '0',
        newHash: newFile.contentHash,
      });
      addedCount++;
    } else if (oldFile.contentHash !== newFile.contentHash) {
      changes.push({
        type: 'modified',
        path,
        oldHash: oldFile.contentHash,
        newHash: newFile.contentHash,
      });
      modifiedCount++;
    }
  }

  // Find deleted
  for (const [path, oldFile] of oldFiles) {
    if (renamedOldPaths.has(path)) continue;

    if (!newFiles.has(path)) {
      changes.push({
        type: 'deleted',
        path,
        oldHash: oldFile.contentHash,
        newHash: '0',
      });
      deletedCount++;
    }
  }

  const endTime = performance.now();

  return {
    changes,
    addedCount,
    modifiedCount,
    deletedCount,
    renamedCount,
    diffTimeMs: endTime - startTime,
  };
}

/**
 * File Index class (in-memory with persistence)
 */
export class FileIndex {
  private entries: Map<string, FileEntry> = new Map();
  private nativeIndex: NativeFileIndex | null = null;

  constructor() {
    if (nativeModule) {
      this.nativeIndex = new nativeModule.FileIndex();
    }
  }

  add(entry: FileEntry): void {
    if (this.nativeIndex) {
      this.nativeIndex.add(entry);
    } else {
      this.entries.set(entry.path, entry);
    }
  }

  remove(path: string): void {
    if (this.nativeIndex) {
      this.nativeIndex.remove(path);
    } else {
      this.entries.delete(path);
    }
  }

  get(path: string): FileEntry | null {
    if (this.nativeIndex) {
      return this.nativeIndex.get(path);
    }
    return this.entries.get(path) ?? null;
  }

  contains(path: string): boolean {
    if (this.nativeIndex) {
      return this.nativeIndex.contains(path);
    }
    return this.entries.has(path);
  }

  getAll(): FileEntry[] {
    if (this.nativeIndex) {
      return this.nativeIndex.getAll();
    }
    return Array.from(this.entries.values());
  }

  getByLanguage(language: Language): FileEntry[] {
    if (this.nativeIndex) {
      return this.nativeIndex.getByLanguage(language);
    }
    return this.getAll().filter((e) => e.language === language);
  }

  size(): number {
    if (this.nativeIndex) {
      return this.nativeIndex.size();
    }
    return this.entries.size;
  }

  clear(): void {
    if (this.nativeIndex) {
      this.nativeIndex.clear();
    } else {
      this.entries.clear();
    }
  }

  save(filePath: string): boolean {
    if (this.nativeIndex) {
      return this.nativeIndex.save(filePath);
    }
    try {
      const data = JSON.stringify(this.getAll());
      fs.writeFileSync(filePath, data);
      return true;
    } catch {
      return false;
    }
  }

  load(filePath: string): boolean {
    if (this.nativeIndex) {
      return this.nativeIndex.load(filePath);
    }
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const entries: FileEntry[] = JSON.parse(data);
      this.entries.clear();
      for (const entry of entries) {
        this.entries.set(entry.path, entry);
      }
      return true;
    } catch {
      return false;
    }
  }

  merkleHash(): string {
    if (this.nativeIndex) {
      return this.nativeIndex.merkleHash();
    }
    // Simple combined hash for JS fallback
    const hashes = this.getAll()
      .map((e) => e.contentHash)
      .sort()
      .join('');
    return jsHashString(hashes);
  }

  isNative(): boolean {
    return this.nativeIndex !== null;
  }
}

/**
 * Incremental Indexer class
 */
export class IncrementalIndexer {
  private config: IndexerConfig;
  private nativeIndexer: NativeIndexer | null = null;

  constructor(config: IndexerConfig = {}) {
    this.config = {
      excludePatterns: DEFAULT_EXCLUDES,
      followSymlinks: false,
      computeContentHash: true,
      detectRenames: true,
      maxFileSize: 10 * 1024 * 1024,
      parallelWorkers: 4,
      ...config,
    };

    if (nativeModule) {
      this.nativeIndexer = new nativeModule.Indexer(this.config);
    }
  }

  async scan(rootPath: string): Promise<ScanResult> {
    if (this.nativeIndexer) {
      return this.nativeIndexer.scan(rootPath);
    }
    return jsScan(rootPath, this.config);
  }

  diff(oldScan: ScanResult, newScan: ScanResult): DiffResult {
    if (this.nativeIndexer) {
      return this.nativeIndexer.diff(oldScan, newScan);
    }
    return jsDiff(oldScan, newScan, this.config.detectRenames);
  }

  async incrementalUpdate(rootPath: string, previousIndex: FileIndex): Promise<DiffResult> {
    const newScan = await this.scan(rootPath);
    const oldScan: ScanResult = {
      files: previousIndex.getAll(),
      directories: [],
      totalSize: 0,
      totalFiles: previousIndex.size(),
      totalDirs: 0,
      scanTimeMs: 0,
    };
    return this.diff(oldScan, newScan);
  }

  setConfig(config: IndexerConfig): void {
    this.config = { ...this.config, ...config };
    if (this.nativeIndexer) {
      this.nativeIndexer.setConfig(this.config);
    }
  }

  getConfig(): IndexerConfig {
    return { ...this.config };
  }

  isNative(): boolean {
    return this.nativeIndexer !== null;
  }
}

/**
 * Standalone functions
 */
export function hashFile(filePath: string): string {
  if (nativeModule) {
    return nativeModule.hashFile(filePath);
  }
  return jsHashFile(filePath);
}

export function hashString(content: string): string {
  if (nativeModule) {
    return nativeModule.hashString(content);
  }
  return jsHashString(content);
}

export async function scan(rootPath: string, config?: IndexerConfig): Promise<ScanResult> {
  if (nativeModule) {
    return nativeModule.scan(rootPath, config);
  }
  return jsScan(rootPath, config);
}

export function globMatch(filePath: string, pattern: string): boolean {
  if (nativeModule) {
    return nativeModule.globMatch(filePath, pattern);
  }
  return jsGlobMatch(filePath, pattern);
}

export function getVersion(): string {
  if (nativeModule) {
    return `native-${nativeModule.version}`;
  }
  return 'js-fallback-1.0.0';
}

export default {
  FileIndex,
  IncrementalIndexer,
  hashFile,
  hashString,
  scan,
  globMatch,
  isNativeAvailable,
  getNativeLoadError,
  getVersion,
};
