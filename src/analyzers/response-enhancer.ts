/**
 * ArchiCore Response Enhancer
 *
 * Улучшает ответы ИИ дополнительными инструментами:
 * 1. Follow-up Suggestions - предложения следующих вопросов
 * 2. Visual Diagrams - ASCII/Mermaid диаграммы
 * 3. Test Generator - генерация тестов
 * 4. Performance Hints - подсказки по оптимизации
 */

import { DependencyGraph, Symbol } from '../types/index.js';
import { ProjectContext } from './context-builder.js';

// ==================== TYPES ====================

export interface EnhancedResponse {
  // Оригинальный ответ ИИ
  answer: string;

  // Предложения следующих вопросов
  followUpSuggestions: FollowUpSuggestion[];

  // Визуальные диаграммы
  diagrams: Diagram[];

  // Сгенерированные тесты
  generatedTests: GeneratedTest[];

  // Подсказки по производительности
  performanceHints: PerformanceHint[];

  // Метаданные
  metadata: {
    intent: string;
    processingTime: number;
    symbolsAnalyzed: number;
    filesAnalyzed: number;
  };
}

export interface FollowUpSuggestion {
  question: string;
  intent: string;
  relevance: number; // 0-1
  icon: string;
}

export interface Diagram {
  type: 'ascii' | 'mermaid';
  title: string;
  content: string;
}

export interface GeneratedTest {
  functionName: string;
  filePath: string;
  language: 'typescript' | 'javascript' | 'php' | 'python';
  testCode: string;
  testFramework: string;
}

export interface PerformanceHint {
  severity: 'critical' | 'warning' | 'info';
  type: string;
  file: string;
  line: number;
  description: string;
  suggestion: string;
  estimatedImpact: string;
  codeExample?: string;
}

// ==================== FOLLOW-UP SUGGESTIONS ====================

const FOLLOW_UP_TEMPLATES: Record<string, FollowUpSuggestion[]> = {
  find_symbol: [
    { question: 'Где используется {symbol}?', intent: 'find_usage', relevance: 0.9, icon: '🔍' },
    { question: 'Покажи тесты для {symbol}', intent: 'find_tests', relevance: 0.8, icon: '🧪' },
    { question: 'Есть ли проблемы в {file}?', intent: 'find_bugs', relevance: 0.7, icon: '🐛' },
    { question: 'Как работает {symbol}?', intent: 'explain_flow', relevance: 0.6, icon: '📖' },
  ],
  find_usage: [
    { question: 'Покажи граф зависимостей для {symbol}', intent: 'show_dependencies', relevance: 0.9, icon: '📊' },
    { question: 'Кто ещё вызывает {symbol}?', intent: 'find_callers', relevance: 0.8, icon: '📞' },
    { question: 'Можно ли оптимизировать {symbol}?', intent: 'optimize', relevance: 0.7, icon: '⚡' },
  ],
  find_bugs: [
    { question: 'Как исправить эту проблему?', intent: 'fix_bug', relevance: 0.9, icon: '🔧' },
    { question: 'Покажи похожие проблемы в проекте', intent: 'find_similar_bugs', relevance: 0.8, icon: '🔍' },
    { question: 'Сгенерируй тест для этого кейса', intent: 'generate_test', relevance: 0.7, icon: '🧪' },
  ],
  explain_flow: [
    { question: 'Покажи диаграмму этого flow', intent: 'show_diagram', relevance: 0.9, icon: '📊' },
    { question: 'Какие есть узкие места?', intent: 'find_bottlenecks', relevance: 0.8, icon: '⚡' },
    { question: 'Как это можно улучшить?', intent: 'refactor', relevance: 0.7, icon: '✨' },
  ],
  architecture: [
    { question: 'Покажи диаграмму архитектуры', intent: 'show_diagram', relevance: 0.9, icon: '📊' },
    { question: 'Какие есть проблемы в архитектуре?', intent: 'architecture_issues', relevance: 0.8, icon: '⚠️' },
    { question: 'Как масштабировать проект?', intent: 'scaling', relevance: 0.7, icon: '📈' },
  ],
  general: [
    { question: 'Покажи структуру проекта', intent: 'architecture', relevance: 0.8, icon: '📁' },
    { question: 'Найди проблемы в коде', intent: 'find_bugs', relevance: 0.7, icon: '🐛' },
    { question: 'Какие метрики у проекта?', intent: 'metrics', relevance: 0.6, icon: '📊' },
  ],
};

export function generateFollowUpSuggestions(
  context: ProjectContext,
  _answer: string
): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = [];
  const templates = FOLLOW_UP_TEMPLATES[context.intent] || FOLLOW_UP_TEMPLATES.general;

  // Извлекаем упомянутые символы и файлы для персонализации
  const mentionedSymbol = context.symbols[0]?.name || '';
  const mentionedFile = context.symbols[0]?.file || context.relevantFiles[0]?.path || '';

  for (const template of templates) {
    let question = template.question;

    // Заменяем плейсхолдеры
    question = question.replace('{symbol}', mentionedSymbol || 'этот код');
    question = question.replace('{file}', mentionedFile ? mentionedFile.split('/').pop() || '' : 'этот файл');

    // Не добавляем если нет контекста для плейсхолдера
    if (question.includes('{')) continue;

    suggestions.push({
      ...template,
      question,
    });
  }

  // Добавляем контекстные предложения на основе найденных проблем
  if (context.issues.length > 0) {
    suggestions.push({
      question: `Как исправить ${context.issues.length} найденных проблем?`,
      intent: 'fix_bugs',
      relevance: 0.95,
      icon: '🔧',
    });
  }

  // Сортируем по релевантности
  suggestions.sort((a, b) => b.relevance - a.relevance);

  return suggestions.slice(0, 4);
}

// ==================== VISUAL DIAGRAMS ====================

export function generateDiagram(
  context: ProjectContext,
  graph: DependencyGraph,
  diagramType: 'dependencies' | 'flow' | 'architecture' = 'dependencies'
): Diagram | null {
  switch (diagramType) {
    case 'dependencies':
      return generateDependencyDiagram(context, graph);
    case 'flow':
      return generateFlowDiagram(context);
    case 'architecture':
      return generateArchitectureDiagram(graph);
    default:
      return null;
  }
}

function generateDependencyDiagram(context: ProjectContext, _graph: DependencyGraph): Diagram | null {
  if (context.dependencies.length === 0) return null;

  const lines: string[] = ['```'];
  lines.push('┌─────────────────────────────────────────┐');
  lines.push('│         Граф зависимостей               │');
  lines.push('└─────────────────────────────────────────┘');
  lines.push('');

  // Группируем по источнику
  const grouped = new Map<string, string[]>();
  for (const dep of context.dependencies) {
    const from = dep.from.split('/').pop() || dep.from;
    const to = dep.to.split('/').pop() || dep.to;

    if (!grouped.has(from)) {
      grouped.set(from, []);
    }
    grouped.get(from)!.push(to);
  }

  // Рисуем ASCII диаграмму
  let i = 0;
  for (const [from, targets] of grouped) {
    if (i > 0) lines.push('│');

    const boxWidth = Math.max(from.length + 4, 20);
    const topBorder = '┌' + '─'.repeat(boxWidth) + '┐';
    const bottomBorder = '└' + '─'.repeat(boxWidth) + '┘';
    const content = '│ ' + from.padEnd(boxWidth - 2) + ' │';

    lines.push(topBorder);
    lines.push(content);
    lines.push(bottomBorder);

    for (let j = 0; j < targets.length; j++) {
      const target = targets[j];
      const isLast = j === targets.length - 1;
      const connector = isLast ? '└──▶ ' : '├──▶ ';
      lines.push(connector + target);
    }

    i++;
    if (i >= 5) {
      lines.push(`... и ещё ${grouped.size - 5} модулей`);
      break;
    }
  }

  lines.push('```');

  return {
    type: 'ascii',
    title: 'Граф зависимостей',
    content: lines.join('\n'),
  };
}

function generateFlowDiagram(context: ProjectContext): Diagram | null {
  if (context.symbols.length === 0) return null;

  const symbol = context.symbols[0];
  const lines: string[] = ['```mermaid', 'flowchart TD'];

  // Добавляем главный символ
  const mainId = 'A';
  lines.push(`    ${mainId}[${symbol.name}]`);

  // Добавляем вызываемые функции
  const calls = symbol.calls.slice(0, 5);
  calls.forEach((call, i) => {
    const callId = `B${i}`;
    const callName = call.split('/').pop() || call;
    lines.push(`    ${mainId} --> ${callId}[${callName}]`);
  });

  // Добавляем вызывающие функции
  const callers = symbol.calledBy.slice(0, 3);
  callers.forEach((caller, i) => {
    const callerId = `C${i}`;
    const callerName = caller.split('/').pop() || caller;
    lines.push(`    ${callerId}[${callerName}] --> ${mainId}`);
  });

  lines.push('```');

  // Также делаем ASCII версию для CLI
  const asciiLines: string[] = ['```'];

  if (callers.length > 0) {
    asciiLines.push('  Вызывается из:');
    for (const caller of callers) {
      const name = caller.split('/').pop() || caller;
      asciiLines.push(`  ┌─────────────────┐`);
      asciiLines.push(`  │ ${name.padEnd(15)} │`);
      asciiLines.push(`  └────────┬────────┘`);
      asciiLines.push(`           │`);
      asciiLines.push(`           ▼`);
    }
  }

  asciiLines.push(`  ┌${'─'.repeat(symbol.name.length + 4)}┐`);
  asciiLines.push(`  │  ${symbol.name}  │ ◀── текущий`);
  asciiLines.push(`  └${'─'.repeat(symbol.name.length + 4)}┘`);

  if (calls.length > 0) {
    asciiLines.push(`           │`);
    asciiLines.push(`           ▼`);
    asciiLines.push('  Вызывает:');
    for (const call of calls) {
      const name = call.split('/').pop() || call;
      asciiLines.push(`  ├──▶ ${name}`);
    }
  }

  asciiLines.push('```');

  return {
    type: 'ascii',
    title: `Flow: ${symbol.name}`,
    content: asciiLines.join('\n'),
  };
}

function generateArchitectureDiagram(graph: DependencyGraph): Diagram | null {
  const nodes = Array.from(graph.nodes.values());
  if (nodes.length === 0) return null;

  // Группируем файлы по директориям
  const dirs = new Map<string, number>();
  for (const node of nodes) {
    const parts = node.filePath.split('/');
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join('/');
      dirs.set(dir, (dirs.get(dir) || 0) + 1);
    }
  }

  const lines: string[] = ['```'];
  lines.push('┌─────────────────────────────────────────┐');
  lines.push('│         Архитектура проекта             │');
  lines.push('└─────────────────────────────────────────┘');
  lines.push('');

  // Показываем топ директории
  const sortedDirs = Array.from(dirs.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  for (const [dir, count] of sortedDirs) {
    const shortDir = dir.split('/').slice(-2).join('/');
    const bar = '█'.repeat(Math.min(count, 20));
    lines.push(`  📁 ${shortDir.padEnd(25)} ${bar} (${count})`);
  }

  lines.push('');
  lines.push(`  Всего: ${nodes.length} файлов в ${dirs.size} директориях`);
  lines.push('```');

  return {
    type: 'ascii',
    title: 'Архитектура проекта',
    content: lines.join('\n'),
  };
}

// ==================== TEST GENERATOR ====================

export function generateTests(context: ProjectContext): GeneratedTest[] {
  const tests: GeneratedTest[] = [];

  for (const symbol of context.symbols.slice(0, 3)) {
    if (symbol.type !== 'function' && symbol.type !== 'method') continue;

    const language = detectLanguage(symbol.file);
    const test = generateTestForFunction(symbol, language);
    if (test) tests.push(test);
  }

  return tests;
}

function detectLanguage(filePath: string): GeneratedTest['language'] {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'php':
      return 'php';
    case 'py':
      return 'python';
    default:
      return 'typescript';
  }
}

function generateTestForFunction(
  symbol: ProjectContext['symbols'][0],
  language: GeneratedTest['language']
): GeneratedTest | null {
  const funcName = symbol.name;

  // Анализируем сниппет для понимания сигнатуры
  const snippet = symbol.snippet;
  const hasAsync = snippet.includes('async');
  const hasParams = snippet.includes('(') && !snippet.includes('()');

  let testCode: string;
  let testFramework: string;

  switch (language) {
    case 'typescript':
    case 'javascript':
      testFramework = 'jest';
      testCode = generateJestTest(funcName, hasAsync, hasParams, symbol.file);
      break;
    case 'php':
      testFramework = 'phpunit';
      testCode = generatePhpUnitTest(funcName, hasParams, symbol.file);
      break;
    case 'python':
      testFramework = 'pytest';
      testCode = generatePytestTest(funcName, hasAsync, hasParams);
      break;
    default:
      return null;
  }

  return {
    functionName: funcName,
    filePath: symbol.file,
    language,
    testCode,
    testFramework,
  };
}

function generateJestTest(funcName: string, hasAsync: boolean, hasParams: boolean, filePath: string): string {
  const importPath = filePath.replace(/\.(ts|js)x?$/, '');
  const awaitKeyword = hasAsync ? 'await ' : '';
  const asyncKeyword = hasAsync ? 'async ' : '';

  let params = '';
  let setupCode = '';

  if (hasParams) {
    params = 'mockInput';
    setupCode = `    const mockInput = {}; // TODO: добавить тестовые данные\n`;
  }

  return `import { ${funcName} } from '${importPath}';

describe('${funcName}', () => {
  it('should work correctly with valid input', ${asyncKeyword}() => {
${setupCode}    const result = ${awaitKeyword}${funcName}(${params});

    expect(result).toBeDefined();
    // TODO: добавить конкретные assertions
  });

  it('should handle edge cases', ${asyncKeyword}() => {
    // TODO: тест граничных случаев
    expect(true).toBe(true);
  });

  it('should throw error on invalid input', ${asyncKeyword}() => {
    ${hasAsync ? `await expect(${funcName}(null)).rejects.toThrow();` : `expect(() => ${funcName}(null)).toThrow();`}
  });
});`;
}

function generatePhpUnitTest(funcName: string, hasParams: boolean, filePath: string): string {
  const className = filePath.split('/').pop()?.replace('.php', '') || 'TestClass';
  const params = hasParams ? '$mockInput' : '';
  const setupCode = hasParams ? '        $mockInput = []; // TODO: добавить тестовые данные\n' : '';

  return `<?php

use PHPUnit\\Framework\\TestCase;

class ${className}Test extends TestCase
{
    public function test${funcName.charAt(0).toUpperCase() + funcName.slice(1)}WithValidInput(): void
    {
${setupCode}        $result = ${funcName}(${params});

        $this->assertNotNull($result);
        // TODO: добавить конкретные assertions
    }

    public function test${funcName.charAt(0).toUpperCase() + funcName.slice(1)}WithInvalidInput(): void
    {
        $this->expectException(\\InvalidArgumentException::class);
        ${funcName}(null);
    }
}`;
}

function generatePytestTest(funcName: string, hasAsync: boolean, hasParams: boolean): string {
  const asyncDef = hasAsync ? 'async ' : '';
  const awaitKeyword = hasAsync ? 'await ' : '';
  const params = hasParams ? 'mock_input' : '';
  const setupCode = hasParams ? '    mock_input = {}  # TODO: добавить тестовые данные\n' : '';
  const pytestMark = hasAsync ? '@pytest.mark.asyncio\n' : '';

  return `import pytest
from your_module import ${funcName}

${pytestMark}${asyncDef}def test_${funcName}_with_valid_input():
${setupCode}    result = ${awaitKeyword}${funcName}(${params})

    assert result is not None
    # TODO: добавить конкретные assertions

${pytestMark}${asyncDef}def test_${funcName}_with_invalid_input():
    with pytest.raises(ValueError):
        ${awaitKeyword}${funcName}(None)`;
}

// ==================== PERFORMANCE HINTS ====================

interface PerformancePattern {
  name: string;
  pattern: RegExp;
  severity: PerformanceHint['severity'];
  type: string;
  description: string;
  suggestion: string;
  estimatedImpact: string;
  getCodeExample?: (match: RegExpMatchArray) => string;
}

const PERFORMANCE_PATTERNS: PerformancePattern[] = [
  {
    name: 'n-plus-one',
    pattern: /for\s*\([^)]+\)\s*\{[^}]*await\s+\w+\.(find|get|fetch|query|select)/gi,
    severity: 'critical',
    type: 'N+1 Query',
    description: 'Запрос к БД внутри цикла - N+1 проблема',
    suggestion: 'Используй batch запрос или JOIN вместо цикла',
    estimatedImpact: '10-100x improvement',
    getCodeExample: () => `// Вместо:
for (const item of items) {
  const data = await db.find(item.id);
}

// Используй:
const ids = items.map(i => i.id);
const data = await db.findMany({ id: { $in: ids } });`,
  },
  {
    name: 'no-pagination',
    pattern: /SELECT\s+\*\s+FROM\s+\w+(?!\s+LIMIT)/gi,
    severity: 'warning',
    type: 'Missing Pagination',
    description: 'SELECT * без LIMIT может вернуть миллионы записей',
    suggestion: 'Добавь LIMIT и OFFSET для пагинации',
    estimatedImpact: 'Memory usage reduction',
    getCodeExample: () => `// Вместо:
SELECT * FROM orders

// Используй:
SELECT * FROM orders LIMIT 100 OFFSET 0`,
  },
  {
    name: 'sync-file-read',
    pattern: /readFileSync|writeFileSync|existsSync\s*\(/g,
    severity: 'warning',
    type: 'Synchronous I/O',
    description: 'Синхронное чтение файлов блокирует event loop',
    suggestion: 'Используй async версии: readFile, writeFile, access',
    estimatedImpact: 'Better throughput under load',
  },
  {
    name: 'console-in-loop',
    pattern: /for\s*\([^)]+\)\s*\{[^}]*console\.(log|debug|info)/gi,
    severity: 'info',
    type: 'Console in Loop',
    description: 'console.log в цикле замедляет выполнение',
    suggestion: 'Собери данные и выведи один раз после цикла',
    estimatedImpact: '2-5x faster loops',
  },
  {
    name: 'string-concat-loop',
    pattern: /for\s*\([^)]+\)\s*\{[^}]*\+=/gi,
    severity: 'info',
    type: 'String Concatenation in Loop',
    description: 'Конкатенация строк в цикле создаёт много временных объектов',
    suggestion: 'Используй Array.join() или StringBuilder',
    estimatedImpact: 'Reduced memory allocations',
  },
  {
    name: 'no-index-hint',
    pattern: /findOne\s*\(\s*\{\s*\w+:/g,
    severity: 'info',
    type: 'Possible Missing Index',
    description: 'Проверь есть ли индекс на поле поиска',
    suggestion: 'Создай индекс: db.collection.createIndex({ field: 1 })',
    estimatedImpact: 'Query time: O(n) → O(log n)',
  },
  {
    name: 'large-payload',
    pattern: /res\.(json|send)\s*\(\s*\{[^}]{500,}/g,
    severity: 'warning',
    type: 'Large Response Payload',
    description: 'Большой payload замедляет передачу и парсинг',
    suggestion: 'Используй пагинацию или lazy loading для больших данных',
    estimatedImpact: 'Faster API responses',
  },
  {
    name: 'no-caching',
    pattern: /async\s+\w+\([^)]*\)\s*\{[^}]*await\s+fetch\([^)]+\)/g,
    severity: 'info',
    type: 'No Caching',
    description: 'Внешний API запрос без кэширования',
    suggestion: 'Добавь Redis/memory cache для частых запросов',
    estimatedImpact: 'Reduced latency, less API calls',
  },
  {
    name: 'regexp-in-loop',
    pattern: /for\s*\([^)]+\)\s*\{[^}]*new\s+RegExp/gi,
    severity: 'warning',
    type: 'RegExp Creation in Loop',
    description: 'Создание RegExp в цикле - дорогая операция',
    suggestion: 'Вынеси RegExp за пределы цикла',
    estimatedImpact: '5-10x faster',
  },
  {
    name: 'json-parse-loop',
    pattern: /for\s*\([^)]+\)\s*\{[^}]*JSON\.(parse|stringify)/gi,
    severity: 'warning',
    type: 'JSON Parse/Stringify in Loop',
    description: 'JSON операции в цикле замедляют выполнение',
    suggestion: 'Минимизируй JSON операции, кэшируй результаты',
    estimatedImpact: 'Reduced CPU usage',
  },
];

export function analyzePerformance(
  context: ProjectContext,
  fileContents: Map<string, string>
): PerformanceHint[] {
  const hints: PerformanceHint[] = [];

  // Анализируем файлы из контекста
  const filesToAnalyze = context.relevantFiles.length > 0
    ? context.relevantFiles.map(f => f.path)
    : Array.from(fileContents.keys()).slice(0, 20);

  for (const filePath of filesToAnalyze) {
    const content = fileContents.get(filePath);
    if (!content) continue;

    for (const pattern of PERFORMANCE_PATTERNS) {
      // Reset regex state
      pattern.pattern.lastIndex = 0;

      let match;
      while ((match = pattern.pattern.exec(content)) !== null) {
        // Находим номер строки
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        hints.push({
          severity: pattern.severity,
          type: pattern.type,
          file: filePath,
          line: lineNumber,
          description: pattern.description,
          suggestion: pattern.suggestion,
          estimatedImpact: pattern.estimatedImpact,
          codeExample: pattern.getCodeExample?.(match),
        });
      }
    }
  }

  // Сортируем по severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  hints.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return hints.slice(0, 10);
}

// ==================== MAIN ENHANCER ====================

export class ResponseEnhancer {
  private graph: DependencyGraph;
  private fileContents: Map<string, string>;

  constructor(
    graph: DependencyGraph,
    _symbols: Map<string, Symbol>,
    fileContents: Map<string, string>
  ) {
    this.graph = graph;
    this.fileContents = fileContents;
  }

  /**
   * Улучшает ответ ИИ дополнительной информацией
   */
  enhance(
    originalAnswer: string,
    context: ProjectContext
  ): EnhancedResponse {
    const startTime = Date.now();

    // 1. Follow-up suggestions
    const followUpSuggestions = generateFollowUpSuggestions(context, originalAnswer);

    // 2. Visual diagrams
    const diagrams: Diagram[] = [];

    // Добавляем диаграмму зависимостей если есть зависимости
    if (context.dependencies.length > 0) {
      const depDiagram = generateDiagram(context, this.graph, 'dependencies');
      if (depDiagram) diagrams.push(depDiagram);
    }

    // Добавляем flow диаграмму если искали символ
    if (context.intent === 'find_symbol' || context.intent === 'explain_flow') {
      const flowDiagram = generateDiagram(context, this.graph, 'flow');
      if (flowDiagram) diagrams.push(flowDiagram);
    }

    // 3. Generated tests
    const generatedTests = context.intent === 'find_symbol' || context.intent === 'explain_flow'
      ? generateTests(context)
      : [];

    // 4. Performance hints
    const performanceHints = context.intent === 'find_bugs' ||
                            context.intent === 'refactor' ||
                            context.query.toLowerCase().includes('performance') ||
                            context.query.toLowerCase().includes('оптимиз') ||
                            context.query.toLowerCase().includes('тормоз')
      ? analyzePerformance(context, this.fileContents)
      : [];

    return {
      answer: originalAnswer,
      followUpSuggestions,
      diagrams,
      generatedTests,
      performanceHints,
      metadata: {
        intent: context.intent,
        processingTime: Date.now() - startTime,
        symbolsAnalyzed: context.symbols.length,
        filesAnalyzed: context.relevantFiles.length,
      },
    };
  }

  /**
   * Форматирует улучшенный ответ для CLI
   */
  formatForCLI(enhanced: EnhancedResponse): string {
    const parts: string[] = [enhanced.answer];

    // Диаграммы
    if (enhanced.diagrams.length > 0) {
      parts.push('\n');
      for (const diagram of enhanced.diagrams) {
        parts.push(`\n📊 ${diagram.title}:\n`);
        parts.push(diagram.content);
      }
    }

    // Performance hints
    if (enhanced.performanceHints.length > 0) {
      parts.push('\n\n⚡ Подсказки по производительности:\n');
      for (const hint of enhanced.performanceHints) {
        const icon = hint.severity === 'critical' ? '🔴' :
                    hint.severity === 'warning' ? '🟡' : '🔵';
        parts.push(`\n${icon} ${hint.type}: ${hint.description}`);
        parts.push(`   📍 ${hint.file}:${hint.line}`);
        parts.push(`   💡 ${hint.suggestion}`);
        parts.push(`   📈 ${hint.estimatedImpact}`);
        if (hint.codeExample) {
          parts.push(`\n${hint.codeExample}`);
        }
      }
    }

    // Сгенерированные тесты
    if (enhanced.generatedTests.length > 0) {
      parts.push('\n\n🧪 Сгенерированные тесты:\n');
      for (const test of enhanced.generatedTests) {
        parts.push(`\n// Тест для ${test.functionName} (${test.testFramework})`);
        parts.push(`// Файл: ${test.filePath}`);
        parts.push('```' + test.language);
        parts.push(test.testCode);
        parts.push('```');
      }
    }

    // Follow-up suggestions
    if (enhanced.followUpSuggestions.length > 0) {
      parts.push('\n\n📌 Связанные вопросы:\n');
      enhanced.followUpSuggestions.forEach((suggestion, i) => {
        parts.push(`   [${i + 1}] ${suggestion.icon} ${suggestion.question}`);
      });
    }

    return parts.join('');
  }

  /**
   * Форматирует улучшенный ответ для API/Web
   */
  formatForAPI(enhanced: EnhancedResponse): {
    answer: string;
    followUpSuggestions: FollowUpSuggestion[];
    diagrams: Diagram[];
    generatedTests: GeneratedTest[];
    performanceHints: PerformanceHint[];
    metadata: EnhancedResponse['metadata'];
  } {
    // Для API возвращаем структурированные данные
    // Фронтенд сам решит как их отобразить
    return {
      answer: enhanced.answer,
      followUpSuggestions: enhanced.followUpSuggestions,
      diagrams: enhanced.diagrams,
      generatedTests: enhanced.generatedTests,
      performanceHints: enhanced.performanceHints,
      metadata: enhanced.metadata,
    };
  }
}

/**
 * Создание энхансера
 */
export function createResponseEnhancer(
  graph: DependencyGraph,
  symbols: Map<string, Symbol>,
  fileContents: Map<string, string>
): ResponseEnhancer {
  return new ResponseEnhancer(graph, symbols, fileContents);
}
