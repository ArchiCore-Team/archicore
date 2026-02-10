/**
 * Code Index Module
 *
 * Основной модуль для индексации кода:
 * - Парсинг AST через Tree-sitter
 * - Извлечение символов (функции, классы, интерфейсы)
 * - Построение графа зависимостей
 * - Анализ связей между компонентами
 */

import { ASTParser } from './ast-parser.js';
import { SymbolExtractor } from './symbol-extractor.js';
import { DependencyGraphBuilder } from './dependency-graph.js';
import { SourceMapExtractor, VirtualFile, ExtractionResult } from './source-map-extractor.js';
import { DependencyGraph, Symbol, ASTNode } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class CodeIndex {
  private astParser: ASTParser;
  private symbolExtractor: SymbolExtractor;
  private graphBuilder: DependencyGraphBuilder;
  private sourceMapExtractor: SourceMapExtractor;
  private rootDir: string;

  private asts: Map<string, ASTNode> = new Map();
  private symbols: Map<string, Symbol> = new Map();
  private graph: DependencyGraph | null = null;
  private virtualFiles: VirtualFile[] = [];

  constructor(rootDir?: string) {
    this.rootDir = rootDir || process.cwd();
    this.astParser = new ASTParser();
    this.symbolExtractor = new SymbolExtractor();
    this.graphBuilder = new DependencyGraphBuilder();
    this.sourceMapExtractor = new SourceMapExtractor();
  }

  /**
   * Проверяет, является ли проект bundled (содержит source maps)
   */
  async isBundledProject(): Promise<boolean> {
    return this.sourceMapExtractor.isBundledProject(this.rootDir);
  }

  /**
   * Извлекает исходный код из source maps (для bundled проектов)
   */
  async extractFromSourceMaps(): Promise<ExtractionResult> {
    const result = await this.sourceMapExtractor.extractFromProject(this.rootDir);
    this.virtualFiles = result.files;
    return result;
  }

  /**
   * Парсит виртуальные файлы из source maps
   */
  parseVirtualFiles(
    files: VirtualFile[],
    progressCallback?: (current: number, total: number, file: string) => void
  ): Map<string, ASTNode> {
    const asts = new Map<string, ASTNode>();
    const totalFiles = files.length;

    Logger.progress(`Parsing ${totalFiles} virtual files from source maps...`);

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];

      if (progressCallback) {
        progressCallback(i + 1, totalFiles, file.path);
      }

      const ast = this.astParser.parseContent(file.content, file.path);
      if (ast) {
        asts.set(file.path, ast);
      }
    }

    Logger.success(`Parsed ${asts.size} virtual files successfully`);
    return asts;
  }

  /**
   * Получает виртуальные файлы (для передачи на сервер)
   */
  getVirtualFiles(): VirtualFile[] {
    return this.virtualFiles;
  }

  async indexProject(rootDir?: string): Promise<void> {
    const dir = rootDir || this.rootDir;
    Logger.info(`Starting indexing of project: ${dir}`);

    this.asts = await this.astParser.parseProject(dir);

    this.symbols = this.symbolExtractor.extractSymbols(this.asts);

    this.symbolExtractor.extractReferences(this.symbols, this.asts);

    this.graph = this.graphBuilder.buildGraph(this.symbols, this.asts, dir);

    Logger.success('Project indexed successfully');
  }

  // Методы для использования в ProjectService
  async parseProject(progressCallback?: (current: number, total: number, file: string) => void): Promise<Map<string, ASTNode>> {
    this.asts = await this.astParser.parseProject(this.rootDir, progressCallback);
    return this.asts;
  }

  extractSymbols(asts: Map<string, ASTNode>): Map<string, Symbol> {
    this.symbols = this.symbolExtractor.extractSymbols(asts);
    this.symbolExtractor.extractReferences(this.symbols, asts);
    return this.symbols;
  }

  buildDependencyGraph(asts: Map<string, ASTNode>, symbols: Map<string, Symbol>): DependencyGraph {
    this.graph = this.graphBuilder.buildGraph(symbols, asts, this.rootDir);
    return this.graph;
  }

  getGraph(): DependencyGraph | null {
    return this.graph;
  }

  getSymbols(): Map<string, Symbol> {
    return this.symbols;
  }

  getASTs(): Map<string, ASTNode> {
    return this.asts;
  }

  findSymbol(name: string): Symbol | null {
    for (const symbol of this.symbols.values()) {
      if (symbol.name === name) {
        return symbol;
      }
    }
    return null;
  }

  findSymbolsInFile(filePath: string): Symbol[] {
    const results: Symbol[] = [];
    for (const symbol of this.symbols.values()) {
      if (symbol.filePath === filePath) {
        results.push(symbol);
      }
    }
    return results;
  }

  async reindexFile(filePath: string): Promise<void> {
    Logger.progress(`Reindexing file: ${filePath}`);

    const ast = await this.astParser.parseFile(filePath);
    if (ast) {
      this.asts.set(filePath, ast);

      for (const [id, symbol] of this.symbols) {
        if (symbol.filePath === filePath) {
          this.symbols.delete(id);
        }
      }

      const newSymbols = this.symbolExtractor.extractSymbols(
        new Map([[filePath, ast]])
      );
      for (const [id, symbol] of newSymbols) {
        this.symbols.set(id, symbol);
      }

      if (this.graph) {
        this.graph = this.graphBuilder.buildGraph(this.symbols, this.asts, this.rootDir);
      }

      Logger.success(`File reindexed: ${filePath}`);
    }
  }

  getStatistics() {
    return {
      totalFiles: this.asts.size,
      totalSymbols: this.symbols.size,
      totalNodes: this.graph?.nodes.size || 0,
      totalEdges: this.countGraphEdges(),
      symbolsByKind: this.getSymbolsByKind()
    };
  }

  private countGraphEdges(): number {
    if (!this.graph) return 0;
    let count = 0;
    for (const edges of this.graph.edges.values()) {
      count += edges.length;
    }
    return count;
  }

  private getSymbolsByKind(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const symbol of this.symbols.values()) {
      counts[symbol.kind] = (counts[symbol.kind] || 0) + 1;
    }
    return counts;
  }
}

export { ASTParser, SymbolExtractor, DependencyGraphBuilder, SourceMapExtractor };
export { FileChunker } from './file-chunker.js';
export type { VirtualFile, ExtractionResult } from './source-map-extractor.js';
export type { FileChunk, ChunkingOptions } from './file-chunker.js';
