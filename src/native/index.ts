/**
 * @file index.ts
 * @description ArchiCore Native Modules - Main Entry Point
 * @version 1.0.0
 *
 * Provides high-performance native modules for ArchiCore:
 * - Semantic Code Chunker: Fast code chunking with semantic boundary detection
 * - Incremental Indexer: Efficient file indexing with Merkle tree diff detection
 *
 * Both modules have JavaScript fallbacks for environments where native
 * compilation is not available.
 */

// Re-export chunker
export {
  SemanticChunker,
  chunk,
  chunkFile,
  countTokens,
  isNativeAvailable as isChunkerNativeAvailable,
  getNativeLoadError as getChunkerLoadError,
  getVersion as getChunkerVersion,
} from './chunker.js';

export type {
  CodeChunk,
  ChunkResult,
  ChunkContext,
  ChunkerConfig,
  ChunkType,
  SourceLocation,
} from './chunker.js';

// Re-export indexer
export {
  FileIndex,
  IncrementalIndexer,
  hashFile,
  hashString,
  scan,
  globMatch,
  isNativeAvailable as isIndexerNativeAvailable,
  getNativeLoadError as getIndexerLoadError,
  getVersion as getIndexerVersion,
} from './indexer.js';

export type {
  FileEntry,
  DirEntry,
  FileChange,
  ScanResult,
  DiffResult,
  IndexerConfig,
  ChangeType,
  Language,
} from './indexer.js';

// Combined availability check
import { isNativeAvailable as isChunkerNative } from './chunker.js';
import { isNativeAvailable as isIndexerNative } from './indexer.js';

/**
 * Check if all native modules are available
 */
export function isFullyNative(): boolean {
  return isChunkerNative() && isIndexerNative();
}

/**
 * Get status of all native modules
 */
export function getNativeStatus(): {
  chunker: boolean;
  indexer: boolean;
  fullyNative: boolean;
} {
  const chunker = isChunkerNative();
  const indexer = isIndexerNative();
  return {
    chunker,
    indexer,
    fullyNative: chunker && indexer,
  };
}

/**
 * Print native module status to console
 */
export function printNativeStatus(): void {
  const status = getNativeStatus();
  console.log('ArchiCore Native Modules Status:');
  console.log(`  Chunker: ${status.chunker ? '✓ Native' : '✗ JS Fallback'}`);
  console.log(`  Indexer: ${status.indexer ? '✓ Native' : '✗ JS Fallback'}`);
  console.log(`  Overall: ${status.fullyNative ? '✓ Fully Native' : '⚠ Partial JS Fallback'}`);
}
