/**
 * Change Impact Engine
 *
 * Анализ влияния изменений на кодовую базу:
 * - Определение затронутых компонентов
 * - Оценка рисков
 * - Генерация рекомендаций
 * - Построение графа влияния
 */

import {
  ChangeImpact,
  Change,
  AffectedNode,
  Risk,
  Recommendation,
  ImpactGraph,
  ImpactNode,
  DependencyGraph,
  Symbol,
  ArchitectureModel
} from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class ImpactEngine {
  analyzeChange(
    change: Change,
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    architecture?: ArchitectureModel
  ): ChangeImpact {
    Logger.progress(`Analyzing impact of change: ${change.description}`);

    const affectedNodes = this.findAffectedNodes(change, graph, symbols);
    const risks = this.assessRisks(change, affectedNodes, architecture);
    const recommendations = this.generateRecommendations(change, affectedNodes, risks);
    const impactGraph = this.buildImpactGraph(change, affectedNodes, graph);

    Logger.success(`Impact analysis complete: ${affectedNodes.length} nodes affected`);

    return {
      change,
      affectedNodes,
      risks,
      recommendations,
      impactGraph
    };
  }

  private findAffectedNodes(
    change: Change,
    graph: DependencyGraph,
    symbols: Map<string, Symbol>
  ): AffectedNode[] {
    const affected: AffectedNode[] = [];
    const visited = new Set<string>();

    const changedNodes = this.getChangedNodes(change, graph, symbols);

    for (const nodeId of changedNodes) {
      this.traverseDependents(nodeId, graph, affected, visited, 0);
    }

    affected.sort((a, b) => {
      const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return levelOrder[a.impactLevel] - levelOrder[b.impactLevel];
    });

    return affected;
  }

  private getChangedNodes(
    change: Change,
    graph: DependencyGraph,
    symbols: Map<string, Symbol>
  ): Set<string> {
    const nodes = new Set<string>();

    for (const file of change.files) {
      const node = graph.nodes.get(file);
      if (node) {
        nodes.add(node.id);
      }
    }

    for (const symbolName of change.symbols) {
      for (const symbol of symbols.values()) {
        if (symbol.name === symbolName) {
          nodes.add(symbol.id);
        }
      }
    }

    return nodes;
  }

  private traverseDependents(
    nodeId: string,
    graph: DependencyGraph,
    affected: AffectedNode[],
    visited: Set<string>,
    distance: number,
    maxDistance: number = 5
  ): void {
    if (visited.has(nodeId) || distance > maxDistance) {
      return;
    }

    visited.add(nodeId);
    const node = graph.nodes.get(nodeId);

    if (!node) return;

    const impactLevel = this.calculateImpactLevel(distance, node.type);

    affected.push({
      id: nodeId,
      name: node.name,
      type: node.type,
      filePath: node.filePath,
      impactLevel,
      reason: this.generateImpactReason(distance, node.type),
      distance
    });

    const dependents = this.findDependents(nodeId, graph);

    for (const dependent of dependents) {
      this.traverseDependents(dependent, graph, affected, visited, distance + 1, maxDistance);
    }
  }

  private findDependents(nodeId: string, graph: DependencyGraph): string[] {
    const dependents: string[] = [];

    for (const [from, edges] of graph.edges) {
      for (const edge of edges) {
        if (edge.to === nodeId) {
          dependents.push(from);
        }
      }
    }

    return dependents;
  }

  private calculateImpactLevel(
    distance: number,
    nodeType: string
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (distance === 0) return 'critical';
    if (distance === 1 && nodeType === 'file') return 'high';
    if (distance === 1) return 'high';
    if (distance === 2) return 'medium';
    return 'low';
  }

  private generateImpactReason(distance: number, _nodeType: string): string {
    if (distance === 0) return 'Directly modified';
    if (distance === 1) return 'Direct dependency';
    if (distance === 2) return 'Indirect dependency (2 levels)';
    return `Indirect dependency (${distance} levels)`;
  }

  private assessRisks(
    change: Change,
    affectedNodes: AffectedNode[],
    _architecture?: ArchitectureModel
  ): Risk[] {
    const risks: Risk[] = [];

    const criticalNodes = affectedNodes.filter(n => n.impactLevel === 'critical');
    const highImpactNodes = affectedNodes.filter(n => n.impactLevel === 'high');

    if (criticalNodes.length > 10) {
      risks.push({
        id: 'wide-impact',
        severity: 'high',
        category: 'breaking_change',
        description: `Change affects ${criticalNodes.length} critical components`,
        affectedComponents: criticalNodes.map(n => n.name),
        mitigation: 'Consider breaking into smaller changes'
      });
    }

    if (change.type === 'delete') {
      risks.push({
        id: 'deletion-risk',
        severity: 'critical',
        category: 'breaking_change',
        description: 'Deletion may break dependent components',
        affectedComponents: affectedNodes.map(n => n.name),
        mitigation: 'Ensure all dependencies are updated or removed'
      });
    }

    if (change.type === 'modify' && highImpactNodes.length > 0) {
      risks.push({
        id: 'api-change',
        severity: 'high',
        category: 'compatibility',
        description: 'Modification may break API contracts',
        affectedComponents: highImpactNodes.map(n => n.name),
        mitigation: 'Review and update all API consumers'
      });
    }

    const coreFiles = affectedNodes.filter(n =>
      n.filePath.includes('/core/') || n.filePath.includes('/kernel/')
    );

    if (coreFiles.length > 0) {
      risks.push({
        id: 'core-system-risk',
        severity: 'critical',
        category: 'breaking_change',
        description: 'Change affects core system components',
        affectedComponents: coreFiles.map(n => n.name),
        mitigation: 'Thorough testing required, consider staged rollout'
      });
    }

    return risks;
  }

  private generateRecommendations(
    change: Change,
    affectedNodes: AffectedNode[],
    risks: Risk[]
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    recommendations.push({
      type: 'review',
      priority: 'critical',
      description: 'Review all affected components',
      details: `${affectedNodes.length} components will be affected by this change`
    });

    const criticalNodes = affectedNodes.filter(n => n.impactLevel === 'critical');
    if (criticalNodes.length > 0) {
      recommendations.push({
        type: 'test',
        priority: 'critical',
        description: 'Test critical components',
        details: `Focus on: ${criticalNodes.slice(0, 5).map(n => n.name).join(', ')}`
      });
    }

    const highRisks = risks.filter(r => r.severity === 'critical' || r.severity === 'high');
    if (highRisks.length > 0) {
      recommendations.push({
        type: 'check',
        priority: 'critical',
        description: 'Address high-severity risks',
        details: highRisks.map(r => r.description).join('; ')
      });
    }

    if (affectedNodes.some(n => n.filePath.includes('test'))) {
      recommendations.push({
        type: 'test',
        priority: 'high',
        description: 'Update affected tests',
        details: 'Test files detected in affected nodes'
      });
    }

    if (change.type === 'refactor') {
      recommendations.push({
        type: 'refactor',
        priority: 'medium',
        description: 'Consider incremental refactoring',
        details: 'Break into smaller, safer changes'
      });
    }

    return recommendations;
  }

  private buildImpactGraph(
    _change: Change,
    affectedNodes: AffectedNode[],
    graph: DependencyGraph
  ): ImpactGraph {
    const impactGraph: ImpactGraph = {
      nodes: new Map(),
      edges: []
    };

    for (const affected of affectedNodes) {
      const node: ImpactNode = {
        id: affected.id,
        name: affected.name,
        impactLevel: affected.impactLevel,
        metadata: {
          type: affected.type,
          filePath: affected.filePath,
          distance: affected.distance,
          reason: affected.reason
        }
      };

      impactGraph.nodes.set(affected.id, node);
    }

    for (const affected of affectedNodes) {
      const edges = graph.edges.get(affected.id) || [];

      for (const edge of edges) {
        if (impactGraph.nodes.has(edge.to)) {
          impactGraph.edges.push({
            from: affected.id,
            to: edge.to,
            reason: `Depends on via ${edge.type}`
          });
        }
      }
    }

    return impactGraph;
  }

  generateReport(impact: ChangeImpact): string {
    let report = `# Impact Analysis: ${impact.change.description}\n\n`;

    report += `## Summary\n\n`;
    report += `- **Change Type:** ${impact.change.type}\n`;
    report += `- **Affected Files:** ${impact.change.files.length}\n`;
    report += `- **Affected Components:** ${impact.affectedNodes.length}\n`;
    report += `- **Risks Identified:** ${impact.risks.length}\n\n`;

    report += `## Affected Components\n\n`;
    const byLevel = this.groupByImpactLevel(impact.affectedNodes);

    for (const [level, nodes] of Object.entries(byLevel)) {
      if (nodes.length > 0) {
        report += `### ${level.toUpperCase()} Impact (${nodes.length})\n\n`;
        for (const node of nodes.slice(0, 10)) {
          report += `- **${node.name}** (${node.filePath})\n`;
          report += `  - ${node.reason}\n`;
        }
        if (nodes.length > 10) {
          report += `\n... and ${nodes.length - 10} more\n`;
        }
        report += '\n';
      }
    }

    report += `## Risks\n\n`;
    for (const risk of impact.risks) {
      report += `### ${risk.severity.toUpperCase()}: ${risk.description}\n`;
      report += `**Category:** ${risk.category}\n`;
      if (risk.mitigation) {
        report += `**Mitigation:** ${risk.mitigation}\n`;
      }
      report += '\n';
    }

    report += `## Recommendations\n\n`;
    for (const rec of impact.recommendations) {
      report += `- **[${rec.priority.toUpperCase()}]** ${rec.description}\n`;
      if (rec.details) {
        report += `  ${rec.details}\n`;
      }
    }

    return report;
  }

  private groupByImpactLevel(nodes: AffectedNode[]): Record<string, AffectedNode[]> {
    return {
      critical: nodes.filter(n => n.impactLevel === 'critical'),
      high: nodes.filter(n => n.impactLevel === 'high'),
      medium: nodes.filter(n => n.impactLevel === 'medium'),
      low: nodes.filter(n => n.impactLevel === 'low')
    };
  }
}
