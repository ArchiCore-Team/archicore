/**
 * Graph Store - Syncs DependencyGraph to Neo4j (or in-memory fallback)
 */

import type { DependencyGraph, GraphNode, GraphEdge, Symbol } from '../types/index.js';
import { Neo4jClient } from './neo4j-client.js';
import { Logger } from '../utils/logger.js';

export class GraphStore {
  private client: Neo4jClient;
  // In-memory fallback
  private memNodes = new Map<string, GraphNode>();
  private memEdges = new Map<string, GraphEdge[]>();
  private memSymbols = new Map<string, Symbol>();

  constructor(client: Neo4jClient) {
    this.client = client;
  }

  get isNeo4j(): boolean {
    return this.client.connected;
  }

  /**
   * Sync a DependencyGraph and symbols to the store
   */
  async syncGraph(graph: DependencyGraph, symbols?: Symbol[]): Promise<void> {
    if (this.client.connected) {
      await this.syncToNeo4j(graph, symbols);
    } else {
      this.syncToMemory(graph, symbols);
    }
  }

  private async syncToNeo4j(graph: DependencyGraph, symbols?: Symbol[]): Promise<void> {
    const session = this.client.session();
    if (!session) return;

    try {
      const tx = session.beginTransaction();

      // Create file nodes
      const fileNodes = Array.from(graph.nodes.values()).filter(n => n.type === 'file');
      if (fileNodes.length > 0) {
        await tx.run(
          `UNWIND $nodes AS node
           MERGE (f:File {id: node.id})
           SET f.filePath = node.filePath,
               f.name = node.name,
               f.linesOfCode = node.metadata.linesOfCode,
               f.complexity = node.metadata.complexity,
               f.domain = node.metadata.domain`,
          { nodes: fileNodes.map(n => ({ ...n, metadata: n.metadata || {} })) }
        );
      }

      // Create symbol nodes
      if (symbols && symbols.length > 0) {
        await tx.run(
          `UNWIND $symbols AS sym
           MERGE (s:Symbol {id: sym.id})
           SET s.name = sym.name,
               s.kind = sym.kind,
               s.filePath = sym.filePath,
               s.exported = sym.exports`,
          { symbols }
        );
      }

      // Create edges
      for (const [, edges] of graph.edges) {
        if (edges.length === 0) continue;

        const edgeTypeMap: Record<string, string> = {
          'import': 'IMPORTS',
          'call': 'CALLS',
          'inheritance': 'EXTENDS',
          'composition': 'IMPLEMENTS',
          'uses': 'USES',
          'data_flow': 'DATA_FLOW',
        };

        for (const edge of edges) {
          const relType = edgeTypeMap[edge.type] || 'RELATES_TO';
          await tx.run(
            `MATCH (a {id: $from}), (b {id: $to})
             MERGE (a)-[r:${relType}]->(b)
             SET r.weight = $weight`,
            { from: edge.from, to: edge.to, weight: edge.weight }
          );
        }
      }

      await tx.commit();
      Logger.info(`Synced ${graph.nodes.size} nodes and ${this.countEdges(graph)} edges to Neo4j`);
    } catch (error) {
      Logger.error(`Failed to sync graph to Neo4j: ${error}`);
    } finally {
      await session.close();
    }
  }

  private syncToMemory(graph: DependencyGraph, symbols?: Symbol[]): void {
    this.memNodes = new Map(graph.nodes);
    this.memEdges = new Map(graph.edges);
    if (symbols) {
      for (const sym of symbols) {
        this.memSymbols.set(sym.id, sym);
      }
    }
    Logger.debug(`Synced ${graph.nodes.size} nodes to in-memory graph`);
  }

  /**
   * Clear all graph data
   */
  async clearGraph(): Promise<void> {
    if (this.client.connected) {
      await this.client.run('MATCH (n) DETACH DELETE n');
    }
    this.memNodes.clear();
    this.memEdges.clear();
    this.memSymbols.clear();
  }

  /**
   * Incremental sync - only update changed files
   */
  async incrementalSync(
    changedFiles: string[],
    graph: DependencyGraph,
    symbols?: Symbol[]
  ): Promise<void> {
    if (this.client.connected) {
      // Delete old nodes for changed files
      await this.client.run(
        `UNWIND $files AS filePath
         MATCH (n {filePath: filePath})
         DETACH DELETE n`,
        { files: changedFiles }
      );
    } else {
      // In-memory: remove changed file entries
      for (const file of changedFiles) {
        for (const [id, node] of this.memNodes) {
          if (node.filePath === file) {
            this.memNodes.delete(id);
            this.memEdges.delete(id);
          }
        }
      }
    }

    // Re-sync the changed parts
    await this.syncGraph(graph, symbols);
  }

  /**
   * Get the in-memory graph (for query fallback)
   */
  getInMemoryGraph(): DependencyGraph {
    return { nodes: this.memNodes, edges: this.memEdges };
  }

  getInMemorySymbols(): Symbol[] {
    return Array.from(this.memSymbols.values());
  }

  private countEdges(graph: DependencyGraph): number {
    let count = 0;
    for (const edges of graph.edges.values()) {
      count += edges.length;
    }
    return count;
  }
}
