import {
  DependencyGraph,
  GraphNode,
  GraphEdge,
  EdgeType,
  Symbol,
  ASTNode
} from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export class DependencyGraphBuilder {
  private aliases: Map<string, string> = new Map();
  private packageDeps: Set<string> = new Set();
  private rootDir: string | undefined;

  buildGraph(
    symbols: Map<string, Symbol>,
    asts: Map<string, ASTNode>,
    rootDir?: string
  ): DependencyGraph {
    Logger.progress('Building dependency graph...');

    this.rootDir = rootDir;
    if (rootDir) {
      this.loadAliases(rootDir, asts);
      this.loadPackageDeps(rootDir);
    }

    const graph: DependencyGraph = {
      nodes: new Map(),
      edges: new Map()
    };

    this.buildNodes(symbols, asts, graph);
    this.buildEdges(symbols, asts, graph);

    // Extract Vue template component edges
    this.extractVueTemplateImports(asts, graph, rootDir);

    Logger.success(
      `Dependency graph built: ${graph.nodes.size} nodes, ${this.countEdges(graph)} edges`
    );

    return graph;
  }

  /**
   * Load path aliases from jsconfig.json, tsconfig.json, vite.config
   */
  private loadAliases(rootDir: string, _asts: Map<string, ASTNode>): void {
    this.aliases.clear();

    // Default fallback
    this.aliases.set('@/', 'src/');

    // Try jsconfig.json
    for (const configFile of ['jsconfig.json', 'tsconfig.json']) {
      const configPath = path.join(rootDir, configFile);
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          const paths = config.compilerOptions?.paths;
          if (paths) {
            for (const [alias, targets] of Object.entries(paths)) {
              if (Array.isArray(targets) && targets.length > 0) {
                // Handle exact-match syntax: "vue$" means exact match for "vue"
                const isExact = alias.endsWith('$');
                const cleanAlias = isExact ? alias.slice(0, -1) : alias;
                // Convert "@/*" -> "@/" and "src/*" -> "src/"
                const aliasPrefix = cleanAlias.replace('/*', '/').replace('*', '');
                const targetPrefix = (targets[0] as string).replace('/*', '/').replace('*', '');
                // Skip exact-match aliases pointing to node_modules (e.g. "vue$" -> "node_modules/...")
                if (isExact && targetPrefix.includes('node_modules')) continue;
                // Resolve baseUrl
                const baseUrl = config.compilerOptions?.baseUrl || '.';
                const resolvedTarget = baseUrl === '.' ? targetPrefix : `${baseUrl}/${targetPrefix}`;
                this.aliases.set(aliasPrefix, resolvedTarget.replace(/^\.\//, ''));
              }
            }
            Logger.debug(`Loaded ${Object.keys(paths).length} path aliases from ${configFile}`);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Try vite.config.ts/js
    for (const viteFile of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
      const vitePath = path.join(rootDir, viteFile);
      if (existsSync(vitePath)) {
        try {
          const content = readFileSync(vitePath, 'utf-8');
          // Simple regex parse for resolve.alias patterns
          // Matches: '@': path.resolve(..., 'src') or '@': resolve(..., 'src') or '@/': './src'
          const aliasMatches = content.matchAll(/['"](@\/?|~\/?)['"]\s*:\s*(?:path\.resolve\s*\([^)]*['"]([^'"]+)['"]\)|['"]\.?\/?([^'"]+)['"])/g);
          for (const m of aliasMatches) {
            const alias = m[1].endsWith('/') ? m[1] : m[1] + '/';
            const target = (m[2] || m[3]) + '/';
            this.aliases.set(alias, target);
          }
        } catch {
          // Ignore
        }
      }
    }

    // Nuxt convention: ~/ -> root
    this.aliases.set('~/', '');

    Logger.debug(`Aliases loaded: ${[...this.aliases.entries()].map(([k, v]) => `${k}->${v}`).join(', ')}`);
  }

  /**
   * Load package.json dependencies to recognize bare package imports
   */
  private loadPackageDeps(rootDir: string): void {
    this.packageDeps.clear();
    const pkgPath = path.join(rootDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        for (const dep of Object.keys(pkg.dependencies || {})) this.packageDeps.add(dep);
        for (const dep of Object.keys(pkg.devDependencies || {})) this.packageDeps.add(dep);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Extract component usage from Vue <template> sections
   */
  private extractVueTemplateImports(asts: Map<string, ASTNode>, graph: DependencyGraph, rootDir?: string): void {
    let templateEdgesCount = 0;

    // Build a map of component names to file paths
    const componentMap = new Map<string, string>();
    for (const filePath of asts.keys()) {
      if (!filePath.endsWith('.vue')) continue;
      const normalized = filePath.replace(/\\/g, '/');
      const fileName = normalized.split('/').pop()?.replace('.vue', '') || '';
      if (fileName) {
        componentMap.set(fileName, filePath);
        componentMap.set(this.toKebabCase(fileName), filePath);
      }
    }

    const htmlTags = new Set(['div', 'span', 'p', 'a', 'img', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'caption', 'colgroup', 'col',
      'form', 'input', 'button', 'select', 'option', 'textarea', 'fieldset', 'legend',
      'label', 'section', 'header', 'footer', 'nav', 'main', 'aside', 'article', 'figure', 'figcaption',
      'template', 'slot', 'component', 'transition', 'transition-group', 'keep-alive', 'teleport', 'suspense',
      'br', 'hr', 'pre', 'code', 'strong', 'em', 'i', 'b', 'small', 'sub', 'sup', 'mark',
      'details', 'summary', 'dialog', 'menu', 'menuitem',
      'video', 'audio', 'source', 'canvas', 'svg', 'path', 'circle', 'rect', 'line', 'g', 'defs', 'use',
      'iframe', 'embed', 'object', 'param', 'picture', 'map', 'area',
      'dl', 'dt', 'dd', 'abbr', 'cite', 'blockquote', 'q', 'time', 'var', 'samp', 'kbd',
      'ruby', 'rt', 'rp', 'bdi', 'bdo', 'wbr', 'data', 'meter', 'progress', 'output',
      'head', 'meta', 'title', 'link', 'style', 'script', 'noscript', 'body', 'html',
      'router-view', 'router-link', 'nuxt', 'nuxt-link', 'nuxt-child']);

    for (const filePath of asts.keys()) {
      if (!filePath.endsWith('.vue')) continue;

      // Read the actual file content from disk
      let fileContent: string | null = null;
      try {
        // Try the file path directly (may be absolute)
        if (existsSync(filePath)) {
          fileContent = readFileSync(filePath, 'utf-8');
        } else if (rootDir) {
          // Try resolving relative to rootDir
          const resolved = path.resolve(rootDir, filePath);
          if (existsSync(resolved)) {
            fileContent = readFileSync(resolved, 'utf-8');
          }
        }
      } catch {
        // Ignore read errors
      }

      if (!fileContent) continue;

      // Extract <template> section
      const templateMatch = fileContent.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (!templateMatch) continue;
      const templateText = templateMatch[1];

      // Find component tags (PascalCase and kebab-case custom elements)
      const tagPattern = /<\/?([A-Z][a-zA-Z0-9]*|[a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s/>]/g;

      const usedComponents = new Set<string>();
      let tagMatch;
      while ((tagMatch = tagPattern.exec(templateText)) !== null) {
        const tag = tagMatch[1];
        if (!htmlTags.has(tag.toLowerCase()) && !tag.startsWith('q-') && !tag.startsWith('v-') && !tag.startsWith('el-')) {
          usedComponents.add(tag);
        }
      }

      for (const comp of usedComponents) {
        // Try PascalCase and kebab-case lookup
        const targetFile = componentMap.get(comp) || componentMap.get(this.toKebabCase(comp));
        if (targetFile && targetFile !== filePath && graph.nodes.has(filePath) && graph.nodes.has(targetFile)) {
          const edge: GraphEdge = {
            from: filePath,
            to: targetFile,
            type: EdgeType.Uses,
            weight: 1
          };
          this.addEdge(graph, edge);
          templateEdgesCount++;
        }
      }
    }

    if (templateEdgesCount > 0) {
      Logger.debug(`Created ${templateEdgesCount} edges from Vue template component usage`);
    }
  }

  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  private buildNodes(
    symbols: Map<string, Symbol>,
    asts: Map<string, ASTNode>,
    graph: DependencyGraph
  ): void {
    for (const [filePath, ast] of asts) {
      const fileNode: GraphNode = {
        id: filePath,
        type: 'file',
        filePath,
        name: this.getFileName(filePath),
        metadata: {
          linesOfCode: ast.endLine - ast.startLine,
          complexity: this.estimateComplexity(ast)
        }
      };
      graph.nodes.set(filePath, fileNode);
    }

    for (const symbol of symbols.values()) {
      const node: GraphNode = {
        id: symbol.id,
        type: symbol.kind === 'function' ? 'function' : 'class',
        filePath: symbol.filePath,
        name: symbol.name,
        metadata: {}
      };
      graph.nodes.set(symbol.id, node);
    }
  }

  private buildEdges(symbols: Map<string, Symbol>, asts: Map<string, ASTNode>, graph: DependencyGraph): void {
    // 1. Извлекаем импорты из AST файлов (file-level imports)
    const fileImports = this.extractFileImports(asts);
    let importEdgesCount = 0;

    for (const [filePath, imports] of fileImports) {
      for (const importPath of imports) {
        // Находим файл по пути импорта
        const targetFile = this.resolveImportPath(filePath, importPath, asts);

        if (targetFile && graph.nodes.has(filePath) && graph.nodes.has(targetFile)) {
          const edge: GraphEdge = {
            from: filePath,
            to: targetFile,
            type: EdgeType.Import,
            weight: 1
          };
          this.addEdge(graph, edge);
          importEdgesCount++;
        }
      }
    }

    Logger.debug(`Created ${importEdgesCount} edges from file imports`);

    // 1b. Extract imports from Vue <script> sections (AST parser often misses these)
    const vueImportEdges = this.extractVueScriptImports(asts, graph);
    importEdgesCount += vueImportEdges;

    // 2. Строим edges на основе symbol.imports (если есть)
    for (const symbol of symbols.values()) {
      if (symbol.imports && symbol.imports.length > 0) {
        for (const imp of symbol.imports) {
          const targetSymbols = this.findSymbolsBySource(symbols, imp.source);

          for (const targetSymbol of targetSymbols) {
            const edge: GraphEdge = {
              from: symbol.id,
              to: targetSymbol.id,
              type: EdgeType.Import,
              weight: 1
            };

            this.addEdge(graph, edge);
          }
        }
      }

      // Строим edges на основе references (вызовы функций)
      for (const ref of symbol.references) {
        if (ref.kind === 'call') {
          const targetSymbol = this.findSymbolAtLocation(
            symbols,
            ref.location.filePath,
            ref.location.startLine
          );

          if (targetSymbol) {
            const edge: GraphEdge = {
              from: symbol.id,
              to: targetSymbol.id,
              type: EdgeType.Call,
              weight: 1
            };

            this.addEdge(graph, edge);
          }
        }
      }
    }

    // 3. Строим edges на основе файловых зависимостей (символы в одном файле связаны)
    const symbolsByFile = new Map<string, Symbol[]>();
    for (const symbol of symbols.values()) {
      const file = symbol.filePath;
      if (!symbolsByFile.has(file)) {
        symbolsByFile.set(file, []);
      }
      symbolsByFile.get(file)!.push(symbol);
    }

    // Связываем файлы если символ из одного файла ссылается на символ из другого
    for (const symbol of symbols.values()) {
      // Ищем ссылки на другие символы по имени
      for (const ref of symbol.references) {
        if (ref.location.filePath !== symbol.filePath) {
          // Ссылка из другого файла - создаём edge между файлами
          const fromFile = symbol.filePath;
          const toFile = ref.location.filePath;

          if (graph.nodes.has(fromFile) && graph.nodes.has(toFile)) {
            const edge: GraphEdge = {
              from: fromFile,
              to: toFile,
              type: EdgeType.Uses,
              weight: 1
            };
            this.addEdge(graph, edge);
          }
        }
      }
    }

    Logger.debug(`Built ${this.countEdges(graph)} edges total`);
  }

  /**
   * Extract imports from Vue <script> sections by reading raw file content
   * Returns number of edges created
   */
  private extractVueScriptImports(asts: Map<string, ASTNode>, graph: DependencyGraph): number {
    let edgesCreated = 0;
    // Collect already-resolved edges to avoid duplicates
    const existingEdges = new Set<string>();
    for (const [from, edges] of graph.edges) {
      for (const e of edges) {
        existingEdges.add(`${from}→${e.to}`);
      }
    }

    for (const filePath of asts.keys()) {
      if (!filePath.endsWith('.vue')) continue;

      // Read file content from disk
      let fileContent: string | null = null;
      try {
        if (existsSync(filePath)) {
          fileContent = readFileSync(filePath, 'utf-8');
        } else if (this.rootDir) {
          const resolved = path.resolve(this.rootDir, filePath);
          if (existsSync(resolved)) {
            fileContent = readFileSync(resolved, 'utf-8');
          }
        }
      } catch {
        continue;
      }
      if (!fileContent) continue;

      // Extract <script> section
      const scriptMatch = fileContent.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (!scriptMatch) continue;
      const script = scriptMatch[1];

      // Parse import statements: import ... from 'path'
      const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(script)) !== null) {
        const importPath = match[1];
        const targetFile = this.resolveImportPath(filePath, importPath, asts);
        if (targetFile && graph.nodes.has(filePath) && graph.nodes.has(targetFile)) {
          const edgeKey = `${filePath}→${targetFile}`;
          if (!existingEdges.has(edgeKey)) {
            this.addEdge(graph, {
              from: filePath,
              to: targetFile,
              type: EdgeType.Import,
              weight: 1
            });
            existingEdges.add(edgeKey);
            edgesCreated++;
          }
        }
      }

      // Parse require() calls
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(script)) !== null) {
        const importPath = match[1];
        const targetFile = this.resolveImportPath(filePath, importPath, asts);
        if (targetFile && graph.nodes.has(filePath) && graph.nodes.has(targetFile)) {
          const edgeKey = `${filePath}→${targetFile}`;
          if (!existingEdges.has(edgeKey)) {
            this.addEdge(graph, {
              from: filePath,
              to: targetFile,
              type: EdgeType.Import,
              weight: 1
            });
            existingEdges.add(edgeKey);
            edgesCreated++;
          }
        }
      }
    }

    if (edgesCreated > 0) {
      Logger.debug(`Created ${edgesCreated} edges from Vue <script> imports`);
    }
    return edgesCreated;
  }

  /**
   * Извлекает импорты из AST всех файлов (file-level)
   */
  private extractFileImports(asts: Map<string, ASTNode>): Map<string, string[]> {
    const fileImports = new Map<string, string[]>();

    for (const [filePath, ast] of asts) {
      const imports = this.findImportsInAST(ast);
      if (imports.length > 0) {
        fileImports.set(filePath, imports);
      }
    }

    return fileImports;
  }

  /**
   * Рекурсивно ищет import statements в AST
   */
  private findImportsInAST(node: ASTNode): string[] {
    const imports: string[] = [];

    // Tree-sitter node types for imports
    const importTypes = ['import_statement', 'import_declaration', 'import_from_statement'];

    if (importTypes.includes(node.type)) {
      const importPath = this.extractImportPath(node);
      if (importPath) {
        imports.push(importPath);
      }
    }

    // Recursively search children
    for (const child of node.children) {
      imports.push(...this.findImportsInAST(child));
    }

    return imports;
  }

  /**
   * Извлекает путь импорта из import statement
   */
  private extractImportPath(node: ASTNode): string | null {
    // Ищем строковый литерал в детях (путь импорта)
    const stringTypes = ['string', 'string_literal', 'string_content', 'module_name'];

    const findString = (n: ASTNode): string | null => {
      if (stringTypes.includes(n.type) && n.metadata?.text) {
        // Убираем кавычки
        return (n.metadata.text as string).replace(/['"]/g, '');
      }
      for (const child of n.children) {
        const result = findString(child);
        if (result) return result;
      }
      return null;
    };

    return findString(node);
  }

  /**
   * Резолвит путь импорта в реальный путь файла
   */
  private resolveImportPath(fromFile: string, importPath: string, asts: Map<string, ASTNode>): string | null {
    // Skip known package imports (node_modules)
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      // Check if this is an aliased path
      let isAlias = false;
      for (const alias of this.aliases.keys()) {
        if (importPath.startsWith(alias)) {
          isAlias = true;
          break;
        }
      }
      // Check if it's a bare package name from package.json
      if (!isAlias) {
        const basePkg = importPath.startsWith('@')
          ? importPath.split('/').slice(0, 2).join('/')
          : importPath.split('/')[0];
        if (this.packageDeps.has(basePkg)) return null;
        // Bare module name without slash (e.g. "vue", "dayjs") — skip even if not in packageDeps
        // These are likely peer deps or built-in modules
        if (!importPath.includes('/')) return null;
        // If no aliases loaded, skip non-relative non-aliased paths
        if (this.aliases.size === 0) return null;
      }
    }

    // Apply alias resolution
    let normalizedImport = importPath;
    for (const [alias, target] of this.aliases) {
      if (importPath.startsWith(alias)) {
        normalizedImport = target + importPath.slice(alias.length);
        break;
      }
    }

    // Get directory of the current file (normalized to forward slashes)
    const fromDir = fromFile.replace(/\\/g, '/').split('/').slice(0, -1).join('/');

    // Resolve to a target path
    let targetPath: string;
    if (normalizedImport.startsWith('./') || normalizedImport.startsWith('../')) {
      // Relative import → resolve against fromDir to get absolute path
      targetPath = this.resolvePath(fromDir, normalizedImport);
    } else if (normalizedImport.startsWith('/')) {
      targetPath = normalizedImport.slice(1);
    } else {
      // Alias-resolved path (e.g. "src/helpers/message") — prepend rootDir for exact matching
      if (this.rootDir) {
        targetPath = this.rootDir.replace(/\\/g, '/') + '/' + normalizedImport;
      } else {
        targetPath = normalizedImport;
      }
    }

    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.vue', '.mjs', '/index.ts', '/index.js', '/index.vue'];

    // Primary: exact match (works when targetPath is absolute)
    for (const ext of extensions) {
      const fullPath = (targetPath + ext).replace(/\\/g, '/');
      for (const astPath of asts.keys()) {
        const normalizedAstPath = astPath.replace(/\\/g, '/');
        if (normalizedAstPath === fullPath) {
          return astPath;
        }
      }
    }

    // Fallback: endsWith with path boundary (for cases without rootDir or different path roots)
    for (const ext of extensions) {
      const suffix = '/' + normalizedImport + ext;
      for (const astPath of asts.keys()) {
        const normalizedAstPath = astPath.replace(/\\/g, '/');
        if (normalizedAstPath.endsWith(suffix)) {
          return astPath;
        }
      }
    }

    return null;
  }

  /**
   * Резолвит относительный путь
   */
  private resolvePath(base: string, relative: string): string {
    const baseParts = base.split('/').filter(Boolean);
    const relativeParts = relative.split('/').filter(Boolean);

    for (const part of relativeParts) {
      if (part === '..') {
        baseParts.pop();
      } else if (part !== '.') {
        baseParts.push(part);
      }
    }

    return baseParts.join('/');
  }

  private addEdge(graph: DependencyGraph, edge: GraphEdge): void {
    if (!graph.edges.has(edge.from)) {
      graph.edges.set(edge.from, []);
    }
    graph.edges.get(edge.from)!.push(edge);
  }

  private findSymbolsBySource(
    symbols: Map<string, Symbol>,
    source: string
  ): Symbol[] {
    const results: Symbol[] = [];

    for (const symbol of symbols.values()) {
      if (symbol.filePath.includes(source)) {
        results.push(symbol);
      }
    }

    return results;
  }

  private findSymbolAtLocation(
    symbols: Map<string, Symbol>,
    filePath: string,
    line: number
  ): Symbol | null {
    for (const symbol of symbols.values()) {
      if (
        symbol.filePath === filePath &&
        symbol.location.startLine <= line &&
        symbol.location.endLine >= line
      ) {
        return symbol;
      }
    }
    return null;
  }

  private getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
  }

  private estimateComplexity(node: ASTNode): number {
    let complexity = 1;

    const complexNodes = [
      'if_statement',
      'for_statement',
      'while_statement',
      'switch_statement',
      'catch_clause'
    ];

    if (complexNodes.includes(node.type)) {
      complexity++;
    }

    for (const child of node.children) {
      complexity += this.estimateComplexity(child);
    }

    return complexity;
  }

  private countEdges(graph: DependencyGraph): number {
    let count = 0;
    for (const edges of graph.edges.values()) {
      count += edges.length;
    }
    return count;
  }

  findDependents(graph: DependencyGraph, nodeId: string): Set<string> {
    const dependents = new Set<string>();

    for (const [from, edges] of graph.edges) {
      for (const edge of edges) {
        if (edge.to === nodeId) {
          dependents.add(from);
        }
      }
    }

    return dependents;
  }

  findDependencies(graph: DependencyGraph, nodeId: string): Set<string> {
    const dependencies = new Set<string>();
    const edges = graph.edges.get(nodeId) || [];

    for (const edge of edges) {
      dependencies.add(edge.to);
    }

    return dependencies;
  }

  getTransitiveDependencies(
    graph: DependencyGraph,
    nodeId: string,
    maxDepth = 10
  ): Set<string> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth || visited.has(current.id)) {
        continue;
      }

      visited.add(current.id);

      const deps = this.findDependencies(graph, current.id);
      for (const dep of deps) {
        queue.push({ id: dep, depth: current.depth + 1 });
      }
    }

    visited.delete(nodeId);
    return visited;
  }
}
