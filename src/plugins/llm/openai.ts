/**
 * OpenAI LLM Plugin - Uses openai SDK (optional dependency)
 */

import type { LLMPlugin } from '../types.js';
import type { ChangeImpact } from '../../types/index.js';
import { Logger } from '../../utils/logger.js';

export class OpenAIPlugin implements LLMPlugin {
  name = 'openai';
  private client: unknown = null;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.model = options?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for the OpenAI plugin');
    }

    // Dynamic import to keep openai optional
    this.initClient(apiKey);
  }

  private async initClient(apiKey: string): Promise<void> {
    try {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({ apiKey });
    } catch {
      throw new Error('openai package is not installed. Run: npm install openai');
    }
  }

  async explainImpact(impact: ChangeImpact): Promise<string> {
    const prompt = `Analyze this code change impact and explain it concisely:

Change: ${impact.change.description}
Files: ${impact.change.files.join(', ')}
Affected: ${impact.affectedNodes.length} components
Risks: ${impact.risks.map(r => `${r.severity}: ${r.description}`).join('; ')}

Provide a brief, actionable summary.`;

    return this.chat(prompt);
  }

  async answerQuestion(question: string, context: string): Promise<string> {
    const prompt = `You are a code architecture expert. Answer this question based on the context provided.

Context:
${context}

Question: ${question}`;

    return this.chat(prompt);
  }

  async suggestRefactoring(code: string, goal: string, context?: string): Promise<string> {
    const prompt = `Suggest refactoring for this code:

Goal: ${goal}
${context ? `Context: ${context}\n` : ''}
Code:
${code}

Provide specific, actionable refactoring suggestions.`;

    return this.chat(prompt);
  }

  private async chat(prompt: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openai = this.client as any;
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a code architecture analysis assistant. Be concise and actionable.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || 'No response generated';
    } catch (error) {
      Logger.error(`OpenAI plugin error: ${error}`);
      throw error;
    }
  }

  /**
   * Check if OpenAI is configured
   */
  static isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }
}
