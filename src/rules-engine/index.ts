/**
 * Architecture Rules Engine
 *
 * Определение и проверка архитектурных правил:
 * - Запрет импортов между слоями
 * - Циклические зависимости
 * - Naming conventions
 * - Layer boundaries
 */

import { DependencyGraph, Symbol, SymbolKind } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export type RuleType =
  | 'no-import'           // Запрет импорта A -> B
  | 'must-import'         // Обязательный импорт
  | 'no-circular'         // Запрет циклических зависимостей
  | 'layer-boundary'      // Границы слоёв
  | 'naming-convention'   // Соглашения об именовании
  | 'max-dependencies'    // Макс. количество зависимостей
  | 'max-file-size'       // Макс. размер файла
  | 'max-function-length' // Макс. длина функции
  | 'no-god-class'        // Запрет God Object
  | 'single-responsibility'; // Single Responsibility Principle

export type RuleSeverity = 'error' | 'warning' | 'info';

export interface ArchitectureRule {
  id: string;
  name: string;
  description: string;
  type: RuleType;
  severity: RuleSeverity;
  enabled: boolean;
  config: RuleConfig;
}

export interface RuleConfig {
  // no-import
  sourcePattern?: string;   // Regex для source
  targetPattern?: string;   // Regex для target

  // layer-boundary
  layers?: LayerDefinition[];

  // naming-convention
  pattern?: string;
  filePattern?: string;

  // max-*
  maxValue?: number;

  // custom
  customCheck?: string;     // Имя кастомной функции
}

export interface LayerDefinition {
  name: string;
  pattern: string;          // Regex для файлов слоя
  allowedDependencies: string[]; // Разрешённые зависимости
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  message: string;
  file: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface RulesCheckResult {
  passed: boolean;
  violations: RuleViolation[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
}

// Предустановленные правила
export const DEFAULT_RULES: ArchitectureRule[] = [
  {
    id: 'no-circular-deps',
    name: 'No Circular Dependencies',
    description: 'Запрет циклических зависимостей между модулями',
    type: 'no-circular',
    severity: 'error',
    enabled: true,
    config: {}
  },
  {
    id: 'layer-boundary-clean',
    name: 'Clean Architecture Layers',
    description: 'Проверка границ слоёв Clean Architecture',
    type: 'layer-boundary',
    severity: 'error',
    enabled: false,
    config: {
      layers: [
        { name: 'domain', pattern: '(domain|entities)', allowedDependencies: [] },
        { name: 'application', pattern: '(application|usecases|services)', allowedDependencies: ['domain'] },
        { name: 'infrastructure', pattern: '(infrastructure|adapters)', allowedDependencies: ['domain', 'application'] },
        { name: 'presentation', pattern: '(presentation|controllers|views)', allowedDependencies: ['domain', 'application'] }
      ]
    }
  },
  {
    id: 'no-utils-in-domain',
    name: 'No Utils in Domain',
    description: 'Domain не должен импортировать utils',
    type: 'no-import',
    severity: 'warning',
    enabled: true,
    config: {
      sourcePattern: 'domain',
      targetPattern: 'utils'
    }
  },
  {
    id: 'max-dependencies-10',
    name: 'Max 10 Dependencies',
    description: 'Файл не должен иметь более 10 зависимостей',
    type: 'max-dependencies',
    severity: 'warning',
    enabled: true,
    config: {
      maxValue: 10
    }
  },
  {
    id: 'max-file-size-500',
    name: 'Max 500 Lines',
    description: 'Файл не должен превышать 500 строк',
    type: 'max-file-size',
    severity: 'warning',
    enabled: true,
    config: {
      maxValue: 500
    }
  },
  {
    id: 'max-function-length-50',
    name: 'Max 50 Lines per Function',
    description: 'Функция не должна превышать 50 строк',
    type: 'max-function-length',
    severity: 'warning',
    enabled: true,
    config: {
      maxValue: 50
    }
  },
  {
    id: 'no-god-class-20',
    name: 'No God Class',
    description: 'Класс не должен иметь более 20 методов',
    type: 'no-god-class',
    severity: 'warning',
    enabled: true,
    config: {
      maxValue: 20
    }
  },
  {
    id: 'component-naming',
    name: 'Component Naming Convention',
    description: 'React компоненты должны быть в PascalCase',
    type: 'naming-convention',
    severity: 'info',
    enabled: false,
    config: {
      filePattern: '\\.tsx$',
      pattern: '^[A-Z][a-zA-Z0-9]*$'
    }
  }
];

export class RulesEngine {
  private rules: Map<string, ArchitectureRule> = new Map();

  constructor(customRules?: ArchitectureRule[]) {
    // Загружаем дефолтные правила
    DEFAULT_RULES.forEach(rule => this.rules.set(rule.id, rule));

    // Добавляем кастомные
    if (customRules) {
      customRules.forEach(rule => this.rules.set(rule.id, rule));
    }
  }

  /**
   * Добавить или обновить правило
   */
  addRule(rule: ArchitectureRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Удалить правило
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Включить/выключить правило
   */
  toggleRule(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Получить все правила
   */
  getRules(): ArchitectureRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Получить включённые правила
   */
  getEnabledRules(): ArchitectureRule[] {
    return this.getRules().filter(r => r.enabled);
  }

  /**
   * Проверить проект на соответствие правилам
   */
  async check(
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    fileContents: Map<string, string>
  ): Promise<RulesCheckResult> {
    const violations: RuleViolation[] = [];
    const enabledRules = this.getEnabledRules();

    Logger.progress(`Checking ${enabledRules.length} architecture rules...`);

    for (const rule of enabledRules) {
      const ruleViolations = await this.checkRule(rule, graph, symbols, fileContents);
      violations.push(...ruleViolations);
    }

    const summary = {
      total: violations.length,
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warning').length,
      infos: violations.filter(v => v.severity === 'info').length
    };

    const passed = summary.errors === 0;

    if (passed) {
      Logger.success(`All architecture rules passed (${summary.warnings} warnings)`);
    } else {
      Logger.error(`Architecture rules check failed: ${summary.errors} errors, ${summary.warnings} warnings`);
    }

    return { passed, violations, summary };
  }

  /**
   * Проверить одно правило
   */
  private async checkRule(
    rule: ArchitectureRule,
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    fileContents: Map<string, string>
  ): Promise<RuleViolation[]> {
    switch (rule.type) {
      case 'no-circular':
        return this.checkNoCircular(rule, graph);
      case 'no-import':
        return this.checkNoImport(rule, graph);
      case 'layer-boundary':
        return this.checkLayerBoundary(rule, graph);
      case 'max-dependencies':
        return this.checkMaxDependencies(rule, graph);
      case 'max-file-size':
        return this.checkMaxFileSize(rule, fileContents);
      case 'max-function-length':
        return this.checkMaxFunctionLength(rule, symbols);
      case 'no-god-class':
        return this.checkNoGodClass(rule, symbols);
      case 'naming-convention':
        return this.checkNamingConvention(rule, symbols, fileContents);
      default:
        return [];
    }
  }

  /**
   * Проверка на циклические зависимости
   */
  private checkNoCircular(rule: ArchitectureRule, graph: DependencyGraph): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const edges = graph.edges.get(nodeId) || [];
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          dfs(edge.to, [...path]);
        } else if (recursionStack.has(edge.to)) {
          // Нашли цикл
          const cycleStart = path.indexOf(edge.to);
          const cycle = path.slice(cycleStart);
          cycle.push(edge.to);
          cycles.push(cycle);
        }
      }

      recursionStack.delete(nodeId);
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    // Убираем дубликаты циклов
    const uniqueCycles = new Set<string>();
    for (const cycle of cycles) {
      const normalized = [...cycle].sort().join(' -> ');
      if (!uniqueCycles.has(normalized)) {
        uniqueCycles.add(normalized);

        const node = graph.nodes.get(cycle[0]);
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Circular dependency detected: ${cycle.join(' -> ')}`,
          file: node?.filePath || cycle[0],
          suggestion: 'Рассмотрите введение интерфейса или перенос общего кода в отдельный модуль'
        });
      }
    }

    return violations;
  }

  /**
   * Проверка запрета импорта
   */
  private checkNoImport(rule: ArchitectureRule, graph: DependencyGraph): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const { sourcePattern, targetPattern } = rule.config;

    if (!sourcePattern || !targetPattern) return violations;

    const sourceRegex = new RegExp(sourcePattern, 'i');
    const targetRegex = new RegExp(targetPattern, 'i');

    for (const [nodeId, edges] of graph.edges) {
      const sourceNode = graph.nodes.get(nodeId);
      if (!sourceNode || !sourceRegex.test(sourceNode.filePath)) continue;

      for (const edge of edges) {
        const targetNode = graph.nodes.get(edge.to);
        if (targetNode && targetRegex.test(targetNode.filePath)) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Forbidden import: ${sourceNode.filePath} -> ${targetNode.filePath}`,
            file: sourceNode.filePath,
            suggestion: `Перенесите необходимую логику или используйте dependency injection`
          });
        }
      }
    }

    return violations;
  }

  /**
   * Проверка границ слоёв
   */
  private checkLayerBoundary(rule: ArchitectureRule, graph: DependencyGraph): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const { layers } = rule.config;

    if (!layers) return violations;

    // Определяем слой для каждого файла
    const getLayer = (filePath: string): LayerDefinition | undefined => {
      return layers.find(layer => new RegExp(layer.pattern, 'i').test(filePath));
    };

    for (const [nodeId, edges] of graph.edges) {
      const sourceNode = graph.nodes.get(nodeId);
      if (!sourceNode) continue;

      const sourceLayer = getLayer(sourceNode.filePath);
      if (!sourceLayer) continue;

      for (const edge of edges) {
        const targetNode = graph.nodes.get(edge.to);
        if (!targetNode) continue;

        const targetLayer = getLayer(targetNode.filePath);
        if (!targetLayer) continue;

        // Проверяем, разрешена ли зависимость
        if (
          sourceLayer.name !== targetLayer.name &&
          !sourceLayer.allowedDependencies.includes(targetLayer.name)
        ) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Layer violation: ${sourceLayer.name} -> ${targetLayer.name} (${sourceNode.filePath} -> ${targetNode.filePath})`,
            file: sourceNode.filePath,
            suggestion: `Слой "${sourceLayer.name}" не должен зависеть от "${targetLayer.name}". Разрешено: ${sourceLayer.allowedDependencies.join(', ') || 'ничего'}`
          });
        }
      }
    }

    return violations;
  }

  /**
   * Проверка максимального количества зависимостей
   */
  private checkMaxDependencies(rule: ArchitectureRule, graph: DependencyGraph): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxDeps = rule.config.maxValue || 10;

    for (const [nodeId, edges] of graph.edges) {
      if (edges.length > maxDeps) {
        const node = graph.nodes.get(nodeId);
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Too many dependencies: ${edges.length} (max: ${maxDeps})`,
          file: node?.filePath || nodeId,
          suggestion: 'Рассмотрите разделение модуля на более мелкие части или использование фасада'
        });
      }
    }

    return violations;
  }

  /**
   * Проверка максимального размера файла
   */
  private checkMaxFileSize(
    rule: ArchitectureRule,
    fileContents: Map<string, string>
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxLines = rule.config.maxValue || 500;

    for (const [filePath, content] of fileContents) {
      const lines = content.split('\n').length;
      if (lines > maxLines) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `File too large: ${lines} lines (max: ${maxLines})`,
          file: filePath,
          suggestion: 'Разделите файл на несколько модулей по функциональности'
        });
      }
    }

    return violations;
  }

  /**
   * Проверка максимальной длины функции
   */
  private checkMaxFunctionLength(
    rule: ArchitectureRule,
    symbols: Map<string, Symbol>
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxLines = rule.config.maxValue || 50;

    for (const [, symbol] of symbols) {
      if (symbol.kind === SymbolKind.Function) {
        const lines = symbol.location.endLine - symbol.location.startLine;
        if (lines > maxLines) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Function "${symbol.name}" too long: ${lines} lines (max: ${maxLines})`,
            file: symbol.location.filePath,
            line: symbol.location.startLine,
            suggestion: 'Разбейте функцию на более мелкие, каждая с одной ответственностью'
          });
        }
      }
    }

    return violations;
  }

  /**
   * Проверка на God Class
   */
  private checkNoGodClass(
    rule: ArchitectureRule,
    symbols: Map<string, Symbol>
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxMethods = rule.config.maxValue || 20;

    // Группируем методы по классам (по файлу)
    const classMethods = new Map<string, number>();

    for (const [, symbol] of symbols) {
      if (symbol.kind === SymbolKind.Class) {
        classMethods.set(symbol.name, 0);
      }
    }

    // Count functions per file as approximation
    for (const [, symbol] of symbols) {
      if (symbol.kind === SymbolKind.Function) {
        // Approximate: count functions in same file as a class
        for (const [className] of classMethods) {
          const classSymbol = Array.from(symbols.values()).find(
            s => s.kind === SymbolKind.Class && s.name === className
          );
          if (classSymbol && symbol.location.filePath === classSymbol.location.filePath) {
            classMethods.set(className, (classMethods.get(className) || 0) + 1);
          }
        }
      }
    }

    for (const [className, methodCount] of classMethods) {
      if (methodCount > maxMethods) {
        const classSymbol = Array.from(symbols.values()).find(
          s => s.kind === SymbolKind.Class && s.name === className
        );
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `God Class detected: "${className}" has ${methodCount} methods (max: ${maxMethods})`,
          file: classSymbol?.location.filePath || '',
          line: classSymbol?.location.startLine,
          suggestion: 'Разделите класс на несколько классов, каждый с чёткой ответственностью'
        });
      }
    }

    return violations;
  }

  /**
   * Проверка соглашений об именовании
   */
  private checkNamingConvention(
    rule: ArchitectureRule,
    symbols: Map<string, Symbol>,
    _fileContents: Map<string, string>
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const { pattern, filePattern } = rule.config;

    if (!pattern) return violations;

    const nameRegex = new RegExp(pattern);
    const fileRegex = filePattern ? new RegExp(filePattern) : null;

    for (const [, symbol] of symbols) {
      // Пропускаем если файл не соответствует паттерну
      if (fileRegex && !fileRegex.test(symbol.location.filePath)) continue;

      // Проверяем только экспортируемые символы
      if (!symbol.exports) continue;

      if (!nameRegex.test(symbol.name)) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Naming violation: "${symbol.name}" doesn't match pattern ${pattern}`,
          file: symbol.location.filePath,
          line: symbol.location.startLine,
          suggestion: `Переименуйте в соответствии с паттерном: ${pattern}`
        });
      }
    }

    return violations;
  }

  /**
   * Экспорт правил в JSON
   */
  exportRules(): string {
    return JSON.stringify(this.getRules(), null, 2);
  }

  /**
   * Импорт правил из JSON
   */
  importRules(json: string): void {
    try {
      const rules = JSON.parse(json) as ArchitectureRule[];
      rules.forEach(rule => this.rules.set(rule.id, rule));
    } catch (error) {
      Logger.error('Failed to import rules:', error);
    }
  }
}
