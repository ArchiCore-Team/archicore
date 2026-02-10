/**
 * Ollama LLM Plugin - Zero dependencies (uses fetch)
 */

import type { LLMPlugin } from '../types.js';
import type { ChangeImpact } from '../../types/index.js';
import { Logger } from '../../utils/logger.js';

export class OllamaPlugin implements LLMPlugin {
  name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl = options?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = options?.model || process.env.OLLAMA_MODEL || 'llama3.1';
  }

  async explainImpact(impact: ChangeImpact): Promise<string> {
    const prompt = `Analyze this code change impact and explain it concisely:

Change: ${impact.change.description}
Files: ${impact.change.files.join(', ')}
Affected: ${impact.affectedNodes.length} components
Risks: ${impact.risks.map(r => `${r.severity}: ${r.description}`).join('; ')}

Provide a brief, actionable summary.`;

    return this.generate(prompt);
  }

  async answerQuestion(question: string, context: string): Promise<string> {
    const prompt = `You are a code architecture expert. Answer this question based on the context provided.

Context:
${context}

Question: ${question}`;

    return this.generate(prompt);
  }

  async suggestRefactoring(code: string, goal: string, context?: string): Promise<string> {
    const prompt = `Suggest refactoring for this code:

Goal: ${goal}
${context ? `Context: ${context}\n` : ''}
Code:
${code}

Provide specific, actionable refactoring suggestions.`;

    return this.generate(prompt);
  }

  private async generate(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      return data.response;
    } catch (error) {
      Logger.error(`Ollama plugin error: ${error}`);
      throw error;
    }
  }

  /**
   * Check if Ollama is available
   */
  static async isAvailable(baseUrl?: string): Promise<boolean> {
    try {
      const url = baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}
