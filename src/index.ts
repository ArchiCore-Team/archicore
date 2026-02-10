/**
 * ArchiCore OSS - Main Entry Point
 *
 * Open-source code architecture analysis tool.
 * No LLM dependency - Neo4j graph + BM25 search.
 * LLM is an optional plugin (Ollama/OpenAI).
 */

import { resolve } from 'path';
import { config } from 'dotenv';
import { ProjectManager } from './server/project-manager.js';
import { loadLLMPlugin, loadPlugin } from './plugins/index.js';
import type { Change, ChangeImpact, DependencyGraph, Symbol } from './types/index.js';
import type { SearchResult } from './search/index.js';
import type { QueryResult } from './graph/index.js';

config();

export class ArchiCoreOSS {
  private pm = new ProjectManager();
  private _initialized = false;

  /**
   * Initialize ArchiCore (connects to Neo4j if available)
   */
  async initialize(): Promise<void> {
    await this.pm.initialize();
    this._initialized = true;
  }

  /**
   * Index a project directory
   */
  async indexProject(
    rootDir: string,
    onProgress?: (msg: string) => void
  ): Promise<{ files: number; symbols: number }> {
    this.ensureInit();
    const absPath = resolve(rootDir);
    await this.pm.indexProject(absPath, onProgress);
    const stats = this.pm.getStats();
    return { files: stats.files, symbols: stats.symbols };
  }

  /**
   * Get dependencies of a file
   */
  async getDependencies(file: string): Promise<QueryResult[]> {
    this.ensureInit();
    const queries = this.pm.getGraphQueries();
    if (!queries) return [];
    return queries.dependenciesOf(file);
  }

  /**
   * Get dependents of a file (who depends on it)
   */
  async getDependents(file: string): Promise<QueryResult[]> {
    this.ensureInit();
    const queries = this.pm.getGraphQueries();
    if (!queries) return [];
    return queries.dependentsOf(file);
  }

  /**
   * Get transitive impact of changing a file
   */
  async getImpact(file: string, maxDepth?: number): Promise<QueryResult[]> {
    this.ensureInit();
    const queries = this.pm.getGraphQueries();
    if (!queries) return [];
    return queries.impactOf(file, maxDepth);
  }

  /**
   * BM25 code search
   */
  search(query: string, limit?: number): SearchResult[] {
    return this.pm.searchCode(query, limit);
  }

  /**
   * Symbol search
   */
  searchSymbols(query: string, limit?: number): SearchResult[] {
    return this.pm.searchSymbols(query, limit);
  }

  /**
   * Get code metrics
   */
  async getMetrics(): Promise<unknown> {
    this.ensureInit();
    return this.pm.getMetrics();
  }

  /**
   * Get security issues
   */
  async getSecurityIssues(): Promise<unknown> {
    this.ensureInit();
    return this.pm.getSecurityIssues();
  }

  /**
   * Get dead code
   */
  async getDeadCode(): Promise<unknown> {
    this.ensureInit();
    return this.pm.getDeadCode();
  }

  /**
   * Get code duplication
   */
  async getDuplication(): Promise<unknown> {
    this.ensureInit();
    return this.pm.getDuplication();
  }

  /**
   * Check architecture rules
   */
  async checkRules(): Promise<unknown> {
    this.ensureInit();
    return this.pm.checkRules();
  }

  /**
   * Get AI narrator report
   */
  async getNarratorReport(): Promise<unknown> {
    this.ensureInit();
    return this.pm.getNarratorReport();
  }

  /**
   * Analyze change impact
   */
  async analyzeImpact(change: Change): Promise<ChangeImpact> {
    this.ensureInit();
    return this.pm.getImpact(change);
  }

  /**
   * Get the full dependency graph
   */
  getGraph(): DependencyGraph | null {
    return this.pm.getGraph();
  }

  /**
   * Get all extracted symbols
   */
  getSymbols(): Symbol[] {
    return this.pm.getSymbols();
  }

  /**
   * Export report
   */
  async export(format: 'json' | 'html' | 'markdown' | 'csv' | 'graphml'): Promise<unknown> {
    this.ensureInit();
    return this.pm.exportAs(format);
  }

  // ===== Optional LLM Plugin Methods =====

  /**
   * Load an LLM plugin (auto-detect or specific)
   */
  async loadLLM(name?: 'openai' | 'ollama', options?: Record<string, string>): Promise<boolean> {
    try {
      const plugin = name
        ? await loadPlugin(name, options)
        : await loadLLMPlugin();
      if (plugin) {
        this.pm.llmPlugin = plugin;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Explain impact using LLM (returns null if no plugin)
   */
  async explainImpact(impact: ChangeImpact): Promise<string | null> {
    if (!this.pm.llmPlugin) return null;
    return this.pm.llmPlugin.explainImpact(impact);
  }

  /**
   * Ask a question about the codebase (returns null if no plugin)
   */
  async askQuestion(question: string, context?: string): Promise<string | null> {
    if (!this.pm.llmPlugin) return null;
    return this.pm.llmPlugin.answerQuestion(question, context || '');
  }

  /**
   * Get status
   */
  getStatus() {
    return this.pm.getStatus();
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.pm.close();
  }

  private ensureInit(): void {
    if (!this._initialized) {
      throw new Error('ArchiCore not initialized. Call initialize() first.');
    }
  }
}

// Re-export types
export type {
  ASTNode, Symbol, SymbolKind, Location, Reference, Import,
  DependencyGraph, GraphNode, GraphEdge, EdgeType,
  ArchitectureModel, BoundedContext, DomainEntity,
  ChangeImpact, Change, AffectedNode, Risk, Recommendation,
  RuleViolation, ProjectMetadata,
} from './types/index.js';

export type { LLMPlugin } from './plugins/types.js';
export type { SearchResult } from './search/index.js';
export type { QueryResult } from './graph/index.js';

// Default export
export default ArchiCoreOSS;
