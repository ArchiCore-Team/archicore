/**
 * Plugin Loader - Detects and loads available LLM plugins
 */

import type { LLMPlugin } from './types.js';
import { Logger } from '../utils/logger.js';

export type { LLMPlugin } from './types.js';

/**
 * Auto-detect and load the best available LLM plugin
 * Priority: OpenAI (if API key set) > Ollama (if running) > null
 */
export async function loadLLMPlugin(): Promise<LLMPlugin | null> {
  // Try OpenAI first (if API key is set)
  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAIPlugin } = await import('./llm/openai.js');
      const plugin = new OpenAIPlugin();
      Logger.info('Loaded OpenAI LLM plugin');
      return plugin;
    } catch (error) {
      Logger.warn(`Failed to load OpenAI plugin: ${error}`);
    }
  }

  // Try Ollama (if running locally)
  try {
    const { OllamaPlugin } = await import('./llm/ollama.js');
    if (await OllamaPlugin.isAvailable()) {
      const plugin = new OllamaPlugin();
      Logger.info('Loaded Ollama LLM plugin');
      return plugin;
    }
  } catch {
    // Ollama not available
  }

  Logger.debug('No LLM plugin loaded (optional - core features work without LLM)');
  return null;
}

/**
 * Load a specific LLM plugin by name
 */
export async function loadPlugin(name: 'openai' | 'ollama', options?: Record<string, string>): Promise<LLMPlugin> {
  switch (name) {
    case 'openai': {
      const { OpenAIPlugin } = await import('./llm/openai.js');
      return new OpenAIPlugin(options);
    }
    case 'ollama': {
      const { OllamaPlugin } = await import('./llm/ollama.js');
      return new OllamaPlugin(options);
    }
    default:
      throw new Error(`Unknown plugin: ${name}`);
  }
}
