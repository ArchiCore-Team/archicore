/**
 * Neo4j Client - Connection wrapper with in-memory fallback
 */

import { Logger } from '../utils/logger.js';

// Dynamic import for neo4j-driver (optional dependency)
let neo4j: typeof import('neo4j-driver') | null = null;
try {
  neo4j = await import('neo4j-driver');
} catch {
  Logger.debug('neo4j-driver not available, using in-memory graph fallback');
}

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
}

type Neo4jDriver = ReturnType<typeof import('neo4j-driver')['default']['driver']> | null;
type Neo4jSession = ReturnType<NonNullable<Neo4jDriver>['session']>;

export class Neo4jClient {
  private driver: Neo4jDriver = null;
  private config: Neo4jConfig;
  private _connected = false;

  constructor(config?: Partial<Neo4jConfig>) {
    this.config = {
      uri: config?.uri || process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: config?.username || process.env.NEO4J_USERNAME || 'neo4j',
      password: config?.password || process.env.NEO4J_PASSWORD || 'password',
    };
  }

  async connect(): Promise<boolean> {
    if (!neo4j) {
      Logger.debug('Neo4j driver not installed. Using in-memory graph.');
      return false;
    }

    // Only attempt connection if explicitly configured via env
    if (!process.env.NEO4J_URI) {
      Logger.debug('Neo4j not configured (set NEO4J_URI to enable). Using in-memory graph.');
      return false;
    }

    try {
      this.driver = neo4j.default.driver(
        this.config.uri,
        neo4j.default.auth.basic(this.config.username, this.config.password)
      );
      await this.driver.verifyConnectivity();
      this._connected = true;
      Logger.info(`Connected to Neo4j at ${this.config.uri}`);
      return true;
    } catch (error) {
      Logger.warn(`Failed to connect to Neo4j: ${error}. Using in-memory graph fallback.`);
      this.driver = null;
      this._connected = false;
      return false;
    }
  }

  get connected(): boolean {
    return this._connected;
  }

  session(): Neo4jSession | null {
    if (!this.driver) return null;
    return this.driver.session();
  }

  async run(cypher: string, params?: Record<string, unknown>): Promise<unknown[]> {
    const session = this.session();
    if (!session) return [];

    try {
      const result = await session.run(cypher, params);
      return result.records.map(r => r.toObject());
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this._connected = false;
    }
  }
}
