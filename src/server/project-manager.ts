/**
 * Project Manager - Connects all analysis modules
 */

import { CodeIndex } from '../code-index/index.js';
import { ImpactEngine } from '../impact-engine/index.js';
import { MetricsCalculator } from '../metrics/index.js';
import { RulesEngine } from '../rules-engine/index.js';
import { SecurityAnalyzer } from '../analyzers/security.js';
import { DeadCodeDetector } from '../analyzers/dead-code.js';
import { DuplicationDetector } from '../analyzers/duplication.js';
import { AINarrator } from '../analyzers/ai-narrator.js';
import { ExportManager, type ExportData } from '../export/index.js';
import { createGraphStore, type GraphModule } from '../graph/index.js';
import { SearchIndex } from '../search/index.js';
import { FileUtils } from '../utils/file-utils.js';
import { Logger } from '../utils/logger.js';
import type { DependencyGraph, Symbol, ChangeImpact, Change, ASTNode } from '../types/index.js';
import type { LLMPlugin } from '../plugins/types.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export interface ProjectStatus {
  indexed: boolean;
  rootDir: string | null;
  fileCount: number;
  symbolCount: number;
  graphReady: boolean;
  searchReady: boolean;
  neo4jConnected: boolean;
}

export class ProjectManager {
  private codeIndex: CodeIndex | null = null;
  private impactEngine = new ImpactEngine();
  private metricsCalculator = new MetricsCalculator();
  private rulesEngine = new RulesEngine();
  private securityAnalyzer = new SecurityAnalyzer();
  private deadCodeDetector = new DeadCodeDetector();
  private duplicationDetector = new DuplicationDetector();
  private narrator = new AINarrator();
  private exportManager = new ExportManager();
  private searchIndex = new SearchIndex();

  private graphModule: GraphModule | null = null;
  private rootDir: string | null = null;
  private graph: DependencyGraph | null = null;
  private symbolsMap = new Map<string, Symbol>();
  private astsMap = new Map<string, ASTNode>();
  private fileContents = new Map<string, string>();
  private _indexed = false;

  // Optional LLM plugin
  public llmPlugin: LLMPlugin | null = null;

  /**
   * Initialize the project manager (connects to Neo4j if available)
   */
  async initialize(): Promise<void> {
    this.graphModule = await createGraphStore();
  }

  /**
   * Index a project directory
   */
  async indexProject(rootDir: string, onProgress?: (msg: string) => void): Promise<void> {
    this.rootDir = rootDir;
    const report = (msg: string) => {
      onProgress?.(msg);
      Logger.info(msg);
    };

    report('Scanning files...');
    const files = await FileUtils.getAllFiles(rootDir);
    report(`Found ${files.length} files`);

    report('Parsing ASTs...');
    this.codeIndex = new CodeIndex(rootDir);
    this.astsMap = await this.codeIndex.parseProject((current, total, file) => {
      report(`Parsing [${current}/${total}]: ${file}`);
    });
    report(`Parsed ${this.astsMap.size} files`);

    report('Extracting symbols...');
    this.symbolsMap = this.codeIndex.extractSymbols(this.astsMap);
    report(`Extracted ${this.symbolsMap.size} symbols`);

    report('Building dependency graph...');
    this.graph = this.codeIndex.buildDependencyGraph(this.astsMap, this.symbolsMap);

    report('Reading file contents for search...');
    for (const file of files) {
      try {
        const content = await FileUtils.readFileContent(file);
        this.fileContents.set(file, content);
      } catch {
        // Skip unreadable files
      }
    }

    report('Building search index...');
    const symbolsArray = Array.from(this.symbolsMap.values());
    this.searchIndex.indexProject(symbolsArray, this.fileContents, this.graph);

    if (this.graphModule) {
      report(`Syncing to graph store${this.graphModule.client.connected ? ' (Neo4j)' : ' (in-memory)'}...`);
      await this.graphModule.store.syncGraph(this.graph, symbolsArray);
    }

    this._indexed = true;
    report(`Indexing complete: ${files.length} files, ${this.symbolsMap.size} symbols`);
  }

  // ===== Graph Queries =====

  getGraph(): DependencyGraph | null {
    return this.graph;
  }

  getSymbols(): Symbol[] {
    return Array.from(this.symbolsMap.values());
  }

  getGraphQueries() {
    return this.graphModule?.queries ?? null;
  }

  // ===== Search =====

  searchCode(query: string, limit?: number) {
    return this.searchIndex.searchCode(query, limit);
  }

  searchSymbols(query: string, limit?: number) {
    return this.searchIndex.searchSymbols(query, limit);
  }

  // ===== Analysis =====

  async getMetrics() {
    if (!this.graph) throw new Error('Project not indexed');
    return this.metricsCalculator.calculateProjectMetrics(
      this.graph, this.symbolsMap, this.fileContents, this.astsMap
    );
  }

  async getSecurityIssues() {
    if (!this.fileContents.size) throw new Error('Project not indexed');
    return this.securityAnalyzer.analyze(this.fileContents);
  }

  async getDeadCode() {
    if (!this.graph) throw new Error('Project not indexed');
    return this.deadCodeDetector.analyze(this.graph, this.symbolsMap, this.fileContents);
  }

  async getDuplication() {
    if (!this.fileContents.size) throw new Error('Project not indexed');
    return this.duplicationDetector.analyze(this.fileContents);
  }

  async checkRules() {
    if (!this.graph) throw new Error('Project not indexed');
    return this.rulesEngine.check(this.graph, this.symbolsMap, this.fileContents);
  }

  async getImpact(change: Change): Promise<ChangeImpact> {
    if (!this.graph) throw new Error('Project not indexed');
    return this.impactEngine.analyzeChange(change, this.graph, this.symbolsMap);
  }

  async getNarratorReport() {
    if (!this.graph) throw new Error('Project not indexed');

    // Read package.json to pass dependencies to narrator for tech stack detection
    let projectMetadata: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined;
    if (this.rootDir) {
      const pkgPath = path.join(this.rootDir, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          projectMetadata = {
            dependencies: pkg.dependencies,
            devDependencies: pkg.devDependencies,
          };
        } catch {
          // Ignore parse errors
        }
      }
    }

    return this.narrator.analyze(this.graph, this.symbolsMap, this.fileContents, projectMetadata);
  }

  // ===== Export =====

  async exportAs(format: 'json' | 'html' | 'markdown' | 'csv' | 'graphml') {
    if (!this.graph) throw new Error('Project not indexed');

    const data: ExportData = {
      projectName: this.rootDir || 'unknown',
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      graph: this.graph,
      symbols: this.symbolsMap,
    };

    return this.exportManager.export(data, { format });
  }

  // ===== Status =====

  getStatus(): ProjectStatus {
    return {
      indexed: this._indexed,
      rootDir: this.rootDir,
      fileCount: this.fileContents.size,
      symbolCount: this.symbolsMap.size,
      graphReady: this.graph !== null,
      searchReady: this.searchIndex.stats.files > 0,
      neo4jConnected: this.graphModule?.client.connected ?? false,
    };
  }

  getStats() {
    return {
      files: this.fileContents.size,
      symbols: this.symbolsMap.size,
      graphNodes: this.graph?.nodes.size ?? 0,
      graphEdges: this.countEdges(),
      searchIndex: this.searchIndex.stats,
    };
  }

  private countEdges(): number {
    if (!this.graph) return 0;
    let count = 0;
    for (const edges of this.graph.edges.values()) count += edges.length;
    return count;
  }

  async close(): Promise<void> {
    if (this.graphModule) {
      await this.graphModule.client.close();
    }
  }
}
