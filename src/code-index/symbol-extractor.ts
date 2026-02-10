import { ASTNode, Symbol, SymbolKind, Reference, Import } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class SymbolExtractor {
  // Минимальная длина имени символа (фильтрует шум)
  private static MIN_SYMBOL_NAME_LENGTH = 2;
  // Максимум символов на файл (защита от шума в больших файлах)
  // 200 was too low — large Vue SFC files (App.vue: 11K lines) have 500+ real symbols
  private static MAX_SYMBOLS_PER_FILE = 500;
  // Имена которые скорее всего шум
  private static NOISE_NAMES = new Set([
    'i', 'j', 'k', 'n', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f',
    '_', '__', '___', 'tmp', 'temp', 'val', 'var', 'res', 'ret', 'err',
    'fn', 'cb', 'el', 'ev', 'id', 'ok', 'no', 'on', 'to', 'do', 'go',
    'undefined', 'null', 'true', 'false', 'this', 'self', 'super',
    'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'throw', 'try', 'catch', 'finally', 'new',
    'delete', 'typeof', 'instanceof', 'void', 'in', 'of', 'as', 'is',
    'get', 'set', 'let', 'const', 'var', 'function', 'class', 'interface',
    'type', 'enum', 'namespace', 'module', 'export', 'import', 'from',
    'extends', 'implements', 'static', 'public', 'private', 'protected',
    'abstract', 'final', 'async', 'await', 'yield', 'with', 'debugger'
  ]);

  extractSymbols(asts: Map<string, ASTNode>): Map<string, Symbol> {
    const symbols = new Map<string, Symbol>();
    const symbolsPerFile = new Map<string, number>();

    Logger.progress('Extracting symbols from AST...');

    for (const [filePath, ast] of asts) {
      symbolsPerFile.set(filePath, 0);
      this.extractFromNode(ast, filePath, symbols, symbolsPerFile);
    }

    // Статистика по типам символов
    const kindCounts: Record<string, number> = {};
    for (const sym of symbols.values()) {
      kindCounts[sym.kind] = (kindCounts[sym.kind] || 0) + 1;
    }

    Logger.success(`Extracted ${symbols.size} symbols`);
    if (symbols.size > 1000) {
      Logger.debug(`Symbol breakdown: ${Object.entries(kindCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`);
    }

    return symbols;
  }

  private isValidSymbolName(name: string): boolean {
    // Фильтруем короткие имена
    if (name.length < SymbolExtractor.MIN_SYMBOL_NAME_LENGTH) return false;

    // Фильтруем известный шум (ключевые слова, однобуквенные переменные)
    if (SymbolExtractor.NOISE_NAMES.has(name.toLowerCase())) return false;

    // Фильтруем имена состоящие только из цифр или спецсимволов
    if (/^[\d_$]+$/.test(name)) return false;

    // Фильтруем очень длинные имена (скорее всего не код)
    if (name.length > 100) return false;

    return true;
  }

  private extractFromNode(
    node: ASTNode,
    filePath: string,
    symbols: Map<string, Symbol>,
    symbolsPerFile: Map<string, number>
  ): void {
    const symbolKind = this.getSymbolKind(node.type);

    // Проверяем лимит на файл
    const currentCount = symbolsPerFile.get(filePath) || 0;
    if (currentCount >= SymbolExtractor.MAX_SYMBOLS_PER_FILE) {
      return; // Достигнут лимит для этого файла
    }

    if (symbolKind && node.name && this.isValidSymbolName(node.name)) {
      const symbol: Symbol = {
        id: `${filePath}:${node.name}:${node.startLine}`,
        name: node.name,
        kind: symbolKind,
        filePath,
        location: {
          filePath,
          startLine: node.startLine,
          endLine: node.endLine,
          startColumn: 0,
          endColumn: 0
        },
        references: [],
        imports: this.extractImports(node)
      };

      symbols.set(symbol.id, symbol);
      symbolsPerFile.set(filePath, currentCount + 1);
    }

    for (const child of node.children) {
      this.extractFromNode(child, filePath, symbols, symbolsPerFile);
    }
  }

  private getSymbolKind(nodeType: string): SymbolKind | null {
    const mapping: Record<string, SymbolKind> = {
      // JavaScript/TypeScript
      'function_declaration': SymbolKind.Function,
      'method_definition': SymbolKind.Function,
      'arrow_function': SymbolKind.Function,
      'class_declaration': SymbolKind.Class,
      'interface_declaration': SymbolKind.Interface,
      'type_alias_declaration': SymbolKind.Type,
      'variable_declaration': SymbolKind.Variable,
      'const_declaration': SymbolKind.Constant,
      'lexical_declaration': SymbolKind.Variable,
      // Python
      'function_definition': SymbolKind.Function,
      'class_definition': SymbolKind.Class,
      'decorated_definition': SymbolKind.Function,
      'async_function_definition': SymbolKind.Function,
      // Go
      'method_declaration': SymbolKind.Function,
      'type_declaration': SymbolKind.Type,
      // Rust
      'function_item': SymbolKind.Function,
      'impl_item': SymbolKind.Class,
      'struct_item': SymbolKind.Class,
      'enum_item': SymbolKind.Type,
      'trait_item': SymbolKind.Interface,
      // PHP and general
      'namespace_definition': SymbolKind.Namespace,
      'namespace_use_declaration': SymbolKind.Variable,
      'trait_declaration': SymbolKind.Interface,
      'property_declaration': SymbolKind.Variable,
      'enum_declaration': SymbolKind.Type,
      'enum_declaration_list': SymbolKind.Type,
      'module_declaration': SymbolKind.Namespace,  // For regex-parsed namespaces
      'struct_declaration': SymbolKind.Class,       // For regex-parsed structs
      'impl_declaration': SymbolKind.Class,         // For regex-parsed impl blocks
      // Java
      'constructor_declaration': SymbolKind.Function,
      'field_declaration': SymbolKind.Variable,
      'annotation_type_declaration': SymbolKind.Interface,
      // C/C++
      'struct_specifier': SymbolKind.Class,
      'union_specifier': SymbolKind.Class,
      'enum_specifier': SymbolKind.Type,
      'preproc_function_def': SymbolKind.Function,
      // Ruby
      'method': SymbolKind.Function,
      'singleton_method': SymbolKind.Function,
      'module': SymbolKind.Namespace,
      'class': SymbolKind.Class
    };

    return mapping[nodeType] || null;
  }

  private extractImports(node: ASTNode): Import[] {
    const imports: Import[] = [];

    if (node.type === 'import_statement' || node.type === 'import_declaration') {
      const importNode = this.parseImportNode(node);
      if (importNode) {
        imports.push(importNode);
      }
    }

    for (const child of node.children) {
      imports.push(...this.extractImports(child));
    }

    return imports;
  }

  private parseImportNode(node: ASTNode): Import | null {
    // Tree-sitter uses different node types for strings: 'string', 'string_literal', etc.
    const sourceNode = this.findStringNode(node);
    if (!sourceNode) return null;

    const source = (sourceNode.metadata.text as string) || '';
    const specifiers = this.extractImportSpecifiers(node);

    return {
      source: source.replace(/['"]/g, ''),
      specifiers,
      location: {
        filePath: node.filePath,
        startLine: node.startLine,
        endLine: node.endLine,
        startColumn: 0,
        endColumn: 0
      }
    };
  }

  private findStringNode(node: ASTNode): ASTNode | null {
    // Direct child with string type
    const stringTypes = ['string', 'string_literal', 'string_content', 'module_name'];
    for (const child of node.children) {
      if (stringTypes.includes(child.type)) {
        return child;
      }
      // For TypeScript/JavaScript: import path might be nested in 'source' or other nodes
      if (child.type === 'source' || child.type === 'from_clause') {
        const nested = this.findStringNode(child);
        if (nested) return nested;
      }
    }
    // Try recursive search for deeply nested strings
    for (const child of node.children) {
      const nested = this.findStringNode(child);
      if (nested) return nested;
    }
    return null;
  }

  private extractImportSpecifiers(node: ASTNode): string[] {
    const specifiers: string[] = [];

    const findSpecifiers = (n: ASTNode) => {
      if (n.type === 'import_specifier' || n.type === 'identifier') {
        if (n.name) {
          specifiers.push(n.name);
        }
      }
      n.children.forEach(findSpecifiers);
    };

    findSpecifiers(node);
    return specifiers;
  }

  extractReferences(
    symbols: Map<string, Symbol>,
    asts: Map<string, ASTNode>
  ): void {
    Logger.progress('Building reference graph...');

    for (const [filePath, ast] of asts) {
      this.findReferences(ast, symbols, filePath);
    }

    Logger.success('Reference graph built');
  }

  private findReferences(
    node: ASTNode,
    symbols: Map<string, Symbol>,
    currentFile: string
  ): void {
    if (node.type === 'identifier' && node.name) {
      for (const symbol of symbols.values()) {
        if (symbol.name === node.name) {
          const ref: Reference = {
            location: {
              filePath: currentFile,
              startLine: node.startLine,
              endLine: node.endLine,
              startColumn: 0,
              endColumn: 0
            },
            kind: this.inferReferenceKind(node)
          };
          symbol.references.push(ref);
        }
      }
    }

    for (const child of node.children) {
      this.findReferences(child, symbols, currentFile);
    }
  }

  private inferReferenceKind(node: ASTNode): 'read' | 'write' | 'call' | 'type' {
    const parent = node.metadata.parent as string | undefined;

    if (parent?.includes('call')) return 'call';
    if (parent?.includes('assignment')) return 'write';
    if (parent?.includes('type')) return 'type';

    return 'read';
  }
}
