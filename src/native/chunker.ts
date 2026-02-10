/**
 * @file chunker.ts
 * @description TypeScript wrapper for native Semantic Code Chunker
 * @version 1.0.0
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

// ESM compatibility: get __dirname and require equivalents
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Types for the native chunker
export interface SourceLocation {
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  byteOffset: number;
  byteLength: number;
}

export interface ChunkContext {
  parentName: string;
  namespaceName: string;
  imports: string[];
}

export interface CodeChunk {
  content: string;
  tokenCount: number;
  location: SourceLocation;
  type: ChunkType;
  context: ChunkContext;
  chunkIndex: number;
  hash: string;
}

export type ChunkType =
  | 'unknown'
  | 'function'
  | 'class'
  | 'struct'
  | 'interface'
  | 'enum'
  | 'module'
  | 'import'
  | 'export'
  | 'comment'
  | 'block'
  | 'statement';

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

export interface ChunkerConfig {
  maxChunkTokens?: number;
  minChunkTokens?: number;
  overlapTokens?: number;
  respectBoundaries?: boolean;
  includeContext?: boolean;
  preserveImports?: boolean;
  language?: Language;
}

export interface ChunkResult {
  chunks: CodeChunk[];
  totalTokens: number;
  totalLines: number;
  chunkingTimeMs: number;
  error?: string;
}

// Native module interface
interface NativeChunkerModule {
  Chunker: new (config?: ChunkerConfig) => NativeChunker;
  chunk: (source: string, options?: ChunkerConfig & { filepath?: string }) => ChunkResult;
  chunkFile: (filepath: string, options?: ChunkerConfig) => ChunkResult;
  countTokens: (text: string) => number;
  version: string;
}

interface NativeChunker {
  chunk(source: string, filepath?: string): ChunkResult;
  chunkFile(filepath: string): ChunkResult;
  setConfig(config: ChunkerConfig): void;
  getConfig(): ChunkerConfig;
}

// Try to load native module, fall back to JS implementation
let nativeModule: NativeChunkerModule | null = null;
let loadError: Error | null = null;

try {
  // Try different paths for the native module
  const possiblePaths = [
    '../native/build/Release/archicore_chunker.node',
    '../native/build/Debug/archicore_chunker.node',
    '../../native/build/Release/archicore_chunker.node',
    '../../native/build/Debug/archicore_chunker.node',
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
 * Check if native chunker is available
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

/**
 * Simple JavaScript tokenizer fallback
 * Approximates token count similar to tiktoken cl100k_base
 */
function jsCountTokens(text: string): number {
  if (!text) return 0;

  let count = 0;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text.charCodeAt(i);

    // Whitespace
    if (c === 32 || c === 9) {
      while (i < len && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) {
        i++;
      }
      count++;
      continue;
    }

    // Newline
    if (c === 10 || c === 13) {
      i++;
      count++;
      continue;
    }

    // Word (letters, digits, underscore)
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128) {
      const start = i;
      while (i < len) {
        const cc = text.charCodeAt(i);
        if (
          !((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 95 || cc >= 128)
        ) {
          break;
        }
        i++;
      }
      const wordLen = i - start;
      if (wordLen <= 4) count += 1;
      else if (wordLen <= 8) count += 2;
      else if (wordLen <= 12) count += 3;
      else count += Math.ceil(wordLen / 4);
      continue;
    }

    // Number
    if (c >= 48 && c <= 57) {
      const start = i;
      while (i < len) {
        const cc = text.charCodeAt(i);
        if (!(cc >= 48 && cc <= 57) && cc !== 46) break;
        i++;
      }
      const numLen = i - start;
      count += Math.ceil(numLen / 3);
      continue;
    }

    // Punctuation or other
    i++;
    count++;
  }

  return count;
}

/**
 * Simple JavaScript chunker fallback
 */
function jsChunk(source: string, options: ChunkerConfig = {}): ChunkResult {
  const startTime = performance.now();

  const maxTokens = options.maxChunkTokens ?? 512;
  const minTokens = options.minChunkTokens ?? 64;
  const overlapTokens = options.overlapTokens ?? 50;

  const chunks: CodeChunk[] = [];
  const lines = source.split('\n');
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let lineStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] + '\n';
    const lineTokens = jsCountTokens(line);

    if (currentTokens + lineTokens > maxTokens && currentChunk) {
      // Save current chunk
      chunks.push({
        content: currentChunk,
        tokenCount: currentTokens,
        location: {
          lineStart,
          lineEnd: i,
          columnStart: 1,
          columnEnd: 1,
          byteOffset: 0,
          byteLength: currentChunk.length,
        },
        type: 'block',
        context: {
          parentName: '',
          namespaceName: '',
          imports: [],
        },
        chunkIndex: chunkIndex++,
        hash: '',
      });

      // Start new chunk with overlap
      const overlapLines: string[] = [];
      let overlapCount = 0;
      for (let j = i - 1; j >= 0 && overlapCount < overlapTokens; j--) {
        const ol = lines[j] + '\n';
        overlapCount += jsCountTokens(ol);
        overlapLines.unshift(ol);
      }

      currentChunk = overlapLines.join('') + line;
      currentTokens = jsCountTokens(currentChunk);
      lineStart = i - overlapLines.length + 1;
    } else {
      currentChunk += line;
      currentTokens += lineTokens;
    }
  }

  // Don't forget last chunk
  if (currentChunk && currentTokens >= minTokens) {
    chunks.push({
      content: currentChunk,
      tokenCount: currentTokens,
      location: {
        lineStart,
        lineEnd: lines.length,
        columnStart: 1,
        columnEnd: 1,
        byteOffset: 0,
        byteLength: currentChunk.length,
      },
      type: 'block',
      context: {
        parentName: '',
        namespaceName: '',
        imports: [],
      },
      chunkIndex: chunkIndex++,
      hash: '',
    });
  }

  const endTime = performance.now();

  return {
    chunks,
    totalTokens: jsCountTokens(source),
    totalLines: lines.length,
    chunkingTimeMs: endTime - startTime,
  };
}

/**
 * Semantic Code Chunker class
 * Uses native implementation when available, falls back to JS
 */
export class SemanticChunker {
  private config: ChunkerConfig;
  private nativeChunker: NativeChunker | null = null;

  constructor(config: ChunkerConfig = {}) {
    this.config = {
      maxChunkTokens: 512,
      minChunkTokens: 64,
      overlapTokens: 50,
      respectBoundaries: true,
      includeContext: true,
      preserveImports: true,
      ...config,
    };

    if (nativeModule) {
      this.nativeChunker = new nativeModule.Chunker(this.config);
    }
  }

  /**
   * Chunk source code into semantic pieces
   */
  chunk(source: string, filepath?: string): ChunkResult {
    if (this.nativeChunker) {
      return this.nativeChunker.chunk(source, filepath);
    }
    return jsChunk(source, this.config);
  }

  /**
   * Chunk a file using memory-mapped reading
   */
  chunkFile(filepath: string): ChunkResult {
    if (this.nativeChunker) {
      return this.nativeChunker.chunkFile(filepath);
    }
    // JS fallback: read file normally
    const fs = require('fs');
    const source = fs.readFileSync(filepath, 'utf-8');
    return this.chunk(source, filepath);
  }

  /**
   * Update configuration
   */
  setConfig(config: ChunkerConfig): void {
    this.config = { ...this.config, ...config };
    if (this.nativeChunker) {
      this.nativeChunker.setConfig(this.config);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ChunkerConfig {
    return { ...this.config };
  }

  /**
   * Check if using native implementation
   */
  isNative(): boolean {
    return this.nativeChunker !== null;
  }
}

/**
 * Standalone chunk function
 */
export function chunk(source: string, options?: ChunkerConfig & { filepath?: string }): ChunkResult {
  if (nativeModule) {
    return nativeModule.chunk(source, options);
  }
  return jsChunk(source, options);
}

/**
 * Chunk a file
 */
export function chunkFile(filepath: string, options?: ChunkerConfig): ChunkResult {
  if (nativeModule) {
    return nativeModule.chunkFile(filepath, options);
  }
  const fs = require('fs');
  const source = fs.readFileSync(filepath, 'utf-8');
  return jsChunk(source, options);
}

/**
 * Count tokens in text
 */
export function countTokens(text: string): number {
  if (nativeModule) {
    return nativeModule.countTokens(text);
  }
  return jsCountTokens(text);
}

/**
 * Get native module version
 */
export function getVersion(): string {
  if (nativeModule) {
    return `native-${nativeModule.version}`;
  }
  return 'js-fallback-1.0.0';
}

export default {
  SemanticChunker,
  chunk,
  chunkFile,
  countTokens,
  isNativeAvailable,
  getNativeLoadError,
  getVersion,
};
