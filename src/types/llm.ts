/**
 * ArchiCore OSS - LLM Plugin Types
 * Separated from core types for optional LLM plugin support
 */

import type {
  DependencyGraph,
  SemanticSearchResult,
  ArchitectureModel,
  Change,
  ProjectMetadata,
} from './index.js';

export interface LLMConfig {
  provider: 'openai' | 'ollama' | 'anthropic';
  model: string;
  temperature: number;
  maxTokens: number;
  baseURL?: string;
}

export interface LLMPrompt {
  system: string;
  user: string;
  context?: LLMContext;
}

export interface LLMContext {
  codeIndex?: Partial<DependencyGraph>;
  semanticMemory?: SemanticSearchResult[];
  architecture?: Partial<ArchitectureModel>;
  recentChanges?: Change[];
  language?: 'en' | 'ru';
  projectMetadata?: ProjectMetadata;
  smartContext?: {
    intent: string;
    query: string;
    symbols: Array<{
      name: string;
      type: string;
      file: string;
      line: number;
      snippet: string;
      usedIn: Array<{ file: string; line: number; snippet: string }>;
      calls: string[];
      calledBy: string[];
      confidence: number;
    }>;
    relevantFiles: Array<{
      path: string;
      relevance: number;
      snippet?: string;
    }>;
    issues: Array<{
      type: 'bug' | 'warning' | 'smell' | 'security';
      severity: 'critical' | 'high' | 'medium' | 'low';
      file: string;
      line: number;
      message: string;
      snippet: string;
      suggestion: string;
    }>;
    dependencies: Array<{
      from: string;
      to: string;
      type: string;
    }>;
    relationships?: Array<{
      source: string;
      target: string;
      sourceSymbol?: string;
      targetSymbol?: string;
      type: 'imports' | 'exports' | 'calls' | 'references' | 'extends' | 'implements' | 'uses';
      line?: number;
      snippet?: string;
    }>;
    impactPrediction?: Array<{
      file: string;
      impactLevel: 'critical' | 'high' | 'medium' | 'low';
      reason: string;
      symbols: string[];
    }>;
    projectStats: {
      totalFiles: number;
      totalSymbols: number;
      languages: string[];
      framework?: string;
    };
    allFiles?: string[];
  };
}

export interface LLMResponse {
  content: string;
  metadata: {
    tokensUsed: number;
    model: string;
    timestamp: number;
  };
}
