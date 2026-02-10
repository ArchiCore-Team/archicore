import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import { ASTNode, Location } from '../types/index.js';
import { FileUtils } from '../utils/file-utils.js';
import { Logger } from '../utils/logger.js';

// Tree-sitter handles large files well. 1MB limit covers even monolithic Vue SFC files
// like App.vue (420KB script section). Previous 200KB limit forced regex fallback on those.
const MAX_TREE_SITTER_SIZE = 1000000;

export class ASTParser {
  private parsers: Map<string, Parser>;

  constructor() {
    this.parsers = new Map();
    this.initializeParsers();
  }

  private initializeParsers() {
    const tsParser = new Parser();
    tsParser.setLanguage(TypeScript.typescript);
    this.parsers.set('typescript', tsParser);

    const jsParser = new Parser();
    jsParser.setLanguage(JavaScript);
    this.parsers.set('javascript', jsParser);

    const pyParser = new Parser();
    pyParser.setLanguage(Python);
    this.parsers.set('python', pyParser);

    Logger.debug('AST parsers initialized');
  }

  /**
   * Парсит контент напрямую (для виртуальных файлов из source maps)
   */
  parseContent(content: string, virtualPath: string): ASTNode | null {
    try {
      let processedContent = content;
      let language = FileUtils.getLanguageFromExtension(virtualPath);

      // Vue SFC: extract <script> section and parse as TS/JS
      if (language === 'vue') {
        const scriptResult = this.extractVueScript(processedContent);
        if (!scriptResult) {
          return null;
        }
        processedContent = scriptResult.content;
        language = scriptResult.isTypeScript ? 'typescript' : 'javascript';
      }

      // Validate content before parsing
      if (!processedContent || typeof processedContent !== 'string' || !processedContent.trim()) {
        return null;
      }

      // For large files, use regex-based fallback
      if (processedContent.length > MAX_TREE_SITTER_SIZE) {
        return this.parseWithRegex(processedContent, virtualPath, language);
      }

      const parser = this.parsers.get(language);
      if (!parser) {
        return this.parseWithRegex(processedContent, virtualPath, language);
      }

      const tree = parser.parse(processedContent);
      return this.convertToASTNode(tree.rootNode, virtualPath);
    } catch {
      // Try regex fallback
      try {
        const language = FileUtils.getLanguageFromExtension(virtualPath);
        return this.parseWithRegex(content, virtualPath, language);
      } catch {
        return null;
      }
    }
  }

  // Languages that don't contain application logic — skip symbol extraction
  private static NON_CODE_LANGUAGES = new Set([
    'sql', 'prisma', 'graphql', 'json', 'yaml', 'toml', 'ini',
    'xml', 'html', 'css', 'scss', 'sass', 'less', 'stylus',
    'markdown', 'dockerfile', 'make', 'cmake', 'terraform', 'protobuf',
  ]);

  async parseFile(filePath: string): Promise<ASTNode | null> {
    try {
      let content = await FileUtils.readFileContent(filePath);
      let language = FileUtils.getLanguageFromExtension(filePath);

      // Skip non-code files (SQL, config, markup) — they produce noise symbols
      if (ASTParser.NON_CODE_LANGUAGES.has(language)) {
        return null;
      }

      // Vue SFC: extract <script> section and parse as TS/JS
      if (language === 'vue') {
        const scriptResult = this.extractVueScript(content);
        if (!scriptResult) {
          return null; // No script section found
        }
        content = scriptResult.content;
        language = scriptResult.isTypeScript ? 'typescript' : 'javascript';
      }

      // Validate content before parsing
      if (!content || typeof content !== 'string' || !content.trim()) {
        Logger.warn(`Empty or invalid content in: ${filePath}`);
        return null;
      }

      // For large files, use regex-based fallback
      if (content.length > MAX_TREE_SITTER_SIZE) {
        Logger.debug(`Large file (${content.length} bytes), using regex fallback: ${filePath}`);
        return this.parseWithRegex(content, filePath, language);
      }

      const parser = this.parsers.get(language);

      if (!parser) {
        // Use regex fallback for unsupported languages
        return this.parseWithRegex(content, filePath, language);
      }

      const tree = parser.parse(content);
      return this.convertToASTNode(tree.rootNode, filePath);
    } catch (error) {
      // Try regex fallback on parse error
      try {
        const content = await FileUtils.readFileContent(filePath);
        const language = FileUtils.getLanguageFromExtension(filePath);
        Logger.debug(`Tree-sitter failed, using regex fallback: ${filePath}`);
        return this.parseWithRegex(content, filePath, language);
      } catch {
        Logger.error(`Failed to parse ${filePath}`, error);
        return null;
      }
    }
  }

  // Regex-based fallback for large files or unsupported languages
  private parseWithRegex(content: string, filePath: string, language: string): ASTNode {
    const children: ASTNode[] = [];
    const lines = content.split('\n');

    // Patterns for different languages
    const patterns: Record<string, RegExp[]> = {
      javascript: [
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /^(?:export\s+)?class\s+(\w+)/,
        /^(?:export\s+)?const\s+(\w+)\s*=/,
        /^(?:export\s+)?let\s+(\w+)\s*=/,
        /(\w+)\s*[=:]\s*(?:async\s+)?\([^)]*\)\s*(?:=>|{)/,
        /(\w+)\s*\([^)]*\)\s*{/
      ],
      typescript: [
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /^(?:export\s+)?class\s+(\w+)/,
        /^(?:export\s+)?interface\s+(\w+)/,
        /^(?:export\s+)?type\s+(\w+)\s*=/,
        /^(?:export\s+)?const\s+(\w+)\s*[=:]/,
        /^(?:export\s+)?enum\s+(\w+)/,
        /(\w+)\s*[=:]\s*(?:async\s+)?\([^)]*\)\s*(?:=>|{)/,
        /(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/
      ],
      python: [
        /^(?:async\s+)?def\s+(\w+)/,
        /^class\s+(\w+)/
      ],
      vue: [
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /^(?:export\s+)?const\s+(\w+)\s*=/,
        /(\w+)\s*[=:]\s*(?:async\s+)?\([^)]*\)\s*(?:=>|{)/,
        /(\w+)\s*\([^)]*\)\s*{/
      ],
      go: [
        /^func\s+(?:\([^)]+\)\s+)?(\w+)/,
        /^type\s+(\w+)\s+(?:struct|interface)/
      ],
      rust: [
        /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
        /^(?:pub\s+)?struct\s+(\w+)/,
        /^(?:pub\s+)?enum\s+(\w+)/,
        /^(?:pub\s+)?trait\s+(\w+)/,
        /^impl(?:<[^>]+>)?\s+(\w+)/
      ],
      java: [
        /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)/,
        /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?interface\s+(\w+)/,
        /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+\s+)+(\w+)\s*\(/
      ],
      php: [
        /^\s*namespace\s+([\w\\]+)/,                                    // namespace App\Controllers
        /^\s*(?:final\s+|abstract\s+)?class\s+(\w+)/,                  // class, final class, abstract class
        /^\s*interface\s+(\w+)/,                                        // interface
        /^\s*trait\s+(\w+)/,                                           // trait
        /^\s*(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)/,  // function
        /^\s*const\s+(\w+)\s*=/,                                       // const
      ],
      ruby: [
        /^def\s+(\w+)/,
        /^class\s+(\w+)/,
        /^module\s+(\w+)/
      ],
      csharp: [
        /^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:partial\s+)?class\s+(\w+)/,
        /^(?:public|private|protected|internal)?\s*interface\s+(\w+)/,
        /^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:\w+\s+)+(\w+)\s*\(/
      ],
      cpp: [
        /^(?:class|struct)\s+(\w+)/,
        /^(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*(?:const)?\s*(?:override)?\s*{/,
        /^namespace\s+(\w+)/
      ],
      c: [
        /^(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*{/,
        /^struct\s+(\w+)/,
        /^typedef\s+.*\s+(\w+)\s*;/
      ],
      html: [
        /<(\w+)\s+id="(\w+)"/,           // Elements with id
        /<script[^>]*>/,                  // Script tags
        /<style[^>]*>/                    // Style tags
      ],
      css: [
        /^\.(\w[\w-]*)\s*\{/,            // Class selectors
        /^#(\w[\w-]*)\s*\{/,             // ID selectors
        /^@media\s+/,                     // Media queries
        /^@keyframes\s+(\w+)/            // Animations
      ],
      scss: [
        /^\.(\w[\w-]*)\s*\{/,
        /^\$(\w[\w-]*)\s*:/,             // Variables
        /^@mixin\s+(\w+)/,               // Mixins
        /^@include\s+(\w+)/              // Include
      ],
      json: [],  // JSON doesn't have functions/classes
      yaml: [],  // YAML doesn't have functions/classes
      xml: [
        /<(\w+)\s+.*?>/                   // XML elements
      ],
      sql: [
        /^CREATE\s+(?:TABLE|VIEW|FUNCTION|PROCEDURE)\s+(\w+)/i,
        /^ALTER\s+TABLE\s+(\w+)/i,
        /^INSERT\s+INTO\s+(\w+)/i
      ],
      shell: [
        /^(\w+)\s*\(\)\s*\{/,            // Function definitions
        /^function\s+(\w+)/              // Function keyword
      ],
      markdown: [],  // Markdown doesn't have functions/classes
      // Additional languages
      kotlin: [
        /^(?:public|private|internal|protected)?\s*(?:suspend\s+)?fun\s+(\w+)/,
        /^(?:public|private|internal|protected)?\s*(?:data\s+|sealed\s+|open\s+)?class\s+(\w+)/,
        /^(?:public|private|internal|protected)?\s*interface\s+(\w+)/,
        /^(?:public|private|internal|protected)?\s*object\s+(\w+)/,
        /^(?:public|private|internal|protected)?\s*enum\s+class\s+(\w+)/
      ],
      swift: [
        /^(?:public|private|internal|fileprivate|open)?\s*func\s+(\w+)/,
        /^(?:public|private|internal|fileprivate|open)?\s*class\s+(\w+)/,
        /^(?:public|private|internal|fileprivate|open)?\s*struct\s+(\w+)/,
        /^(?:public|private|internal|fileprivate|open)?\s*enum\s+(\w+)/,
        /^(?:public|private|internal|fileprivate|open)?\s*protocol\s+(\w+)/,
        /^extension\s+(\w+)/
      ],
      scala: [
        /^(?:def|override\s+def)\s+(\w+)/,
        /^(?:class|case\s+class|abstract\s+class)\s+(\w+)/,
        /^(?:object|case\s+object)\s+(\w+)/,
        /^trait\s+(\w+)/
      ],
      dart: [
        /^(?:Future<[^>]+>|void|int|String|bool|dynamic|\w+)\s+(\w+)\s*\(/,
        /^class\s+(\w+)/,
        /^(?:abstract\s+)?class\s+(\w+)/,
        /^mixin\s+(\w+)/,
        /^extension\s+(\w+)/,
        /^enum\s+(\w+)/
      ],
      lua: [
        /^(?:local\s+)?function\s+(\w+)/,
        /^(\w+)\s*=\s*function\s*\(/
      ],
      perl: [
        /^sub\s+(\w+)/,
        /^package\s+(\w+)/
      ],
      r: [
        /^(\w+)\s*<-\s*function/,
        /^(\w+)\s*=\s*function/
      ],
      julia: [
        /^function\s+(\w+)/,
        /^(?:mutable\s+)?struct\s+(\w+)/,
        /^abstract\s+type\s+(\w+)/,
        /^(\w+)\(.*\)\s*=/  // Short function syntax
      ],
      elixir: [
        /^def\s+(\w+)/,
        /^defp\s+(\w+)/,
        /^defmodule\s+(\w+)/,
        /^defmacro\s+(\w+)/
      ],
      clojure: [
        /^\(defn\s+(\w+)/,
        /^\(defn-\s+(\w+)/,
        /^\(def\s+(\w+)/,
        /^\(defmacro\s+(\w+)/
      ],
      haskell: [
        /^(\w+)\s*::/,  // Type signature
        /^data\s+(\w+)/,
        /^type\s+(\w+)/,
        /^newtype\s+(\w+)/,
        /^class\s+(\w+)/,
        /^instance\s+(\w+)/
      ],
      erlang: [
        /^(\w+)\s*\([^)]*\)\s*->/,
        /^-module\((\w+)\)/,
        /^-record\((\w+)/
      ],
      fsharp: [
        /^let\s+(\w+)/,
        /^type\s+(\w+)/,
        /^module\s+(\w+)/,
        /^member\s+(?:this|_)\.(\w+)/
      ],
      ocaml: [
        /^let\s+(\w+)/,
        /^type\s+(\w+)/,
        /^module\s+(\w+)/,
        /^class\s+(\w+)/
      ],
      zig: [
        /^(?:pub\s+)?fn\s+(\w+)/,
        /^(?:pub\s+)?const\s+(\w+)\s*=/,
        /^(?:pub\s+)?var\s+(\w+)\s*=/
      ],
      nim: [
        /^proc\s+(\w+)/,
        /^func\s+(\w+)/,
        /^method\s+(\w+)/,
        /^template\s+(\w+)/,
        /^macro\s+(\w+)/,
        /^type\s+(\w+)/
      ],
      crystal: [
        /^def\s+(\w+)/,
        /^class\s+(\w+)/,
        /^struct\s+(\w+)/,
        /^module\s+(\w+)/,
        /^macro\s+(\w+)/
      ],
      groovy: [
        /^def\s+(\w+)/,
        /^(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)?(\w+)\s*\(/,
        /^class\s+(\w+)/,
        /^interface\s+(\w+)/
      ],
      powershell: [
        /^function\s+(\w+[\w-]*)/,
        /^filter\s+(\w+[\w-]*)/,
        /^class\s+(\w+)/
      ],
      dockerfile: [
        /^FROM\s+(\S+)/i,
        /^(?:RUN|CMD|ENTRYPOINT|COPY|ADD|ENV|ARG|EXPOSE|WORKDIR|LABEL)\s/i
      ],
      terraform: [
        /^resource\s+"(\w+)"\s+"(\w+)"/,
        /^data\s+"(\w+)"\s+"(\w+)"/,
        /^module\s+"(\w+)"/,
        /^variable\s+"(\w+)"/,
        /^output\s+"(\w+)"/
      ],
      graphql: [
        /^type\s+(\w+)/,
        /^input\s+(\w+)/,
        /^interface\s+(\w+)/,
        /^enum\s+(\w+)/,
        /^scalar\s+(\w+)/,
        /^query\s+(\w+)/,
        /^mutation\s+(\w+)/,
        /^subscription\s+(\w+)/
      ],
      protobuf: [
        /^message\s+(\w+)/,
        /^service\s+(\w+)/,
        /^enum\s+(\w+)/,
        /^rpc\s+(\w+)/
      ],
      toml: [
        /^\[(\w+)\]/,             // Section
        /^\[\[(\w+)\]\]/          // Array of tables
      ],
      ini: [
        /^\[(\w+)\]/              // Section
      ],
      make: [
        /^(\w[\w-]*)\s*:/,        // Target
        /^\.PHONY:\s*(\w+)/       // Phony target
      ],
      cmake: [
        /^function\s*\(\s*(\w+)/i,
        /^macro\s*\(\s*(\w+)/i,
        /^(?:add_executable|add_library)\s*\(\s*(\w+)/i
      ],
      svelte: [
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /^(?:export\s+)?const\s+(\w+)\s*=/,
        /^(?:export\s+)?let\s+(\w+)\s*=/
      ],
      astro: [
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /^(?:export\s+)?const\s+(\w+)\s*=/
      ]
    };

    const langPatterns = patterns[language] || [];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      for (const pattern of langPatterns) {
        const match = trimmedLine.match(pattern);
        if (match && match[1]) {
          const name = match[1];
          // Skip common false positives
          if (['if', 'else', 'for', 'while', 'switch', 'catch', 'try', 'return', 'new', 'throw'].includes(name)) {
            continue;
          }

          const type = this.inferTypeFromPattern(pattern, language);

          // Извлекаем больше контекста - следующие строки до закрывающей скобки
          let codeContext = trimmedLine;
          let endLineIndex = index;

          // Для функций/классов пытаемся захватить тело (до 50 строк)
          if (type.includes('function') || type.includes('class') || type.includes('method')) {
            let braceCount = (trimmedLine.match(/\{/g) || []).length - (trimmedLine.match(/\}/g) || []).length;
            for (let j = index + 1; j < Math.min(index + 50, lines.length) && braceCount > 0; j++) {
              const nextLine = lines[j];
              codeContext += '\n' + nextLine;
              braceCount += (nextLine.match(/\{/g) || []).length - (nextLine.match(/\}/g) || []).length;
              endLineIndex = j;
            }
          }

          children.push({
            id: `${filePath}:${name}:${index}`,
            type,
            name,
            filePath,
            startLine: index,
            endLine: endLineIndex,
            children: [],
            metadata: {
              text: codeContext.substring(0, 2000), // Увеличено с 200 до 2000
              hasErrors: false,
              regexParsed: true
            }
          });
          break; // One match per line
        }
      }
    });

    return {
      id: `${filePath}:0:0`,
      type: 'program',
      name: filePath.split(/[/\\]/).pop() || '',
      filePath,
      startLine: 0,
      endLine: lines.length,
      children,
      metadata: {
        text: `File: ${filePath}`,
        hasErrors: false,
        regexParsed: true,
        symbolCount: children.length
      }
    };
  }

  private inferTypeFromPattern(pattern: RegExp, _language: string): string {
    const patternStr = pattern.source;

    if (patternStr.includes('class')) return 'class_declaration';
    if (patternStr.includes('interface')) return 'interface_declaration';
    if (patternStr.includes('function') || patternStr.includes('def') || patternStr.includes('fn')) return 'function_declaration';
    if (patternStr.includes('type') || patternStr.includes('enum')) return 'type_alias_declaration';
    if (patternStr.includes('struct')) return 'struct_declaration';
    if (patternStr.includes('trait')) return 'trait_declaration';
    if (patternStr.includes('const') || patternStr.includes('let')) return 'variable_declaration';
    if (patternStr.includes('module') || patternStr.includes('namespace')) return 'module_declaration';
    if (patternStr.includes('impl')) return 'impl_declaration';

    return 'function_declaration';
  }

  private extractVueScript(content: string): { content: string; isTypeScript: boolean } | null {
    // Find script blocks - there may be multiple (setup + regular)
    // We want the main script block, not script setup (which uses different syntax)
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    let bestMatch: { attrs: string; content: string } | null = null;

    while ((match = scriptRegex.exec(content)) !== null) {
      const attrs = match[1] || '';
      const scriptContent = match[2] || '';

      // Skip empty scripts
      if (!scriptContent.trim()) continue;

      // Prefer non-setup script, but take setup if it's the only one
      const isSetup = /\bsetup\b/i.test(attrs);

      if (!bestMatch || !isSetup) {
        bestMatch = { attrs, content: scriptContent };
        // If this is a regular (non-setup) script with content, use it
        if (!isSetup) break;
      }
    }

    if (!bestMatch || !bestMatch.content.trim()) {
      return null;
    }

    // Check if TypeScript
    const isTypeScript = /lang\s*=\s*["']ts["']/.test(bestMatch.attrs) ||
                         /lang\s*=\s*["']typescript["']/.test(bestMatch.attrs);

    return {
      content: bestMatch.content.trim(),
      isTypeScript
    };
  }

  async parseProject(
    rootDir: string,
    progressCallback?: (current: number, total: number, file: string) => void
  ): Promise<Map<string, ASTNode>> {
    const files = await FileUtils.getAllFiles(rootDir);
    const asts = new Map<string, ASTNode>();
    const totalFiles = files.length;

    Logger.progress(`Parsing ${totalFiles} files...`);

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];

      // Emit progress
      if (progressCallback) {
        progressCallback(i + 1, totalFiles, file);
      }

      const ast = await this.parseFile(file);
      if (ast) {
        asts.set(file, ast);
      }
    }

    Logger.success(`Parsed ${asts.size} files successfully`);
    return asts;
  }

  private convertToASTNode(node: Parser.SyntaxNode, filePath: string): ASTNode {
    const children: ASTNode[] = [];

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        children.push(this.convertToASTNode(child, filePath));
      }
    }

    return {
      id: `${filePath}:${node.startPosition.row}:${node.startPosition.column}`,
      type: node.type,
      name: this.extractName(node),
      filePath,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      children,
      metadata: {
        text: node.text.length > 200 ? node.text.substring(0, 200) + '...' : node.text,
        hasErrors: node.hasError
      }
    };
  }

  private extractName(node: Parser.SyntaxNode): string {
    // Try field name first (works for most languages)
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      return nameNode.text;
    }

    // Python: decorated_definition has the actual definition as child
    if (node.type === 'decorated_definition') {
      const defNode = node.children.find(c =>
        c.type === 'function_definition' || c.type === 'class_definition'
      );
      if (defNode) {
        const innerName = defNode.childForFieldName('name');
        if (innerName) return innerName.text;
      }
    }

    const interestingTypes = [
      // JS/TS
      'function_declaration',
      'class_declaration',
      'interface_declaration',
      'type_alias_declaration',
      'variable_declaration',
      // Python
      'function_definition',
      'class_definition',
      'async_function_definition'
    ];

    if (interestingTypes.includes(node.type)) {
      // Try to extract name from text
      const match = node.text.match(/(?:def|class|function|async\s+def)\s+(\w+)/);
      if (match) return match[1];
      return node.text.split(/[\s({:]/)[1] || 'anonymous';
    }

    return '';
  }

  extractLocation(node: Parser.SyntaxNode, filePath: string): Location {
    return {
      filePath,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column
    };
  }
}
