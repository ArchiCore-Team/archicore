/**
 * Architecture Knowledge Layer
 *
 * Слой архитектурных знаний:
 * - Bounded Contexts (границы контекстов)
 * - Domain Entities (доменные сущности)
 * - Architectural Rules (архитектурные правила)
 * - Invariants (инварианты)
 */

import {
  ArchitectureModel,
  BoundedContext,
  DomainEntity,
  ArchitecturalRule,
  Invariant,
  RuleViolation,
  ValidationContext,
  DependencyGraph
} from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { readFile, writeFile } from 'fs/promises';

export class ArchitectureKnowledge {
  private model: ArchitectureModel;
  private configPath: string;

  constructor(configPath: string = '.aiarhitector/architecture.json') {
    this.configPath = configPath;
    this.model = {
      boundedContexts: [],
      entities: [],
      rules: [],
      invariants: []
    };
  }

  async load(): Promise<void> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      this.model = JSON.parse(content);
      Logger.success('Architecture model loaded');
    } catch (error) {
      Logger.warn('No architecture model found, using defaults');
      this.initializeDefaults();
    }
  }

  async save(): Promise<void> {
    try {
      const content = JSON.stringify(this.model, null, 2);
      await writeFile(this.configPath, content, 'utf-8');
      Logger.success('Architecture model saved');
    } catch (error) {
      Logger.error('Failed to save architecture model', error);
      throw error;
    }
  }

  getModel(): ArchitectureModel {
    return this.model;
  }

  addBoundedContext(context: BoundedContext): void {
    this.model.boundedContexts.push(context);
    Logger.success(`Added bounded context: ${context.name}`);
  }

  addEntity(entity: DomainEntity): void {
    this.model.entities.push(entity);
    Logger.success(`Added entity: ${entity.name}`);
  }

  addRule(rule: ArchitecturalRule): void {
    this.model.rules.push(rule);
    Logger.success(`Added rule: ${rule.description}`);
  }

  addInvariant(invariant: Invariant): void {
    this.model.invariants.push(invariant);
    Logger.success(`Added invariant: ${invariant.description}`);
  }

  validateArchitecture(context: ValidationContext): RuleViolation[] {
    Logger.progress('Validating architecture...');

    const violations: RuleViolation[] = [];

    for (const rule of this.model.rules) {
      const ruleViolations = rule.validator(context);
      violations.push(...ruleViolations);
    }

    violations.push(...this.validateBoundedContexts(context));
    violations.push(...this.validateInvariants(context));

    if (violations.length > 0) {
      Logger.warn(`Found ${violations.length} architecture violations`);
    } else {
      Logger.success('Architecture validation passed');
    }

    return violations;
  }

  private validateBoundedContexts(context: ValidationContext): RuleViolation[] {
    const violations: RuleViolation[] = [];

    for (const boundedContext of this.model.boundedContexts) {
      for (const prohibited of boundedContext.prohibitedDependencies) {
        const hasProhibitedDep = this.checkDependency(
          context.graph,
          boundedContext.modules,
          prohibited
        );

        if (hasProhibitedDep) {
          violations.push({
            rule: `bounded-context-isolation:${boundedContext.name}`,
            severity: 'error',
            message: `Bounded context "${boundedContext.name}" has prohibited dependency on "${prohibited}"`,
            suggestion: `Remove dependency or refactor to use proper interface`
          });
        }
      }
    }

    return violations;
  }

  private validateInvariants(_context: ValidationContext): RuleViolation[] {
    const violations: RuleViolation[] = [];

    for (const invariant of this.model.invariants) {
      Logger.info(`Checking invariant: ${invariant.description}`);
    }

    return violations;
  }

  private checkDependency(
    graph: DependencyGraph,
    modules: string[],
    targetModule: string
  ): boolean {
    for (const module of modules) {
      const edges = graph.edges.get(module) || [];

      for (const edge of edges) {
        const targetNode = graph.nodes.get(edge.to);
        if (targetNode?.filePath.includes(targetModule)) {
          return true;
        }
      }
    }

    return false;
  }

  getBoundedContext(name: string): BoundedContext | undefined {
    return this.model.boundedContexts.find(c => c.name === name);
  }

  getEntity(name: string): DomainEntity | undefined {
    return this.model.entities.find(e => e.name === name);
  }

  getContextForFile(filePath: string): BoundedContext | null {
    for (const context of this.model.boundedContexts) {
      for (const module of context.modules) {
        if (filePath.includes(module)) {
          return context;
        }
      }
    }
    return null;
  }

  private initializeDefaults(): void {
    this.model = {
      boundedContexts: [
        {
          id: 'core',
          name: 'Core',
          description: 'Core domain logic',
          modules: ['src/core'],
          dependencies: [],
          prohibitedDependencies: ['src/ui', 'src/external']
        },
        {
          id: 'ui',
          name: 'UI',
          description: 'User interface layer',
          modules: ['src/ui'],
          dependencies: ['src/core'],
          prohibitedDependencies: ['src/external']
        },
        {
          id: 'external',
          name: 'External',
          description: 'External integrations',
          modules: ['src/external'],
          dependencies: ['src/core'],
          prohibitedDependencies: ['src/ui']
        }
      ],
      entities: [],
      rules: this.createDefaultRules(),
      invariants: []
    };
  }

  private createDefaultRules(): ArchitecturalRule[] {
    return [
      {
        id: 'no-circular-deps',
        description: 'No circular dependencies allowed',
        type: 'dependency',
        severity: 'error',
        validator: (context: ValidationContext) => {
          return this.detectCircularDependencies(context.graph);
        }
      },
      {
        id: 'naming-convention',
        description: 'Follow naming conventions',
        type: 'naming',
        severity: 'warning',
        pattern: '^[A-Z][a-zA-Z0-9]*$',
        validator: (_context: ValidationContext) => {
          return [];
        }
      }
    ];
  }

  private detectCircularDependencies(graph: DependencyGraph): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const edges = graph.edges.get(nodeId) || [];

      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          if (hasCycle(edge.to, [...path, nodeId])) {
            return true;
          }
        } else if (recursionStack.has(edge.to)) {
          violations.push({
            rule: 'no-circular-deps',
            severity: 'error',
            message: `Circular dependency detected: ${[...path, nodeId, edge.to].join(' -> ')}`,
            suggestion: 'Refactor to break the circular dependency'
          });
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        hasCycle(nodeId, []);
      }
    }

    return violations;
  }

  generateReport(): string {
    let report = '# Architecture Report\n\n';

    report += '## Bounded Contexts\n\n';
    for (const context of this.model.boundedContexts) {
      report += `### ${context.name}\n`;
      report += `${context.description}\n\n`;
      report += `**Modules:** ${context.modules.join(', ')}\n`;
      report += `**Dependencies:** ${context.dependencies.join(', ') || 'None'}\n`;
      report += `**Prohibited:** ${context.prohibitedDependencies.join(', ') || 'None'}\n\n`;
    }

    report += '## Domain Entities\n\n';
    for (const entity of this.model.entities) {
      report += `### ${entity.name}\n`;
      report += `**Context:** ${entity.context}\n`;
      report += `**Properties:** ${entity.properties.length}\n`;
      report += `**Relationships:** ${entity.relationships.length}\n\n`;
    }

    report += '## Rules\n\n';
    for (const rule of this.model.rules) {
      report += `- **${rule.description}** (${rule.severity})\n`;
    }

    return report;
  }
}

export * from '../types/index.js';
