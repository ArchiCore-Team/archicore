/**
 * LLM Plugin Interface
 */

import type { ChangeImpact } from '../types/index.js';

export interface LLMPlugin {
  name: string;

  /**
   * Explain an impact analysis result in natural language
   */
  explainImpact(impact: ChangeImpact): Promise<string>;

  /**
   * Answer a question about the codebase given context
   */
  answerQuestion(question: string, context: string): Promise<string>;

  /**
   * Suggest refactoring for given code
   */
  suggestRefactoring(code: string, goal: string, context?: string): Promise<string>;
}
