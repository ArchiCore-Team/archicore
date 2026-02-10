/**
 * Code Metrics Module
 *
 * Вычисление метрик качества кода:
 * - Цикломатическая сложность
 * - Когнитивная сложность
 * - Связанность (Coupling)
 * - Связность (Cohesion)
 * - Maintainability Index
 * - Lines of Code метрики
 */

import { DependencyGraph, Symbol, ASTNode, SymbolKind } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface FileMetrics {
  filePath: string;
  loc: LOCMetrics;
  complexity: ComplexityMetrics;
  coupling: CouplingMetrics;
  maintainability: number; // 0-100
  issues: MetricIssue[];
}

export interface LOCMetrics {
  total: number;        // Всего строк
  code: number;         // Строк кода
  comments: number;     // Строк комментариев
  blank: number;        // Пустых строк
  ratio: number;        // Отношение комментариев к коду
}

export interface ComplexityMetrics {
  cyclomatic: number;   // Цикломатическая сложность
  cognitive: number;    // Когнитивная сложность
  halstead: HalsteadMetrics;
  maxNesting: number;   // Максимальная вложенность
  avgFunctionComplexity: number;
}

export interface HalsteadMetrics {
  vocabulary: number;   // n = n1 + n2
  length: number;       // N = N1 + N2
  volume: number;       // V = N * log2(n)
  difficulty: number;   // D = (n1/2) * (N2/n2)
  effort: number;       // E = D * V
  time: number;         // T = E / 18 (секунды)
  bugs: number;         // B = V / 3000
}

export interface CouplingMetrics {
  afferentCoupling: number;  // Ca - входящие зависимости
  efferentCoupling: number;  // Ce - исходящие зависимости
  instability: number;       // I = Ce / (Ca + Ce)
  abstractness: number;      // A = абстрактные / все
  distance: number;          // D = |A + I - 1|
}

export interface MetricIssue {
  type: 'complexity' | 'coupling' | 'size' | 'maintainability';
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

export interface ProjectMetrics {
  summary: ProjectSummary;
  files: FileMetrics[];
  hotspots: Hotspot[];
}

export interface ProjectSummary {
  totalFiles: number;
  totalLOC: number;
  avgComplexity: number;
  avgMaintainability: number;
  avgCoupling: number;
  technicalDebtHours: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface Hotspot {
  filePath: string;
  score: number;        // 0-100, выше = хуже
  reasons: string[];
}

export class MetricsCalculator {
  private readonly COMPLEXITY_THRESHOLD = 10;
  private readonly COGNITIVE_THRESHOLD = 15;
  private readonly COUPLING_THRESHOLD = 10;
  private readonly LOC_THRESHOLD = 500;
  private readonly NESTING_THRESHOLD = 4;

  /**
   * Вычислить метрики для всего проекта
   */
  async calculateProjectMetrics(
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    fileContents: Map<string, string>,
    asts: Map<string, ASTNode>
  ): Promise<ProjectMetrics> {
    Logger.progress('Calculating code metrics...');

    const fileMetrics: FileMetrics[] = [];

    for (const [filePath, content] of fileContents) {
      const ast = asts.get(filePath);
      const metrics = this.calculateFileMetrics(filePath, content, ast, graph, symbols);
      fileMetrics.push(metrics);
    }

    const summary = this.calculateSummary(fileMetrics);
    const hotspots = this.identifyHotspots(fileMetrics);

    Logger.success(`Metrics calculated for ${fileMetrics.length} files`);

    return {
      summary,
      files: fileMetrics,
      hotspots
    };
  }

  /**
   * Вычислить метрики для одного файла
   */
  calculateFileMetrics(
    filePath: string,
    content: string,
    ast: ASTNode | undefined,
    graph: DependencyGraph,
    symbols: Map<string, Symbol>
  ): FileMetrics {
    const loc = this.calculateLOC(content);
    const complexity = this.calculateComplexity(content, ast, symbols, filePath);
    const coupling = this.calculateCoupling(filePath, graph);
    const maintainability = this.calculateMaintainability(loc, complexity, coupling);
    const issues = this.identifyIssues(loc, complexity, coupling, maintainability);

    return {
      filePath,
      loc,
      complexity,
      coupling,
      maintainability,
      issues
    };
  }

  /**
   * Подсчёт строк кода
   */
  private calculateLOC(content: string): LOCMetrics {
    const lines = content.split('\n');
    let code = 0;
    let comments = 0;
    let blank = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '') {
        blank++;
        continue;
      }

      // Block comments
      if (trimmed.startsWith('/*')) {
        inBlockComment = true;
        comments++;
        if (trimmed.endsWith('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        comments++;
        if (trimmed.endsWith('*/') || trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      // Line comments
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        comments++;
        continue;
      }

      code++;
    }

    return {
      total: lines.length,
      code,
      comments,
      blank,
      ratio: code > 0 ? comments / code : 0
    };
  }

  /**
   * Вычисление сложности
   */
  private calculateComplexity(
    content: string,
    _ast: ASTNode | undefined,
    symbols: Map<string, Symbol>,
    filePath: string
  ): ComplexityMetrics {
    // Цикломатическая сложность
    const cyclomatic = this.calculateCyclomaticComplexity(content);

    // Когнитивная сложность
    const cognitive = this.calculateCognitiveComplexity(content);

    // Halstead метрики
    const halstead = this.calculateHalsteadMetrics(content);

    // Максимальная вложенность
    const maxNesting = this.calculateMaxNesting(content);

    // Средняя сложность функций
    const fileFunctions = Array.from(symbols.values()).filter(
      s => (s.kind === SymbolKind.Function) && s.location.filePath === filePath
    );
    const avgFunctionComplexity = fileFunctions.length > 0
      ? cyclomatic / fileFunctions.length
      : cyclomatic;

    return {
      cyclomatic,
      cognitive,
      halstead,
      maxNesting,
      avgFunctionComplexity
    };
  }

  /**
   * Цикломатическая сложность (McCabe)
   */
  private calculateCyclomaticComplexity(content: string): number {
    let complexity = 1; // Базовая сложность

    // Ключевые слова, увеличивающие сложность
    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b\?\s*[^:]+\s*:/g,  // Тернарный оператор
      /&&/g,
      /\|\|/g,
      /\?\?/g  // Nullish coalescing
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Когнитивная сложность (SonarSource)
   */
  private calculateCognitiveComplexity(content: string): number {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Увеличиваем вложенность
      if (trimmed.match(/\b(if|for|while|switch|try)\b.*{/)) {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
      // else if добавляет только 1
      else if (trimmed.match(/\belse\s+if\b/)) {
        complexity += 1;
      }
      // else добавляет 1
      else if (trimmed.match(/\belse\b.*{/)) {
        complexity += 1;
      }
      // catch добавляет 1 + вложенность
      else if (trimmed.match(/\bcatch\b/)) {
        complexity += 1 + nestingLevel;
      }
      // Логические операторы в условиях
      else if (trimmed.match(/(&&|\|\|)/)) {
        complexity += (trimmed.match(/(&&|\|\|)/g) || []).length;
      }
      // break/continue с меткой
      else if (trimmed.match(/\b(break|continue)\s+\w+/)) {
        complexity += 1;
      }
      // Рекурсия (упрощённо)
      else if (trimmed.match(/\bfunction\s+(\w+).*\1\s*\(/)) {
        complexity += 1;
      }

      // Закрытие блока
      if (trimmed.includes('}') && nestingLevel > 0) {
        nestingLevel--;
      }
    }

    return complexity;
  }

  /**
   * Halstead метрики
   */
  private calculateHalsteadMetrics(content: string): HalsteadMetrics {
    // Операторы
    const operators = new Set<string>();
    const operatorCounts: Record<string, number> = {};
    const operatorPatterns = [
      '+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==',
      '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^',
      '~', '<<', '>>', '>>>', '++', '--', '+=', '-=', '*=',
      '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=',
      '?', ':', '=>', '...', '.', '?.', '??'
    ];

    // Операнды (идентификаторы и литералы)
    const operands = new Set<string>();
    const operandCounts: Record<string, number> = {};

    // Подсчёт операторов
    for (const op of operatorPatterns) {
      const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = content.match(new RegExp(escaped, 'g'));
      if (matches && matches.length > 0) {
        operators.add(op);
        operatorCounts[op] = matches.length;
      }
    }

    // Подсчёт операндов (идентификаторы)
    const identifierMatches = content.match(/\b[a-zA-Z_]\w*\b/g) || [];
    for (const id of identifierMatches) {
      // Исключаем ключевые слова
      const keywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
        'continue', 'return', 'function', 'class', 'const', 'let', 'var', 'new',
        'this', 'true', 'false', 'null', 'undefined', 'typeof', 'instanceof',
        'import', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally',
        'throw', 'extends', 'implements', 'interface', 'type', 'enum', 'public',
        'private', 'protected', 'static', 'readonly'];

      if (!keywords.includes(id)) {
        operands.add(id);
        operandCounts[id] = (operandCounts[id] || 0) + 1;
      }
    }

    const n1 = operators.size;                                    // Уникальные операторы
    const n2 = operands.size;                                     // Уникальные операнды
    const N1 = Object.values(operatorCounts).reduce((a, b) => a + b, 0); // Всего операторов
    const N2 = Object.values(operandCounts).reduce((a, b) => a + b, 0);  // Всего операндов

    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const volume = length * Math.log2(Math.max(vocabulary, 1));
    const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
    const effort = difficulty * volume;
    const time = effort / 18;
    const bugs = volume / 3000;

    return {
      vocabulary,
      length,
      volume: Math.round(volume * 100) / 100,
      difficulty: Math.round(difficulty * 100) / 100,
      effort: Math.round(effort * 100) / 100,
      time: Math.round(time * 100) / 100,
      bugs: Math.round(bugs * 1000) / 1000
    };
  }

  /**
   * Максимальная вложенность
   */
  private calculateMaxNesting(content: string): number {
    let maxNesting = 0;
    let currentNesting = 0;

    for (const char of content) {
      if (char === '{') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}') {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }

    return maxNesting;
  }

  /**
   * Вычисление связанности
   */
  private calculateCoupling(filePath: string, graph: DependencyGraph): CouplingMetrics {
    // Находим node для файла
    let nodeId = '';
    for (const [id, node] of graph.nodes) {
      if (node.filePath === filePath) {
        nodeId = id;
        break;
      }
    }

    if (!nodeId) {
      return {
        afferentCoupling: 0,
        efferentCoupling: 0,
        instability: 0.5,
        abstractness: 0,
        distance: 0.5
      };
    }

    // Efferent (исходящие)
    const efferent = (graph.edges.get(nodeId) || []).length;

    // Afferent (входящие)
    let afferent = 0;
    for (const [, edges] of graph.edges) {
      for (const edge of edges) {
        if (edge.to === nodeId) {
          afferent++;
        }
      }
    }

    const total = afferent + efferent;
    const instability = total > 0 ? efferent / total : 0.5;

    // Abstractness (упрощённо - соотношение интерфейсов/абстрактных классов)
    const abstractness = 0; // TODO: вычислять из символов

    const distance = Math.abs(abstractness + instability - 1);

    return {
      afferentCoupling: afferent,
      efferentCoupling: efferent,
      instability: Math.round(instability * 100) / 100,
      abstractness,
      distance: Math.round(distance * 100) / 100
    };
  }

  /**
   * Индекс поддерживаемости (Maintainability Index)
   * Формула Microsoft: MI = MAX(0, (171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(LOC)) * 100 / 171)
   */
  private calculateMaintainability(
    loc: LOCMetrics,
    complexity: ComplexityMetrics,
    _coupling: CouplingMetrics
  ): number {
    const V = complexity.halstead.volume || 1;
    const G = complexity.cyclomatic;
    const LOC = Math.max(loc.code, 1);

    let mi = 171 - 5.2 * Math.log(V) - 0.23 * G - 16.2 * Math.log(LOC);

    // Учитываем комментарии (бонус)
    const commentRatio = loc.ratio;
    mi = mi + 50 * Math.sin(Math.sqrt(2.4 * commentRatio));

    // Нормализуем 0-100
    mi = Math.max(0, Math.min(100, mi * 100 / 171));

    return Math.round(mi);
  }

  /**
   * Выявление проблем
   */
  private identifyIssues(
    loc: LOCMetrics,
    complexity: ComplexityMetrics,
    coupling: CouplingMetrics,
    maintainability: number
  ): MetricIssue[] {
    const issues: MetricIssue[] = [];

    // Проблемы сложности
    if (complexity.cyclomatic > this.COMPLEXITY_THRESHOLD * 2) {
      issues.push({
        type: 'complexity',
        severity: 'high',
        message: `Very high cyclomatic complexity: ${complexity.cyclomatic}`,
        suggestion: 'Разбейте на несколько функций, упростите условия'
      });
    } else if (complexity.cyclomatic > this.COMPLEXITY_THRESHOLD) {
      issues.push({
        type: 'complexity',
        severity: 'medium',
        message: `High cyclomatic complexity: ${complexity.cyclomatic}`,
        suggestion: 'Рассмотрите рефакторинг сложных условий'
      });
    }

    if (complexity.cognitive > this.COGNITIVE_THRESHOLD * 2) {
      issues.push({
        type: 'complexity',
        severity: 'high',
        message: `Very high cognitive complexity: ${complexity.cognitive}`,
        suggestion: 'Упростите логику, избегайте глубокой вложенности'
      });
    } else if (complexity.cognitive > this.COGNITIVE_THRESHOLD) {
      issues.push({
        type: 'complexity',
        severity: 'medium',
        message: `High cognitive complexity: ${complexity.cognitive}`,
        suggestion: 'Уменьшите вложенность, используйте early returns'
      });
    }

    if (complexity.maxNesting > this.NESTING_THRESHOLD) {
      issues.push({
        type: 'complexity',
        severity: complexity.maxNesting > 6 ? 'high' : 'medium',
        message: `Deep nesting: ${complexity.maxNesting} levels`,
        suggestion: 'Используйте guard clauses и early returns'
      });
    }

    // Проблемы размера
    if (loc.code > this.LOC_THRESHOLD * 2) {
      issues.push({
        type: 'size',
        severity: 'high',
        message: `Very large file: ${loc.code} lines`,
        suggestion: 'Разделите файл на модули по функциональности'
      });
    } else if (loc.code > this.LOC_THRESHOLD) {
      issues.push({
        type: 'size',
        severity: 'medium',
        message: `Large file: ${loc.code} lines`,
        suggestion: 'Рассмотрите разделение на несколько файлов'
      });
    }

    // Проблемы связанности
    if (coupling.efferentCoupling > this.COUPLING_THRESHOLD * 2) {
      issues.push({
        type: 'coupling',
        severity: 'high',
        message: `Very high coupling: ${coupling.efferentCoupling} dependencies`,
        suggestion: 'Используйте dependency injection, создайте фасад'
      });
    } else if (coupling.efferentCoupling > this.COUPLING_THRESHOLD) {
      issues.push({
        type: 'coupling',
        severity: 'medium',
        message: `High coupling: ${coupling.efferentCoupling} dependencies`,
        suggestion: 'Уменьшите количество зависимостей'
      });
    }

    // Maintainability
    if (maintainability < 20) {
      issues.push({
        type: 'maintainability',
        severity: 'high',
        message: `Very low maintainability: ${maintainability}`,
        suggestion: 'Требуется серьёзный рефакторинг'
      });
    } else if (maintainability < 40) {
      issues.push({
        type: 'maintainability',
        severity: 'medium',
        message: `Low maintainability: ${maintainability}`,
        suggestion: 'Добавьте комментарии, упростите логику'
      });
    }

    return issues;
  }

  /**
   * Сводка по проекту
   */
  private calculateSummary(files: FileMetrics[]): ProjectSummary {
    const totalFiles = files.length;
    const totalLOC = files.reduce((sum, f) => sum + f.loc.code, 0);
    const avgComplexity = files.length > 0
      ? files.reduce((sum, f) => sum + f.complexity.cyclomatic, 0) / files.length
      : 0;
    const avgMaintainability = files.length > 0
      ? files.reduce((sum, f) => sum + f.maintainability, 0) / files.length
      : 100;
    const avgCoupling = files.length > 0
      ? files.reduce((sum, f) => sum + f.coupling.efferentCoupling, 0) / files.length
      : 0;

    // Технический долг (упрощённо: 30 мин на каждую проблему высокой важности)
    const highIssues = files.reduce(
      (sum, f) => sum + f.issues.filter(i => i.severity === 'high').length,
      0
    );
    const mediumIssues = files.reduce(
      (sum, f) => sum + f.issues.filter(i => i.severity === 'medium').length,
      0
    );
    const technicalDebtHours = (highIssues * 0.5 + mediumIssues * 0.25);

    // Оценка
    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (avgMaintainability >= 80 && avgComplexity <= 5) {
      grade = 'A';
    } else if (avgMaintainability >= 60 && avgComplexity <= 10) {
      grade = 'B';
    } else if (avgMaintainability >= 40 && avgComplexity <= 15) {
      grade = 'C';
    } else if (avgMaintainability >= 20) {
      grade = 'D';
    } else {
      grade = 'F';
    }

    return {
      totalFiles,
      totalLOC,
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      avgMaintainability: Math.round(avgMaintainability),
      avgCoupling: Math.round(avgCoupling * 10) / 10,
      technicalDebtHours: Math.round(technicalDebtHours * 10) / 10,
      grade
    };
  }

  /**
   * Определение "горячих точек"
   * Score 0-100 using logarithmic scaling for better distribution
   */
  private identifyHotspots(files: FileMetrics[]): Hotspot[] {
    const hotspots: Hotspot[] = [];

    for (const file of files) {
      const reasons: string[] = [];
      let score = 0;

      // Сложность (max 30 points, log scale)
      if (file.complexity.cyclomatic > this.COMPLEXITY_THRESHOLD) {
        const complexityScore = Math.min(30, Math.log2(file.complexity.cyclomatic / this.COMPLEXITY_THRESHOLD) * 15);
        score += complexityScore;
        reasons.push(`High complexity (${file.complexity.cyclomatic})`);
      }

      // Размер (max 25 points, log scale)
      if (file.loc.code > this.LOC_THRESHOLD) {
        const sizeScore = Math.min(25, Math.log2(file.loc.code / this.LOC_THRESHOLD) * 10);
        score += sizeScore;
        reasons.push(`Large file (${file.loc.code} LOC)`);
      }

      // Связанность (max 20 points)
      if (file.coupling.efferentCoupling > this.COUPLING_THRESHOLD) {
        const couplingScore = Math.min(20, (file.coupling.efferentCoupling - this.COUPLING_THRESHOLD) * 2);
        score += couplingScore;
        reasons.push(`High coupling (${file.coupling.efferentCoupling})`);
      }

      // Maintainability (max 25 points, inverted)
      if (file.maintainability < 40) {
        const maintScore = Math.min(25, (40 - file.maintainability) * 0.625);
        score += maintScore;
        reasons.push(`Low maintainability (${file.maintainability})`);
      }

      if (reasons.length > 0) {
        hotspots.push({
          filePath: file.filePath,
          score: Math.round(score), // No longer need Math.min(100) as max is ~100
          reasons
        });
      }
    }

    // Сортируем по score и берём топ-20
    return hotspots.sort((a, b) => b.score - a.score).slice(0, 20);
  }
}
