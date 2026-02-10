/**
 * Graph Module - barrel export + factory
 */

export { Neo4jClient } from './neo4j-client.js';
export type { Neo4jConfig } from './neo4j-client.js';
export { GraphStore } from './graph-store.js';
export { GraphQueries } from './graph-queries.js';
export type { QueryResult } from './graph-queries.js';

import { Neo4jClient } from './neo4j-client.js';
import { GraphStore } from './graph-store.js';
import { GraphQueries } from './graph-queries.js';
import type { Neo4jConfig } from './neo4j-client.js';

export interface GraphModule {
  client: Neo4jClient;
  store: GraphStore;
  queries: GraphQueries;
}

/**
 * Create a complete graph module (client + store + queries)
 * Attempts Neo4j connection, falls back to in-memory
 */
export async function createGraphStore(config?: Partial<Neo4jConfig>): Promise<GraphModule> {
  const client = new Neo4jClient(config);
  await client.connect();

  const store = new GraphStore(client);
  const queries = new GraphQueries(client, store);

  return { client, store, queries };
}
