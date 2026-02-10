/**
 * Dead Code Detector
 *
 * Обнаружение неиспользуемого кода:
 * - Неиспользуемые экспорты
 * - Неиспользуемые переменные
 * - Unreachable code
 * - Пустые функции/классы
 * - Закомментированный код
 */

import { DependencyGraph, Symbol, SymbolKind } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface DeadCodeResult {
  unusedExports: UnusedExport[];
  unusedVariables: UnusedVariable[];
  unreachableCode: UnreachableCode[];
  emptyBlocks: EmptyBlock[];
  commentedCode: CommentedCode[];
  summary: DeadCodeSummary;
}

export interface UnusedExport {
  name: string;
  type: string;
  file: string;
  line: number;
  suggestion: string;
}

export interface UnusedVariable {
  name: string;
  file: string;
  line: number;
  scope: string;
}

export interface UnreachableCode {
  file: string;
  startLine: number;
  endLine: number;
  reason: string;
}

export interface EmptyBlock {
  type: 'function' | 'class' | 'if' | 'catch' | 'loop';
  name?: string;
  file: string;
  line: number;
}

export interface CommentedCode {
  file: string;
  startLine: number;
  endLine: number;
  linesCount: number;
  preview: string;
}

export interface DeadCodeSummary {
  totalIssues: number;
  unusedExportsCount: number;
  unusedVariablesCount: number;
  unreachableCodeLines: number;
  emptyBlocksCount: number;
  commentedCodeLines: number;
  estimatedCleanupHours: number;
}

export class DeadCodeDetector {
  /**
   * Check if file is a vendor/third-party file that should be skipped
   */
  private isVendorFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    return /(?:^|\/)(?:public|vendor|dist|build|\.next|\.nuxt|bower_components|lib\/vendor)\//i.test(normalized)
      || /\.min\.(js|css)$/.test(normalized);
  }

  /**
   * Анализ мёртвого кода
   */
  async analyze(
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    fileContents: Map<string, string>
  ): Promise<DeadCodeResult> {
    Logger.progress('Analyzing dead code...');

    // Filter out vendor/third-party files
    const sourceFiles = new Map<string, string>();
    for (const [filePath, content] of fileContents) {
      if (!this.isVendorFile(filePath)) {
        sourceFiles.set(filePath, content);
      }
    }

    const unusedExports = this.findUnusedExports(graph, symbols);
    const unusedVariables = this.findUnusedVariables(symbols, sourceFiles);
    const unreachableCode = this.findUnreachableCode(sourceFiles);
    const emptyBlocks = this.findEmptyBlocks(sourceFiles);
    const commentedCode = this.findCommentedCode(sourceFiles);

    const summary = this.calculateSummary(
      unusedExports,
      unusedVariables,
      unreachableCode,
      emptyBlocks,
      commentedCode
    );

    Logger.success(`Dead code analysis complete: ${summary.totalIssues} issues found`);

    return {
      unusedExports,
      unusedVariables,
      unreachableCode,
      emptyBlocks,
      commentedCode,
      summary
    };
  }

  /**
   * Поиск неиспользуемых экспортов
   */
  private findUnusedExports(
    graph: DependencyGraph,
    symbols: Map<string, Symbol>
  ): UnusedExport[] {
    const unusedExports: UnusedExport[] = [];
    const usedSymbols = new Set<string>();

    // Собираем все используемые символы из графа зависимостей
    for (const [, edges] of graph.edges) {
      for (const edge of edges) {
        usedSymbols.add(edge.to);
      }
    }

    // Проверяем все экспортируемые символы
    for (const [, symbol] of symbols) {
      if (symbol.exports) {
        // Проверяем, используется ли символ
        const isUsed = usedSymbols.has(symbol.name) ||
          usedSymbols.has(`${symbol.location.filePath}:${symbol.name}`);

        // Пропускаем entry points (index.ts, main.ts и т.д.)
        const isEntryPoint = symbol.location.filePath.match(/(index|main|app)\.(ts|js|tsx|jsx)$/);

        if (!isUsed && !isEntryPoint) {
          unusedExports.push({
            name: symbol.name,
            type: symbol.kind,
            file: symbol.location.filePath,
            line: symbol.location.startLine,
            suggestion: this.getSuggestionForUnusedExport(symbol)
          });
        }
      }
    }

    return unusedExports;
  }

  // Vue lifecycle hooks and Composition API functions that should never be flagged as unused
  private readonly vueBuiltins = new Set([
    'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount',
    'onUpdated', 'onBeforeUpdate', 'onActivated', 'onDeactivated',
    'onErrorCaptured', 'onRenderTracked', 'onRenderTriggered', 'onServerPrefetch',
    'watch', 'watchEffect', 'watchPostEffect', 'watchSyncEffect',
    'computed', 'ref', 'reactive', 'readonly', 'toRef', 'toRefs',
    'defineProps', 'defineEmits', 'defineExpose', 'defineSlots', 'defineModel',
    'withDefaults', 'useSlots', 'useAttrs',
    'provide', 'inject', 'nextTick',
  ]);

  /**
   * Extract <template> content from a .vue SFC
   */
  private extractVueTemplate(content: string): string | null {
    const match = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    return match ? match[1] : null;
  }

  /**
   * Поиск неиспользуемых переменных
   */
  private findUnusedVariables(
    _symbols: Map<string, Symbol>,
    fileContents: Map<string, string>
  ): UnusedVariable[] {
    const unusedVariables: UnusedVariable[] = [];

    for (const [filePath, content] of fileContents) {
      const isVue = filePath.endsWith('.vue');
      // For .vue files, extract template for checking variable usage
      const templateContent = isVue ? this.extractVueTemplate(content) : null;

      // Ищем объявления переменных
      const varPatterns = [
        /(?:const|let|var)\s+(\w+)\s*[=:]/g,           // const x = ...
        /(?:const|let|var)\s+\{\s*([^}]+)\s*\}/g,     // const { x, y } = ...
        /function\s+(\w+)\s*\(/g,                       // function foo()
        /(\w+)\s*:\s*(?:string|number|boolean|any)/g   // params with types
      ];

      const declaredVars = new Map<string, number>();

      for (const pattern of varPatterns) {
        let match;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          pattern.lastIndex = 0;
          while ((match = pattern.exec(lines[i])) !== null) {
            const varName = match[1];
            // Пропускаем _ префикс (намеренно неиспользуемые)
            if (varName && !varName.startsWith('_')) {
              // Skip Vue builtins
              if (this.vueBuiltins.has(varName)) continue;
              declaredVars.set(varName, i + 1);
            }
          }
        }
      }

      // Проверяем использование
      for (const [varName, line] of declaredVars) {
        // Создаём regex для поиска использований (не объявлений)
        const usagePattern = new RegExp(`(?<!(?:const|let|var|function)\\s+)\\b${varName}\\b`, 'g');
        const usages = content.match(usagePattern);

        // Если только одно вхождение (само объявление), то переменная не используется
        if (!usages || usages.length <= 1) {
          // For .vue files, check if variable is used in <template>
          if (templateContent) {
            const templateUsage = new RegExp(`\\b${varName}\\b`);
            if (templateUsage.test(templateContent)) continue;
          }

          unusedVariables.push({
            name: varName,
            file: filePath,
            line,
            scope: 'local'
          });
        }
      }
    }

    return unusedVariables.slice(0, 100); // Ограничиваем вывод
  }

  /**
   * Extract <script> content from a Vue SFC, returning content with line offset
   */
  private extractVueScript(content: string): { scriptContent: string; lineOffset: number } | null {
    // Match <script> or <script setup> or <script lang="ts">
    const match = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!match || !match.index) return null;
    // Count lines before the <script> tag to get the offset
    const lineOffset = content.substring(0, match.index).split('\n').length;
    return { scriptContent: match[1], lineOffset };
  }

  /**
   * Поиск недостижимого кода
   */
  private findUnreachableCode(fileContents: Map<string, string>): UnreachableCode[] {
    const unreachable: UnreachableCode[] = [];

    for (const [filePath, content] of fileContents) {
      // For .vue files, only analyze the <script> section
      let analyzeContent = content;
      let lineOffset = 0;

      if (filePath.endsWith('.vue')) {
        const scriptData = this.extractVueScript(content);
        if (!scriptData) continue; // No <script> section — skip entirely
        analyzeContent = scriptData.scriptContent;
        lineOffset = scriptData.lineOffset;
      }

      const lines = analyzeContent.split('\n');
      let inUnreachable = false;
      let unreachableStart = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip blank lines when checking for unreachable code
        if (inUnreachable && line === '') continue;

        // case/default labels in switch create new entry points — reset unreachable
        if (inUnreachable && /^(?:case\s|default\s*:)/.test(line)) {
          inUnreachable = false;
          continue;
        }

        // else/else-if after a return in an if block — not unreachable
        if (inUnreachable && /^}\s*else\b/.test(line)) {
          inUnreachable = false;
          continue;
        }

        // Код после return/throw/break/continue в том же блоке
        if (line.match(/^(return|throw|break|continue)\b/) && !line.endsWith('{')) {
          // Don't flag if this is a one-liner (e.g., "return;" as the only statement in a case)
          inUnreachable = true;
          unreachableStart = i + 2 + lineOffset;
        }

        // Конец блока сбрасывает unreachable
        if (inUnreachable && (line === '}' || line === '};' || line === '},')) {
          if (unreachableStart < i + lineOffset) {
            unreachable.push({
              file: filePath,
              startLine: unreachableStart,
              endLine: i + lineOffset,
              reason: 'Code after return/throw/break statement'
            });
          }
          inUnreachable = false;
        }

        // Условия, которые всегда false
        if (line.match(/if\s*\(\s*false\s*\)/)) {
          unreachable.push({
            file: filePath,
            startLine: i + 1 + lineOffset,
            endLine: i + 1 + lineOffset,
            reason: 'Condition is always false'
          });
        }

        // while(false)
        if (line.match(/while\s*\(\s*false\s*\)/)) {
          unreachable.push({
            file: filePath,
            startLine: i + 1 + lineOffset,
            endLine: i + 1 + lineOffset,
            reason: 'Loop condition is always false'
          });
        }
      }
    }

    return unreachable;
  }

  /**
   * Поиск пустых блоков
   */
  private findEmptyBlocks(fileContents: Map<string, string>): EmptyBlock[] {
    const emptyBlocks: EmptyBlock[] = [];

    for (const [filePath, content] of fileContents) {
      const lines = content.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        const nextLine = lines[i + 1]?.trim() || '';

        // Пустая функция
        const funcMatch = line.match(/(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))\s*\{\s*$/);
        if (funcMatch && nextLine === '}') {
          emptyBlocks.push({
            type: 'function',
            name: funcMatch[1] || funcMatch[2],
            file: filePath,
            line: i + 1
          });
        }

        // Пустой класс
        if (line.match(/class\s+\w+.*\{\s*$/) && nextLine === '}') {
          const classMatch = line.match(/class\s+(\w+)/);
          emptyBlocks.push({
            type: 'class',
            name: classMatch?.[1],
            file: filePath,
            line: i + 1
          });
        }

        // Пустой catch
        if (line.match(/catch\s*\([^)]*\)\s*\{\s*$/) && nextLine === '}') {
          emptyBlocks.push({
            type: 'catch',
            file: filePath,
            line: i + 1
          });
        }

        // Пустой if/else
        if (line.match(/(?:if|else)\s*(?:\([^)]*\))?\s*\{\s*$/) && nextLine === '}') {
          emptyBlocks.push({
            type: 'if',
            file: filePath,
            line: i + 1
          });
        }

        // Пустой цикл
        if (line.match(/(?:for|while)\s*\([^)]*\)\s*\{\s*$/) && nextLine === '}') {
          emptyBlocks.push({
            type: 'loop',
            file: filePath,
            line: i + 1
          });
        }
      }
    }

    return emptyBlocks;
  }

  /**
   * Поиск закомментированного кода
   */
  private findCommentedCode(fileContents: Map<string, string>): CommentedCode[] {
    const commentedCode: CommentedCode[] = [];

    // Паттерны кода (упрощённо)
    const codePatterns = [
      /^\s*\/\/\s*(const|let|var|function|class|if|for|while|return|import|export)\b/,
      /^\s*\/\/\s*\w+\s*\([^)]*\)\s*[{;]?\s*$/,
      /^\s*\/\/\s*\w+\.\w+\s*\(/,
      /^\s*\/\*[\s\S]*?(const|let|var|function|class|if|for|while|return)[\s\S]*?\*\//
    ];

    for (const [filePath, content] of fileContents) {
      const lines = content.split('\n');
      let commentStart = -1;
      let commentLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isCommentedCode = codePatterns.some(p => p.test(line));

        if (isCommentedCode) {
          if (commentStart === -1) {
            commentStart = i + 1;
          }
          commentLines.push(line.replace(/^\s*\/\/\s?/, '').trim());
        } else {
          // Конец блока закомментированного кода
          if (commentStart !== -1 && commentLines.length >= 3) {
            commentedCode.push({
              file: filePath,
              startLine: commentStart,
              endLine: i,
              linesCount: commentLines.length,
              preview: commentLines.slice(0, 2).join('\n').substring(0, 100) + '...'
            });
          }
          commentStart = -1;
          commentLines = [];
        }
      }

      // Проверяем конец файла
      if (commentStart !== -1 && commentLines.length >= 3) {
        commentedCode.push({
          file: filePath,
          startLine: commentStart,
          endLine: lines.length,
          linesCount: commentLines.length,
          preview: commentLines.slice(0, 2).join('\n').substring(0, 100) + '...'
        });
      }
    }

    return commentedCode;
  }

  /**
   * Подсказка для неиспользуемого экспорта
   */
  private getSuggestionForUnusedExport(symbol: Symbol): string {
    switch (symbol.kind) {
      case SymbolKind.Function:
        return 'Удалите функцию или используйте её';
      case SymbolKind.Class:
        return 'Удалите класс или создайте экземпляр';
      case SymbolKind.Interface:
        return 'Удалите интерфейс или реализуйте его';
      case SymbolKind.Type:
        return 'Удалите тип или используйте в аннотациях';
      case SymbolKind.Variable:
      case SymbolKind.Constant:
        return 'Удалите переменную или используйте её';
      default:
        return 'Рассмотрите удаление неиспользуемого экспорта';
    }
  }

  /**
   * Сводка
   */
  private calculateSummary(
    unusedExports: UnusedExport[],
    unusedVariables: UnusedVariable[],
    unreachableCode: UnreachableCode[],
    emptyBlocks: EmptyBlock[],
    commentedCode: CommentedCode[]
  ): DeadCodeSummary {
    const unreachableLines = unreachableCode.reduce(
      (sum, u) => sum + (u.endLine - u.startLine + 1),
      0
    );
    const commentedLines = commentedCode.reduce((sum, c) => sum + c.linesCount, 0);

    const totalIssues =
      unusedExports.length +
      unusedVariables.length +
      unreachableCode.length +
      emptyBlocks.length +
      commentedCode.length;

    // Оценка времени на очистку (примерно)
    const estimatedCleanupHours =
      unusedExports.length * 0.05 +
      unusedVariables.length * 0.02 +
      unreachableCode.length * 0.1 +
      emptyBlocks.length * 0.02 +
      commentedCode.length * 0.03;

    return {
      totalIssues,
      unusedExportsCount: unusedExports.length,
      unusedVariablesCount: unusedVariables.length,
      unreachableCodeLines: unreachableLines,
      emptyBlocksCount: emptyBlocks.length,
      commentedCodeLines: commentedLines,
      estimatedCleanupHours: Math.round(estimatedCleanupHours * 10) / 10
    };
  }
}
