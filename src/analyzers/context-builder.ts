/**
 * ArchiCore Context Builder
 *
 * Автоматически собирает релевантный контекст из проекта
 * для умных ответов ИИ в диалоге
 */

import { DependencyGraph, Symbol } from '../types/index.js';
import { Logger } from '../utils/logger.js';

// Типы намерений пользователя
export type UserIntent =
  | 'find_symbol'      // где функция X?
  | 'find_usage'       // где используется X?
  | 'explain_flow'     // как работает X?
  | 'find_bugs'        // найди баги
  | 'architecture'     // объясни архитектуру
  | 'find_file'        // где файл X?
  | 'compare'          // сравни X и Y
  | 'refactor'         // как улучшить X?
  | 'general';         // общий вопрос

// Результат поиска символа
export interface SymbolMatch {
  name: string;
  type: string;
  file: string;
  line: number;
  snippet: string;
  usedIn: Array<{ file: string; line: number; snippet: string }>;
  calls: string[];
  calledBy: string[];
  confidence: number;
}

// Найденный баг/проблема
export interface DetectedIssue {
  type: 'bug' | 'warning' | 'smell' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  message: string;
  snippet: string;
  suggestion: string;
}

// Контекст для LLM
export interface ProjectContext {
  intent: UserIntent;
  query: string;

  // Найденные символы
  symbols: SymbolMatch[];

  // Релевантные файлы
  relevantFiles: Array<{
    path: string;
    relevance: number;
    snippet?: string;
  }>;

  // Граф зависимостей (подмножество)
  dependencies: Array<{
    from: string;
    to: string;
    type: string;
  }>;

  // Расширенные связи (imports, exports, calls, references)
  relationships: Array<{
    source: string;       // файл-источник
    target: string;       // файл-цель
    sourceSymbol?: string; // символ в источнике
    targetSymbol?: string; // символ в цели
    type: 'imports' | 'exports' | 'calls' | 'references' | 'extends' | 'implements' | 'uses';
    line?: number;
    snippet?: string;
  }>;

  // Граф влияния (что изменится при модификации)
  impactPrediction: Array<{
    file: string;
    impactLevel: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
    symbols: string[];
  }>;

  // Найденные проблемы
  issues: DetectedIssue[];

  // Статистика проекта
  projectStats: {
    totalFiles: number;
    totalSymbols: number;
    languages: string[];
    framework?: string;
  };

  // ВСЕ файлы проекта (только пути, без содержимого)
  allFiles: string[];
}

// Паттерны для определения намерения
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: UserIntent }> = [
  // Поиск символа
  { pattern: /где\s+(функци[яю]|метод|класс|переменн[ая]|интерфейс)\s+(\w+)/i, intent: 'find_symbol' },
  { pattern: /найди?\s+(функци[яю]|метод|класс)\s+(\w+)/i, intent: 'find_symbol' },
  { pattern: /where\s+is\s+(function|method|class|variable)\s+(\w+)/i, intent: 'find_symbol' },
  { pattern: /find\s+(function|method|class)\s+(\w+)/i, intent: 'find_symbol' },
  { pattern: /покажи\s+(функци[яю]|метод|класс)\s+(\w+)/i, intent: 'find_symbol' },

  // Поиск использования
  { pattern: /где\s+используется\s+(\w+)/i, intent: 'find_usage' },
  { pattern: /кто\s+вызывает\s+(\w+)/i, intent: 'find_usage' },
  { pattern: /where\s+is\s+(\w+)\s+used/i, intent: 'find_usage' },
  { pattern: /who\s+calls\s+(\w+)/i, intent: 'find_usage' },

  // Объяснение потока
  { pattern: /как\s+работает\s+(\w+)/i, intent: 'explain_flow' },
  { pattern: /объясни\s+(\w+)/i, intent: 'explain_flow' },
  { pattern: /how\s+does\s+(\w+)\s+work/i, intent: 'explain_flow' },
  { pattern: /explain\s+(\w+)/i, intent: 'explain_flow' },

  // Поиск багов
  { pattern: /найди\s+(баги?|ошибки?|проблемы?)/i, intent: 'find_bugs' },
  { pattern: /есть\s+ли\s+(баги?|ошибки?|проблемы?)/i, intent: 'find_bugs' },
  { pattern: /find\s+(bugs?|errors?|issues?|problems?)/i, intent: 'find_bugs' },
  { pattern: /check\s+for\s+(bugs?|errors?)/i, intent: 'find_bugs' },
  { pattern: /что\s+не\s+так/i, intent: 'find_bugs' },

  // Архитектура
  { pattern: /архитектур[аы]/i, intent: 'architecture' },
  { pattern: /структур[аы]\s+проекта/i, intent: 'architecture' },
  { pattern: /architecture/i, intent: 'architecture' },
  { pattern: /project\s+structure/i, intent: 'architecture' },

  // Поиск файла
  { pattern: /где\s+файл\s+(\w+)/i, intent: 'find_file' },
  { pattern: /найди\s+файл\s+(\w+)/i, intent: 'find_file' },
  { pattern: /where\s+is\s+file\s+(\w+)/i, intent: 'find_file' },

  // Рефакторинг
  { pattern: /как\s+улучшить/i, intent: 'refactor' },
  { pattern: /как\s+рефакторить/i, intent: 'refactor' },
  { pattern: /how\s+to\s+(improve|refactor)/i, intent: 'refactor' },
];

// Словарь синонимов русский → английский (для поиска символов)
const SYNONYMS: Record<string, string[]> = {
  // Авторизация
  'авторизация': ['auth', 'login', 'signin', 'authentication', 'authorize'],
  'авторизации': ['auth', 'login', 'signin', 'authentication', 'authorize'],
  'аутентификация': ['auth', 'login', 'signin', 'authentication'],
  'вход': ['login', 'signin', 'auth'],
  'выход': ['logout', 'signout', 'exit'],
  'регистрация': ['register', 'signup', 'registration'],
  'пароль': ['password', 'pwd', 'pass'],
  'токен': ['token', 'jwt', 'bearer'],

  // Загрузка/модули
  'загрузка': ['load', 'loading', 'fetch', 'download', 'import'],
  'модули': ['module', 'modules', 'component', 'components'],
  'модуль': ['module', 'component'],
  'компоненты': ['component', 'components', 'widget', 'widgets'],
  'компонент': ['component', 'widget'],

  // API/данные
  'запрос': ['request', 'query', 'fetch', 'api'],
  'запросы': ['request', 'requests', 'query', 'queries', 'api'],
  'ответ': ['response', 'result', 'reply'],
  'данные': ['data', 'payload', 'state'],
  'состояние': ['state', 'status', 'store'],

  // Маршрутизация
  'маршрут': ['route', 'router', 'path', 'navigation'],
  'маршруты': ['routes', 'router', 'routing', 'navigation'],
  'навигация': ['navigation', 'nav', 'router', 'route'],

  // Формы
  'форма': ['form', 'input', 'field'],
  'формы': ['forms', 'form', 'inputs'],
  'валидация': ['validation', 'validate', 'validator'],

  // Хранилище
  'хранилище': ['store', 'storage', 'state', 'vuex', 'pinia', 'redux'],
  'кэш': ['cache', 'caching', 'memo'],

  // Безопасность
  'безопасность': ['security', 'secure', 'protection', 'guard'],
  'уязвимость': ['vulnerability', 'security', 'xss', 'injection'],

  // Общее
  'пользователь': ['user', 'account', 'profile'],
  'настройки': ['settings', 'config', 'configuration', 'options'],
  'ошибка': ['error', 'exception', 'bug', 'issue'],
  'ошибки': ['errors', 'exceptions', 'bugs', 'issues'],
};

// Паттерны багов
const BUG_PATTERNS = [
  {
    name: 'console-log-in-production',
    pattern: /console\.(log|debug|info)\s*\(/,
    type: 'smell' as const,
    severity: 'low' as const,
    message: 'Console.log в production коде',
    suggestion: 'Используй Logger или удали debug вывод',
  },
  {
    name: 'todo-fixme',
    pattern: /(TODO|FIXME|HACK|XXX):/i,
    type: 'warning' as const,
    severity: 'low' as const,
    message: 'Незавершённая задача в коде',
    suggestion: 'Завершить или создать issue',
  },
  {
    name: 'empty-catch',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    type: 'bug' as const,
    severity: 'medium' as const,
    message: 'Пустой catch блок - ошибки игнорируются',
    suggestion: 'Добавь обработку или логирование ошибки',
  },
  {
    name: 'hardcoded-password',
    pattern: /(password|secret|api.?key)\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'security' as const,
    severity: 'critical' as const,
    message: 'Захардкоженный пароль/ключ',
    suggestion: 'Используй переменные окружения',
  },
  {
    name: 'sql-injection',
    pattern: /(query|execute)\s*\(\s*[`"'].*\$\{/,
    type: 'security' as const,
    severity: 'critical' as const,
    message: 'Возможная SQL инъекция',
    suggestion: 'Используй параметризованные запросы',
  },
  {
    name: 'eval-usage',
    pattern: /\beval\s*\(/,
    type: 'security' as const,
    severity: 'high' as const,
    message: 'Использование eval() - риск инъекции',
    suggestion: 'Избегай eval, используй безопасные альтернативы',
  },
  {
    name: 'any-type',
    pattern: /:\s*any\b/,
    type: 'smell' as const,
    severity: 'low' as const,
    message: 'Использование типа any',
    suggestion: 'Добавь конкретный тип',
  },
  {
    name: 'magic-number',
    pattern: /[=<>]\s*\d{3,}\b/,
    type: 'smell' as const,
    severity: 'low' as const,
    message: 'Magic number в коде',
    suggestion: 'Вынеси в именованную константу',
  },
  {
    name: 'no-await',
    pattern: /async\s+\w+[^}]+\breturn\s+\w+\s*\.\s*\w+\s*\([^)]*\)\s*;?\s*\}/,
    type: 'bug' as const,
    severity: 'medium' as const,
    message: 'Возможно отсутствует await',
    suggestion: 'Проверь, нужен ли await для async функции',
  },
];

export class ContextBuilder {
  private symbols: Map<string, Symbol>;
  private graph: DependencyGraph;
  private fileContents: Map<string, string>;
  private projectStats: ProjectContext['projectStats'];

  constructor(
    symbols: Map<string, Symbol>,
    graph: DependencyGraph,
    fileContents: Map<string, string>,
    projectStats?: Partial<ProjectContext['projectStats']>
  ) {
    this.symbols = symbols;
    this.graph = graph;
    this.fileContents = fileContents;
    this.projectStats = {
      totalFiles: fileContents.size,
      totalSymbols: symbols.size,
      languages: this.detectLanguages(),
      framework: projectStats?.framework,
    };
  }

  /**
   * Главный метод - строит контекст для вопроса пользователя
   */
  async buildContext(userQuery: string): Promise<ProjectContext> {
    Logger.debug(`Building context for: "${userQuery}"`);

    const intent = this.detectIntent(userQuery);
    const entities = this.extractEntities(userQuery);

    // Собираем список ВСЕХ файлов из графа
    const allFiles: string[] = [];
    for (const [filePath] of this.graph.nodes) {
      allFiles.push(filePath);
    }
    // Также добавляем файлы из fileContents которых может не быть в графе
    for (const [filePath] of this.fileContents) {
      if (!allFiles.includes(filePath)) {
        allFiles.push(filePath);
      }
    }

    const context: ProjectContext = {
      intent,
      query: userQuery,
      symbols: [],
      relevantFiles: [],
      dependencies: [],
      relationships: [],
      impactPrediction: [],
      issues: [],
      projectStats: this.projectStats,
      allFiles: allFiles.slice(0, 100), // Лимит 100 файлов для prompt
    };

    // В зависимости от намерения собираем нужный контекст
    switch (intent) {
      case 'find_symbol':
      case 'find_usage':
        context.symbols = this.searchSymbols(entities);
        context.dependencies = this.getSymbolDependencies(context.symbols);
        context.relationships = this.analyzeDeepRelationships(context.symbols);
        context.impactPrediction = this.predictImpact(context.symbols);
        break;

      case 'explain_flow':
        context.symbols = this.searchSymbols(entities);
        context.dependencies = this.getCallChain(entities);
        context.relevantFiles = this.getRelevantFiles(entities);
        context.relationships = this.analyzeDeepRelationships(context.symbols);
        break;

      case 'find_bugs':
        context.issues = this.findBugs(entities);
        context.relevantFiles = this.getFilesWithIssues(context.issues);
        break;

      case 'architecture':
        context.relevantFiles = this.getArchitectureFiles();
        context.dependencies = this.getMainDependencies();
        break;

      case 'find_file':
        context.relevantFiles = this.searchFiles(entities);
        break;

      case 'refactor':
        context.symbols = this.searchSymbols(entities);
        context.issues = this.findIssuesInSymbols(context.symbols);
        context.relationships = this.analyzeDeepRelationships(context.symbols);
        context.impactPrediction = this.predictImpact(context.symbols);
        break;

      default:
        // Общий вопрос - ищем по ключевым словам
        context.symbols = this.searchSymbols(entities);
        context.relevantFiles = this.getRelevantFiles(entities);
        // Для любого вопроса добавляем связи если нашли символы
        if (context.symbols.length > 0) {
          context.relationships = this.analyzeDeepRelationships(context.symbols);
          context.impactPrediction = this.predictImpact(context.symbols);
        }
    }

    Logger.debug(`Context built: ${context.symbols.length} symbols, ${context.relevantFiles.length} files, ${context.issues.length} issues`);

    return context;
  }

  /**
   * Определение намерения пользователя
   */
  private detectIntent(query: string): UserIntent {
    for (const { pattern, intent } of INTENT_PATTERNS) {
      if (pattern.test(query)) {
        return intent;
      }
    }
    return 'general';
  }

  /**
   * Извлечение сущностей из запроса (имена функций, файлов и т.д.)
   */
  private extractEntities(query: string): string[] {
    const entities: string[] = [];

    // Извлекаем слова в кавычках
    const quoted = query.match(/['"`]([^'"`]+)['"`]/g);
    if (quoted) {
      entities.push(...quoted.map(q => q.slice(1, -1)));
    }

    // Извлекаем camelCase и PascalCase слова
    const camelCase = query.match(/\b[a-z]+(?:[A-Z][a-z]+)+\b/g);
    if (camelCase) {
      entities.push(...camelCase);
    }

    const pascalCase = query.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g);
    if (pascalCase) {
      entities.push(...pascalCase);
    }

    // Извлекаем слова после ключевых слов
    const afterKeywords = query.match(/(?:функци[яю]|метод|класс|файл|function|method|class|file)\s+(\w+)/gi);
    if (afterKeywords) {
      for (const match of afterKeywords) {
        const word = match.split(/\s+/).pop();
        if (word) entities.push(word);
      }
    }

    // Извлекаем пути к файлам
    const filePaths = query.match(/[\w\-./\\]+\.(ts|js|php|py|vue|jsx|tsx)/gi);
    if (filePaths) {
      entities.push(...filePaths);
    }

    // Извлекаем русские слова и конвертируем в английские синонимы
    const russianWords = query.toLowerCase().match(/[а-яё]+/gi);
    if (russianWords) {
      for (const word of russianWords) {
        const synonyms = SYNONYMS[word.toLowerCase()];
        if (synonyms) {
          entities.push(...synonyms);
        }
      }
    }

    // Извлекаем английские слова (минимум 3 буквы, не служебные)
    const englishWords = query.match(/\b[a-zA-Z]{3,}\b/g);
    if (englishWords) {
      const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'this', 'that', 'with', 'have', 'from', 'they', 'what', 'where', 'when', 'how', 'why', 'which', 'file', 'files', 'show', 'find', 'search', 'get', 'set', 'покажи', 'найди', 'где', 'как', 'что', 'все', 'какие']);
      for (const word of englishWords) {
        if (!stopWords.has(word.toLowerCase())) {
          entities.push(word.toLowerCase());
        }
      }
    }

    return [...new Set(entities)];
  }

  /**
   * Поиск символов по названию (fuzzy)
   */
  private searchSymbols(entities: string[]): SymbolMatch[] {
    const results: SymbolMatch[] = [];
    const searchTerms = entities.map(e => e.toLowerCase());

    if (searchTerms.length === 0) {
      return results;
    }

    for (const [name, symbol] of this.symbols) {
      const nameLower = name.toLowerCase();

      for (const term of searchTerms) {
        const confidence = this.calculateMatchConfidence(nameLower, term);

        if (confidence > 0.3) {
          const fileContent = this.fileContents.get(symbol.filePath) || '';
          const lines = fileContent.split('\n');
          const snippet = this.getSnippet(lines, symbol.location.startLine, 3);

          results.push({
            name,
            type: symbol.kind,
            file: symbol.filePath,
            line: symbol.location.startLine,
            snippet,
            usedIn: this.findUsages(name),
            calls: this.findCalls(name),
            calledBy: this.findCalledBy(name),
            confidence,
          });
          break;
        }
      }
    }

    // Сортируем по релевантности
    results.sort((a, b) => b.confidence - a.confidence);

    return results.slice(0, 10);
  }

  /**
   * Расчёт схожести строк (fuzzy matching)
   */
  private calculateMatchConfidence(str: string, query: string): number {
    // Точное совпадение
    if (str === query) return 1;

    // Содержит полностью
    if (str.includes(query)) return 0.9;

    // Начинается с
    if (str.startsWith(query)) return 0.85;

    // Заканчивается на
    if (str.endsWith(query)) return 0.8;

    // Частичное совпадение (для camelCase)
    const strParts = str.split(/(?=[A-Z])|_|-/).map(p => p.toLowerCase());
    const queryParts = query.split(/(?=[A-Z])|_|-/).map(p => p.toLowerCase());

    let matches = 0;
    for (const qPart of queryParts) {
      if (strParts.some(sPart => sPart.includes(qPart))) {
        matches++;
      }
    }

    if (matches > 0) {
      return 0.5 + (matches / queryParts.length) * 0.3;
    }

    return 0;
  }

  /**
   * Получение сниппета кода вокруг строки
   */
  private getSnippet(lines: string[], line: number, context: number): string {
    const start = Math.max(0, line - context - 1);
    const end = Math.min(lines.length, line + context);

    return lines
      .slice(start, end)
      .map((l, i) => {
        const lineNum = start + i + 1;
        const marker = lineNum === line ? '→' : ' ';
        return `${marker}${lineNum.toString().padStart(4)}│ ${l}`;
      })
      .join('\n');
  }

  /**
   * Поиск мест использования символа
   */
  private findUsages(symbolName: string): Array<{ file: string; line: number; snippet: string }> {
    const usages: Array<{ file: string; line: number; snippet: string }> = [];
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');

    for (const [file, content] of this.fileContents) {
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          // Пропускаем определение самого символа
          const symbol = this.symbols.get(symbolName);
          if (symbol && symbol.filePath === file && symbol.location.startLine === i + 1) {
            continue;
          }

          usages.push({
            file,
            line: i + 1,
            snippet: lines[i].trim().substring(0, 100),
          });
        }
      }
    }

    return usages.slice(0, 10);
  }

  /**
   * Что вызывает данный символ
   */
  private findCalls(symbolName: string): string[] {
    const symbol = this.symbols.get(symbolName);
    if (!symbol) return [];

    const calls: string[] = [];
    const node = this.graph.nodes.get(symbol.filePath);

    if (node) {
      const edges = this.graph.edges.get(symbol.filePath) || [];
      for (const edge of edges) {
        if (typeof edge === 'object' && 'target' in edge) {
          calls.push((edge as { target: string }).target);
        } else if (typeof edge === 'string') {
          calls.push(edge);
        }
      }
    }

    return calls.slice(0, 10);
  }

  /**
   * Кто вызывает данный символ
   */
  private findCalledBy(symbolName: string): string[] {
    const calledBy: string[] = [];
    const symbol = this.symbols.get(symbolName);
    if (!symbol) return [];

    for (const [file, edges] of this.graph.edges) {
      for (const edge of edges) {
        const target = typeof edge === 'object' && 'to' in edge
          ? (edge as { to: string }).to
          : String(edge);

        if (target === symbol.filePath || target.includes(symbolName)) {
          calledBy.push(file);
          break;
        }
      }
    }

    return calledBy.slice(0, 10);
  }

  /**
   * Получение зависимостей для символов
   */
  private getSymbolDependencies(symbols: SymbolMatch[]): ProjectContext['dependencies'] {
    const deps: ProjectContext['dependencies'] = [];
    const files = new Set(symbols.map(s => s.file));

    for (const file of files) {
      const edges = this.graph.edges.get(file) || [];
      for (const edge of edges) {
        const target = typeof edge === 'object' && 'target' in edge
          ? (edge as { target: string }).target
          : String(edge);

        deps.push({
          from: file,
          to: target,
          type: 'imports',
        });
      }
    }

    return deps.slice(0, 20);
  }

  /**
   * Получение цепочки вызовов
   */
  private getCallChain(entities: string[]): ProjectContext['dependencies'] {
    const chain: ProjectContext['dependencies'] = [];
    const visited = new Set<string>();

    const traverse = (file: string, depth: number) => {
      if (depth > 3 || visited.has(file)) return;
      visited.add(file);

      const edges = this.graph.edges.get(file) || [];
      for (const edge of edges) {
        const target = typeof edge === 'object' && 'target' in edge
          ? (edge as { target: string }).target
          : String(edge);

        chain.push({
          from: file,
          to: target,
          type: 'calls',
        });

        traverse(target, depth + 1);
      }
    };

    for (const entity of entities) {
      const symbol = this.symbols.get(entity);
      if (symbol) {
        traverse(symbol.filePath, 0);
      }
    }

    return chain;
  }

  /**
   * Поиск релевантных файлов
   */
  private getRelevantFiles(entities: string[]): ProjectContext['relevantFiles'] {
    const files: ProjectContext['relevantFiles'] = [];
    const searchTerms = entities.map(e => e.toLowerCase());

    for (const [path, content] of this.fileContents) {
      let relevance = 0;

      for (const term of searchTerms) {
        if (path.toLowerCase().includes(term)) {
          relevance += 0.5;
        }
        if (content.toLowerCase().includes(term)) {
          relevance += 0.3;
        }
      }

      if (relevance > 0) {
        files.push({
          path,
          relevance,
          snippet: content.substring(0, 200) + '...',
        });
      }
    }

    files.sort((a, b) => b.relevance - a.relevance);
    return files.slice(0, 10);
  }

  /**
   * Поиск багов в коде
   */
  private findBugs(entities: string[]): DetectedIssue[] {
    const issues: DetectedIssue[] = [];
    const filesToCheck = entities.length > 0
      ? this.getRelevantFiles(entities).map(f => f.path)
      : Array.from(this.fileContents.keys());

    for (const file of filesToCheck.slice(0, 50)) {
      const content = this.fileContents.get(file);
      if (!content) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const bugPattern of BUG_PATTERNS) {
          if (bugPattern.pattern.test(line)) {
            issues.push({
              type: bugPattern.type,
              severity: bugPattern.severity,
              file,
              line: i + 1,
              message: bugPattern.message,
              snippet: line.trim().substring(0, 100),
              suggestion: bugPattern.suggestion,
            });
          }
        }
      }
    }

    // Сортируем по severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return issues.slice(0, 20);
  }

  /**
   * Получение файлов с проблемами
   */
  private getFilesWithIssues(issues: DetectedIssue[]): ProjectContext['relevantFiles'] {
    const fileMap = new Map<string, number>();

    for (const issue of issues) {
      const count = fileMap.get(issue.file) || 0;
      fileMap.set(issue.file, count + 1);
    }

    return Array.from(fileMap.entries())
      .map(([path, count]) => ({
        path,
        relevance: count,
      }))
      .sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Получение файлов архитектуры
   */
  private getArchitectureFiles(): ProjectContext['relevantFiles'] {
    const architecturePatterns = [
      /index\.(ts|js|php)$/,
      /main\.(ts|js|php)$/,
      /app\.(ts|js|vue|php)$/,
      /router/i,
      /routes/i,
      /controller/i,
      /service/i,
      /model/i,
      /config/i,
    ];

    const files: ProjectContext['relevantFiles'] = [];

    for (const path of this.fileContents.keys()) {
      for (const pattern of architecturePatterns) {
        if (pattern.test(path)) {
          files.push({
            path,
            relevance: 1,
          });
          break;
        }
      }
    }

    return files.slice(0, 15);
  }

  /**
   * Получение основных зависимостей проекта
   */
  private getMainDependencies(): ProjectContext['dependencies'] {
    const deps: ProjectContext['dependencies'] = [];
    const entryPoints = ['index', 'main', 'app', 'server'];

    for (const [file, edges] of this.graph.edges) {
      const isEntryPoint = entryPoints.some(ep => file.toLowerCase().includes(ep));

      if (isEntryPoint || edges.length > 5) {
        for (const edge of edges.slice(0, 5)) {
          const target = typeof edge === 'object' && 'target' in edge
            ? (edge as { target: string }).target
            : String(edge);

          deps.push({
            from: file,
            to: target,
            type: 'imports',
          });
        }
      }
    }

    return deps.slice(0, 30);
  }

  /**
   * Поиск файлов по имени
   */
  private searchFiles(entities: string[]): ProjectContext['relevantFiles'] {
    const files: ProjectContext['relevantFiles'] = [];

    for (const path of this.fileContents.keys()) {
      for (const entity of entities) {
        if (path.toLowerCase().includes(entity.toLowerCase())) {
          files.push({
            path,
            relevance: path.toLowerCase() === entity.toLowerCase() ? 1 : 0.5,
          });
          break;
        }
      }
    }

    files.sort((a, b) => b.relevance - a.relevance);
    return files.slice(0, 10);
  }

  /**
   * Поиск проблем в найденных символах
   */
  private findIssuesInSymbols(symbols: SymbolMatch[]): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    for (const symbol of symbols) {
      const content = this.fileContents.get(symbol.file);
      if (!content) continue;

      const lines = content.split('\n');
      const startLine = Math.max(0, symbol.line - 1);
      const endLine = Math.min(lines.length, symbol.line + 50);

      for (let i = startLine; i < endLine; i++) {
        const line = lines[i];

        for (const bugPattern of BUG_PATTERNS) {
          if (bugPattern.pattern.test(line)) {
            issues.push({
              type: bugPattern.type,
              severity: bugPattern.severity,
              file: symbol.file,
              line: i + 1,
              message: bugPattern.message,
              snippet: line.trim().substring(0, 100),
              suggestion: bugPattern.suggestion,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Определение языков в проекте
   */
  private detectLanguages(): string[] {
    const extensions = new Map<string, number>();

    for (const path of this.fileContents.keys()) {
      const ext = path.split('.').pop()?.toLowerCase() || '';
      extensions.set(ext, (extensions.get(ext) || 0) + 1);
    }

    const langMap: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript/React',
      js: 'JavaScript',
      jsx: 'JavaScript/React',
      php: 'PHP',
      py: 'Python',
      vue: 'Vue.js',
      java: 'Java',
      go: 'Go',
      rs: 'Rust',
      rb: 'Ruby',
      cs: 'C#',
    };

    return Array.from(extensions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ext]) => langMap[ext] || ext)
      .filter(Boolean);
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Глубокий анализ связей между символами
   * Находит imports, exports, calls, extends, implements
   */
  private analyzeDeepRelationships(symbols: SymbolMatch[]): ProjectContext['relationships'] {
    const relationships: ProjectContext['relationships'] = [];
    const processedFiles = new Set<string>();

    for (const symbol of symbols) {
      const content = this.fileContents.get(symbol.file);
      if (!content || processedFiles.has(symbol.file)) continue;
      processedFiles.add(symbol.file);

      const lines = content.split('\n');

      // 1. Анализ импортов
      const importPatterns = [
        /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g,
        /const\s+(\w+)\s*=\s*require\s*\(['"]([^'"]+)['"]\)/g,
        /from\s+['"]([^'"]+)['"]\s+import\s+\{([^}]+)\}/g, // Python
      ];

      for (const pattern of importPatterns) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(content)) !== null) {
          const importedSymbols = (match[1] || match[2] || match[3] || '').split(',').map(s => s.trim()).filter(Boolean);
          const targetPath = match[4] || match[2] || match[1] || '';

          for (const importedSymbol of importedSymbols) {
            relationships.push({
              source: symbol.file,
              target: targetPath,
              sourceSymbol: symbol.name,
              targetSymbol: importedSymbol.split(' as ')[0]?.trim(),
              type: 'imports',
            });
          }
        }
      }

      // 2. Анализ exports
      const exportPatterns = [
        /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
        /export\s+\{([^}]+)\}/g,
        /module\.exports\s*=\s*(\w+)/g,
      ];

      for (const pattern of exportPatterns) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(content)) !== null) {
          const exportedSymbols = (match[1] || '').split(',').map(s => s.trim()).filter(Boolean);
          for (const exportedSymbol of exportedSymbols) {
            relationships.push({
              source: symbol.file,
              target: symbol.file,
              sourceSymbol: exportedSymbol,
              type: 'exports',
            });
          }
        }
      }

      // 3. Анализ вызовов функций (calls)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Ищем вызовы функций: functionName( или obj.methodName(
        const callPattern = /(?:^|[^.\w])(\w+)\s*\(/g;
        let match;
        while ((match = callPattern.exec(line)) !== null) {
          const calledName = match[1];
          // Проверяем, есть ли такой символ в проекте
          const calledSymbol = this.symbols.get(calledName);
          if (calledSymbol && calledSymbol.filePath !== symbol.file) {
            relationships.push({
              source: symbol.file,
              target: calledSymbol.filePath,
              sourceSymbol: symbol.name,
              targetSymbol: calledName,
              type: 'calls',
              line: i + 1,
              snippet: line.trim().substring(0, 80),
            });
          }
        }
      }

      // 4. Анализ наследования (extends, implements)
      const inheritancePatterns = [
        /class\s+(\w+)\s+extends\s+(\w+)/g,
        /class\s+(\w+)\s+implements\s+(\w+)/g,
        /interface\s+(\w+)\s+extends\s+(\w+)/g,
      ];

      for (const pattern of inheritancePatterns) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(content)) !== null) {
          const childClass = match[1];
          const parentClass = match[2];
          const parentSymbol = this.symbols.get(parentClass);

          relationships.push({
            source: symbol.file,
            target: parentSymbol?.filePath || 'external',
            sourceSymbol: childClass,
            targetSymbol: parentClass,
            type: pattern.source.includes('implements') ? 'implements' : 'extends',
          });
        }
      }

      // 5. Анализ использования (uses) - переменные, типы
      for (const [otherName, otherSymbol] of this.symbols) {
        if (otherSymbol.filePath === symbol.file) continue;

        const nameRegex = new RegExp(`\\b${this.escapeRegex(otherName)}\\b`);
        if (nameRegex.test(content)) {
          // Найдём строку где используется
          for (let i = 0; i < lines.length; i++) {
            if (nameRegex.test(lines[i])) {
              relationships.push({
                source: symbol.file,
                target: otherSymbol.filePath,
                sourceSymbol: symbol.name,
                targetSymbol: otherName,
                type: 'uses',
                line: i + 1,
                snippet: lines[i].trim().substring(0, 80),
              });
              break; // Только первое использование
            }
          }
        }
      }
    }

    // Дедупликация и сортировка
    const uniqueRels = new Map<string, ProjectContext['relationships'][0]>();
    for (const rel of relationships) {
      const key = `${rel.source}:${rel.sourceSymbol}:${rel.target}:${rel.targetSymbol}:${rel.type}`;
      if (!uniqueRels.has(key)) {
        uniqueRels.set(key, rel);
      }
    }

    return Array.from(uniqueRels.values()).slice(0, 50);
  }

  /**
   * Предсказание влияния изменений
   * Анализирует, какие файлы будут затронуты при изменении символов
   */
  private predictImpact(symbols: SymbolMatch[]): ProjectContext['impactPrediction'] {
    const impact: ProjectContext['impactPrediction'] = [];
    const affectedFiles = new Map<string, { level: number; reasons: string[]; symbols: string[] }>();

    for (const symbol of symbols) {
      // Level 0: Сам файл (critical)
      this.addAffectedFile(affectedFiles, symbol.file, 0, `Directly contains ${symbol.name}`, symbol.name);

      // Level 1: Файлы, которые импортируют этот символ (high)
      for (const usage of symbol.usedIn) {
        this.addAffectedFile(affectedFiles, usage.file, 1, `Imports/uses ${symbol.name}`, symbol.name);
      }

      // Level 2: Файлы, которые вызывают этот символ (high)
      for (const caller of symbol.calledBy) {
        this.addAffectedFile(affectedFiles, caller, 1, `Calls ${symbol.name}`, symbol.name);
      }

      // Level 3: Ищем транзитивные зависимости (medium/low)
      const transitiveFiles = this.findTransitiveDependents(symbol.file, 3);
      for (const [file, distance] of transitiveFiles) {
        this.addAffectedFile(affectedFiles, file, distance, `Transitive dependency (${distance} hops)`, symbol.name);
      }
    }

    // Конвертируем в массив с уровнями влияния
    for (const [file, data] of affectedFiles) {
      const level = data.level === 0 ? 'critical' :
                    data.level === 1 ? 'high' :
                    data.level === 2 ? 'medium' : 'low';

      impact.push({
        file,
        impactLevel: level,
        reason: data.reasons.join('; '),
        symbols: data.symbols,
      });
    }

    // Сортируем по уровню влияния
    const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    impact.sort((a, b) => levelOrder[a.impactLevel] - levelOrder[b.impactLevel]);

    return impact.slice(0, 30);
  }

  /**
   * Добавляет файл в список затронутых
   */
  private addAffectedFile(
    map: Map<string, { level: number; reasons: string[]; symbols: string[] }>,
    file: string,
    level: number,
    reason: string,
    symbol: string
  ): void {
    const existing = map.get(file);
    if (existing) {
      existing.level = Math.min(existing.level, level);
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      if (!existing.symbols.includes(symbol)) {
        existing.symbols.push(symbol);
      }
    } else {
      map.set(file, { level, reasons: [reason], symbols: [symbol] });
    }
  }

  /**
   * Находит транзитивные зависимости
   */
  private findTransitiveDependents(startFile: string, maxDepth: number): Map<string, number> {
    const visited = new Map<string, number>();
    const queue: Array<[string, number]> = [[startFile, 0]];

    while (queue.length > 0) {
      const [file, depth] = queue.shift()!;

      if (depth > maxDepth || visited.has(file)) continue;
      visited.set(file, depth);

      // Ищем файлы, которые импортируют текущий
      for (const [otherFile, content] of this.fileContents) {
        if (visited.has(otherFile)) continue;

        // Простая проверка на импорт
        const fileName = file.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '');
        if (fileName && content.includes(fileName)) {
          queue.push([otherFile, depth + 1]);
        }
      }

      // Используем граф зависимостей
      for (const [from, edges] of this.graph.edges) {
        for (const edge of edges) {
          const target = typeof edge === 'object' && 'to' in edge
            ? (edge as { to: string }).to
            : String(edge);

          if (target === file && !visited.has(from)) {
            queue.push([from, depth + 1]);
          }
        }
      }
    }

    visited.delete(startFile); // Убираем исходный файл
    return visited;
  }

  /**
   * Форматирование контекста для LLM промпта
   */
  formatForLLM(context: ProjectContext): string {
    const parts: string[] = [];

    parts.push(`## Контекст проекта`);
    parts.push(`Языки: ${context.projectStats.languages.join(', ')}`);
    parts.push(`Файлов: ${context.projectStats.totalFiles}, Символов: ${context.projectStats.totalSymbols}`);
    parts.push('');

    if (context.symbols.length > 0) {
      parts.push(`## Найденные символы (${context.symbols.length})`);
      for (const sym of context.symbols.slice(0, 5)) {
        parts.push(`### ${sym.type} ${sym.name}`);
        parts.push(`Файл: ${sym.file}:${sym.line}`);
        parts.push('```');
        parts.push(sym.snippet);
        parts.push('```');
        if (sym.usedIn.length > 0) {
          parts.push(`Используется в: ${sym.usedIn.map(u => `${u.file}:${u.line}`).join(', ')}`);
        }
        parts.push('');
      }
    }

    if (context.issues.length > 0) {
      parts.push(`## Найденные проблемы (${context.issues.length})`);
      for (const issue of context.issues.slice(0, 10)) {
        const icon = issue.severity === 'critical' ? '🔴' :
                     issue.severity === 'high' ? '🟠' :
                     issue.severity === 'medium' ? '🟡' : '🔵';
        parts.push(`${icon} **${issue.message}** (${issue.severity})`);
        parts.push(`   ${issue.file}:${issue.line}`);
        parts.push(`   \`${issue.snippet}\``);
        parts.push(`   💡 ${issue.suggestion}`);
        parts.push('');
      }
    }

    if (context.relevantFiles.length > 0) {
      parts.push(`## Релевантные файлы`);
      for (const file of context.relevantFiles.slice(0, 5)) {
        parts.push(`- ${file.path}`);
      }
      parts.push('');
    }

    if (context.dependencies.length > 0) {
      parts.push(`## Зависимости`);
      for (const dep of context.dependencies.slice(0, 10)) {
        parts.push(`- ${dep.from} → ${dep.to}`);
      }
    }

    return parts.join('\n');
  }
}

/**
 * Создание билдера контекста из данных проекта
 */
export function createContextBuilder(
  symbols: Map<string, Symbol>,
  graph: DependencyGraph,
  fileContents: Map<string, string>,
  projectStats?: Partial<ProjectContext['projectStats']>
): ContextBuilder {
  return new ContextBuilder(symbols, graph, fileContents, projectStats);
}
