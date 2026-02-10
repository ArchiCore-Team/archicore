/**
 * Search Index - BM25 search with optional graph-boost
 */

import type { Symbol, DependencyGraph } from '../types/index.js';
import { BM25Index, type BM25SearchResult } from './bm25.js';
import { Logger } from '../utils/logger.js';

export interface SearchResult {
  filePath: string;
  symbolName?: string;
  symbolKind?: string;
  score: number;
  snippet?: string;
  line?: number;
}

export class SearchIndex {
  private codeIndex = new BM25Index();
  private symbolIndex = new BM25Index();
  private fileContents = new Map<string, string>();
  private symbolMap = new Map<string, Symbol>();
  private dependentCounts = new Map<string, number>();

  /**
   * Index a project's symbols and file contents
   */
  indexProject(
    symbols: Symbol[],
    fileContents: Map<string, string>,
    graph?: DependencyGraph
  ): void {
    Logger.info(`Indexing ${fileContents.size} files and ${symbols.length} symbols for search`);

    // Index file contents
    for (const [filePath, content] of fileContents) {
      this.codeIndex.addDocument(filePath, content);
      this.fileContents.set(filePath, content);
    }

    // Index symbols
    for (const sym of symbols) {
      const symbolText = `${sym.name} ${sym.kind} ${sym.filePath}`;
      this.symbolIndex.addDocument(sym.id, symbolText);
      this.symbolMap.set(sym.id, sym);
    }

    // Build dependent counts for graph-boost
    if (graph) {
      this.buildDependentCounts(graph);
    }

    Logger.info(`Search index ready: ${this.codeIndex.size} files, ${this.symbolIndex.size} symbols`);
  }

  /**
   * Search code (file contents)
   */
  searchCode(query: string, limit = 20): SearchResult[] {
    const rawResults = this.codeIndex.search(query, limit * 2);
    return this.boostAndFormat(rawResults, limit);
  }

  /**
   * Search symbols
   */
  searchSymbols(query: string, limit = 20): SearchResult[] {
    const rawResults = this.symbolIndex.search(query, limit);

    return rawResults.map(r => {
      const sym = this.symbolMap.get(r.id);
      return {
        filePath: sym?.filePath || r.id,
        symbolName: sym?.name,
        symbolKind: sym?.kind,
        score: r.score,
        line: sym?.location.startLine,
      };
    });
  }

  /**
   * Update index for changed files
   */
  updateFile(filePath: string, content: string, symbols: Symbol[]): void {
    // Remove old entries
    this.codeIndex.removeDocument(filePath);
    for (const [id, sym] of this.symbolMap) {
      if (sym.filePath === filePath) {
        this.symbolIndex.removeDocument(id);
        this.symbolMap.delete(id);
      }
    }

    // Re-add
    this.codeIndex.addDocument(filePath, content);
    this.fileContents.set(filePath, content);

    for (const sym of symbols) {
      const symbolText = `${sym.name} ${sym.kind} ${sym.filePath}`;
      this.symbolIndex.addDocument(sym.id, symbolText);
      this.symbolMap.set(sym.id, sym);
    }
  }

  /**
   * Update graph-boost data
   */
  updateGraph(graph: DependencyGraph): void {
    this.buildDependentCounts(graph);
  }

  private buildDependentCounts(graph: DependencyGraph): void {
    this.dependentCounts.clear();
    for (const [, edges] of graph.edges) {
      for (const edge of edges) {
        this.dependentCounts.set(
          edge.to,
          (this.dependentCounts.get(edge.to) || 0) + 1
        );
      }
    }
  }

  private boostAndFormat(results: BM25SearchResult[], limit: number): SearchResult[] {
    return results
      .map(r => {
        // Graph-boost: files with more dependents rank higher
        const dependentCount = this.dependentCounts.get(r.id) || 0;
        const graphBoost = 1 + Math.log(1 + dependentCount) * 0.1;

        const content = this.fileContents.get(r.id);
        let snippet: string | undefined;
        if (content) {
          const lines = content.split('\n');
          snippet = lines.slice(0, 5).join('\n');
        }

        return {
          filePath: r.id,
          score: r.score * graphBoost,
          snippet,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  get stats(): { files: number; symbols: number } {
    return {
      files: this.codeIndex.size,
      symbols: this.symbolIndex.size,
    };
  }

  clear(): void {
    this.codeIndex.clear();
    this.symbolIndex.clear();
    this.fileContents.clear();
    this.symbolMap.clear();
    this.dependentCounts.clear();
  }
}
