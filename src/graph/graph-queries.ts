/**
 * Graph Queries - Cypher queries for Neo4j with in-memory fallback
 */

import { Neo4jClient } from './neo4j-client.js';
import { GraphStore } from './graph-store.js';

export interface QueryResult {
  file: string;
  name?: string;
  type?: string;
  depth?: number;
  count?: number;
}

export class GraphQueries {
  private client: Neo4jClient;
  private store: GraphStore;

  constructor(client: Neo4jClient, store: GraphStore) {
    this.client = client;
    this.store = store;
  }

  /**
   * Who depends on this file
   */
  async dependentsOf(file: string): Promise<QueryResult[]> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH (dependent)-[r]->(target:File {filePath: $file})
         RETURN DISTINCT dependent.filePath AS file, dependent.name AS name, type(r) AS type`,
        { file }
      );
      return results as QueryResult[];
    }
    return this.memDependentsOf(file);
  }

  /**
   * What does this file depend on
   */
  async dependenciesOf(file: string): Promise<QueryResult[]> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH (source:File {filePath: $file})-[r]->(dependency)
         RETURN DISTINCT dependency.filePath AS file, dependency.name AS name, type(r) AS type`,
        { file }
      );
      return results as QueryResult[];
    }
    return this.memDependenciesOf(file);
  }

  /**
   * Transitive impact of changing a file
   */
  async impactOf(file: string, maxDepth = 5): Promise<QueryResult[]> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH path = (target:File {filePath: $file})<-[*1..${maxDepth}]-(affected)
         WHERE affected:File
         RETURN DISTINCT affected.filePath AS file, affected.name AS name,
                length(path) AS depth
         ORDER BY depth`,
        { file }
      );
      return results as QueryResult[];
    }
    return this.memImpactOf(file, maxDepth);
  }

  /**
   * Find circular dependencies
   */
  async findCycles(): Promise<Array<{ cycle: string[] }>> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH path = (a:File)-[:IMPORTS*2..6]->(a)
         WITH nodes(path) AS cycleNodes
         WITH [n IN cycleNodes | n.filePath] AS cycle
         RETURN DISTINCT cycle
         LIMIT 50`
      );
      return results as Array<{ cycle: string[] }>;
    }
    return this.memFindCycles();
  }

  /**
   * Shortest path between two files
   */
  async shortestPath(from: string, to: string): Promise<{ path: string[]; length: number } | null> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH (start:File {filePath: $from}), (end:File {filePath: $to}),
               path = shortestPath((start)-[*]-(end))
         RETURN [n IN nodes(path) | n.filePath] AS path, length(path) AS length`,
        { from, to }
      );
      if (results.length > 0) {
        const r = results[0] as { path: string[]; length: number };
        return r;
      }
      return null;
    }
    return this.memShortestPath(from, to);
  }

  /**
   * Files with most dependents (hub files)
   */
  async hubFiles(limit = 10): Promise<Array<{ file: string; dependentCount: number }>> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH (dependent)-[]->(hub:File)
         WITH hub, count(DISTINCT dependent) AS dependentCount
         RETURN hub.filePath AS file, dependentCount
         ORDER BY dependentCount DESC
         LIMIT toInteger($limit)`,
        { limit }
      );
      return results as Array<{ file: string; dependentCount: number }>;
    }
    return this.memHubFiles(limit);
  }

  /**
   * Files with no dependencies (orphans)
   */
  async orphanFiles(): Promise<QueryResult[]> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH (f:File)
         WHERE NOT (f)-[]-()
         RETURN f.filePath AS file, f.name AS name`
      );
      return results as QueryResult[];
    }
    return this.memOrphanFiles();
  }

  /**
   * Graph statistics
   */
  async stats(): Promise<{
    totalNodes: number;
    totalEdges: number;
    fileNodes: number;
    symbolNodes: number;
  }> {
    if (this.client.connected) {
      const results = await this.client.run(
        `MATCH (n)
         OPTIONAL MATCH ()-[r]->()
         RETURN count(DISTINCT n) AS totalNodes,
                count(DISTINCT r) AS totalEdges,
                count(DISTINCT CASE WHEN n:File THEN n END) AS fileNodes,
                count(DISTINCT CASE WHEN n:Symbol THEN n END) AS symbolNodes`
      );
      if (results.length > 0) {
        return results[0] as { totalNodes: number; totalEdges: number; fileNodes: number; symbolNodes: number };
      }
    }

    const graph = this.store.getInMemoryGraph();
    let edgeCount = 0;
    for (const edges of graph.edges.values()) edgeCount += edges.length;
    const fileNodes = Array.from(graph.nodes.values()).filter(n => n.type === 'file').length;

    return {
      totalNodes: graph.nodes.size,
      totalEdges: edgeCount,
      fileNodes,
      symbolNodes: graph.nodes.size - fileNodes,
    };
  }

  // ===== In-memory fallbacks =====

  private memDependentsOf(file: string): QueryResult[] {
    const graph = this.store.getInMemoryGraph();
    const results: QueryResult[] = [];

    for (const [, edges] of graph.edges) {
      for (const edge of edges) {
        if (edge.to === file && edge.from !== file) {
          const node = graph.nodes.get(edge.from);
          results.push({
            file: node?.filePath || edge.from,
            name: node?.name,
            type: edge.type,
          });
        }
      }
    }
    return this.dedup(results);
  }

  private memDependenciesOf(file: string): QueryResult[] {
    const graph = this.store.getInMemoryGraph();
    const edges = graph.edges.get(file) || [];
    return this.dedup(
      edges.map(e => {
        const node = graph.nodes.get(e.to);
        return { file: node?.filePath || e.to, name: node?.name, type: e.type };
      })
    );
  }

  private memImpactOf(file: string, maxDepth: number): QueryResult[] {
    const graph = this.store.getInMemoryGraph();
    const visited = new Set<string>();
    const results: QueryResult[] = [];

    const traverse = (current: string, depth: number) => {
      if (depth > maxDepth || visited.has(current)) return;
      visited.add(current);

      for (const [, edges] of graph.edges) {
        for (const edge of edges) {
          if (edge.to === current && !visited.has(edge.from)) {
            const node = graph.nodes.get(edge.from);
            results.push({
              file: node?.filePath || edge.from,
              name: node?.name,
              depth,
            });
            traverse(edge.from, depth + 1);
          }
        }
      }
    };

    traverse(file, 1);
    return results;
  }

  private memFindCycles(): Array<{ cycle: string[] }> {
    const graph = this.store.getInMemoryGraph();
    const cycles: Array<{ cycle: string[] }> = [];
    const visited = new Set<string>();

    const buildAdjacency = () => {
      const adj = new Map<string, string[]>();
      for (const [, edges] of graph.edges) {
        for (const edge of edges) {
          if (edge.type === 'import') {
            const list = adj.get(edge.from) || [];
            list.push(edge.to);
            adj.set(edge.from, list);
          }
        }
      }
      return adj;
    };

    const adj = buildAdjacency();
    const path: string[] = [];
    const inPath = new Set<string>();

    const dfs = (node: string) => {
      if (inPath.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart >= 0) {
          cycles.push({ cycle: [...path.slice(cycleStart), node] });
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      inPath.add(node);
      path.push(node);

      for (const neighbor of adj.get(node) || []) {
        dfs(neighbor);
        if (cycles.length >= 50) return;
      }

      path.pop();
      inPath.delete(node);
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
        if (cycles.length >= 50) break;
      }
    }

    return cycles;
  }

  private memShortestPath(from: string, to: string): { path: string[]; length: number } | null {
    const graph = this.store.getInMemoryGraph();
    const adj = new Map<string, string[]>();

    for (const [, edges] of graph.edges) {
      for (const edge of edges) {
        const list = adj.get(edge.from) || [];
        list.push(edge.to);
        adj.set(edge.from, list);
        // Bidirectional
        const rList = adj.get(edge.to) || [];
        rList.push(edge.from);
        adj.set(edge.to, rList);
      }
    }

    // BFS
    const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];
    const visited = new Set<string>([from]);

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      if (node === to) {
        return { path, length: path.length - 1 };
      }

      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null;
  }

  private memHubFiles(limit: number): Array<{ file: string; dependentCount: number }> {
    const graph = this.store.getInMemoryGraph();
    const dependentCounts = new Map<string, number>();

    for (const [, edges] of graph.edges) {
      for (const edge of edges) {
        dependentCounts.set(edge.to, (dependentCounts.get(edge.to) || 0) + 1);
      }
    }

    return Array.from(dependentCounts.entries())
      .map(([nodeId, count]) => ({
        file: graph.nodes.get(nodeId)?.filePath || nodeId,
        dependentCount: count,
      }))
      .sort((a, b) => b.dependentCount - a.dependentCount)
      .slice(0, limit);
  }

  private memOrphanFiles(): QueryResult[] {
    const graph = this.store.getInMemoryGraph();
    const connected = new Set<string>();

    for (const [, edges] of graph.edges) {
      for (const edge of edges) {
        connected.add(edge.from);
        connected.add(edge.to);
      }
    }

    return Array.from(graph.nodes.values())
      .filter(n => n.type === 'file' && !connected.has(n.id))
      .map(n => ({ file: n.filePath, name: n.name }));
  }

  private dedup(results: QueryResult[]): QueryResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.file)) return false;
      seen.add(r.file);
      return true;
    });
  }
}
