/**
 * BM25 Okapi Algorithm - Zero-dependency code search
 */

// BM25 parameters
const K1 = 1.5;
const B = 0.75;

// Code-specific stop words
const CODE_STOP_WORDS = new Set([
  'const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for',
  'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'true',
  'false', 'null', 'undefined', 'import', 'export', 'from', 'default', 'async',
  'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'void',
  'delete', 'in', 'of', 'with', 'yield', 'static', 'public', 'private',
  'protected', 'interface', 'type', 'enum', 'extends', 'implements', 'super',
  'abstract', 'readonly', 'override', 'declare', 'module', 'namespace',
  'require', 'def', 'self', 'none', 'pass', 'lambda', 'print', 'raise',
  'except', 'elif', 'and', 'or', 'not', 'is', 'as',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'it', 'that', 'this', 'these',
]);

/**
 * Tokenize code text - handles camelCase, snake_case, and normal words
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // Split on whitespace and punctuation
  const rawTokens = text.split(/[\s\(\)\{\}\[\]<>,:;=+\-*/&|!?@#$%^~`"'\\]+/);

  for (const raw of rawTokens) {
    if (!raw || raw.length < 2) continue;

    // Split camelCase: "myFunctionName" -> ["my", "function", "name"]
    const camelParts = raw.replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/\s+/);

    for (const part of camelParts) {
      // Split snake_case
      const snakeParts = part.split('_');
      for (const sp of snakeParts) {
        const lower = sp.toLowerCase();
        if (lower.length >= 2 && !CODE_STOP_WORDS.has(lower) && !/^\d+$/.test(lower)) {
          tokens.push(lower);
        }
      }
    }

    // Also keep the original token (lowered) for exact matches
    const originalLower = raw.toLowerCase();
    if (originalLower.length >= 2 && !CODE_STOP_WORDS.has(originalLower)) {
      tokens.push(originalLower);
    }
  }

  return tokens;
}

export interface BM25Document {
  id: string;
  tokens: string[];
  length: number;
}

export interface BM25SearchResult {
  id: string;
  score: number;
}

export class BM25Index {
  private documents: Map<string, BM25Document> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private docFrequency: Map<string, number> = new Map();
  private avgDocLength = 0;

  /**
   * Add a document to the index
   */
  addDocument(id: string, text: string): void {
    const tokens = tokenize(text);
    const doc: BM25Document = { id, tokens, length: tokens.length };
    this.documents.set(id, doc);

    // Update inverted index
    const seen = new Set<string>();
    for (const token of tokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)!.add(id);

      if (!seen.has(token)) {
        seen.add(token);
        this.docFrequency.set(token, (this.docFrequency.get(token) || 0) + 1);
      }
    }

    // Update average document length
    let totalLength = 0;
    for (const d of this.documents.values()) {
      totalLength += d.length;
    }
    this.avgDocLength = totalLength / this.documents.size;
  }

  /**
   * Remove a document from the index
   */
  removeDocument(id: string): void {
    const doc = this.documents.get(id);
    if (!doc) return;

    const seen = new Set<string>();
    for (const token of doc.tokens) {
      this.invertedIndex.get(token)?.delete(id);
      if (!seen.has(token)) {
        seen.add(token);
        const freq = this.docFrequency.get(token) || 1;
        if (freq <= 1) {
          this.docFrequency.delete(token);
        } else {
          this.docFrequency.set(token, freq - 1);
        }
      }
    }

    this.documents.delete(id);

    if (this.documents.size > 0) {
      let totalLength = 0;
      for (const d of this.documents.values()) totalLength += d.length;
      this.avgDocLength = totalLength / this.documents.size;
    } else {
      this.avgDocLength = 0;
    }
  }

  /**
   * Search the index using BM25 scoring
   */
  search(query: string, limit = 20): BM25SearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const N = this.documents.size;
    const scores = new Map<string, number>();

    for (const token of queryTokens) {
      const docIds = this.invertedIndex.get(token);
      if (!docIds) continue;

      const df = this.docFrequency.get(token) || 0;
      // IDF with smoothing
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const docId of docIds) {
        const doc = this.documents.get(docId)!;

        // Term frequency in this document
        let tf = 0;
        for (const t of doc.tokens) {
          if (t === token) tf++;
        }

        // BM25 score
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * (doc.length / this.avgDocLength));
        const score = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  get size(): number {
    return this.documents.size;
  }

  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
    this.docFrequency.clear();
    this.avgDocLength = 0;
  }
}
