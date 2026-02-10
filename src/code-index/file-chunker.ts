/**
 * File Chunker
 *
 * Умное разбиение больших файлов на логические части:
 * - По классам/функциям/namespace
 * - С сохранением контекста (импорты, namespace)
 * - Для эффективного семантического поиска
 *
 * Поддерживает нативный C++ chunker для высокой производительности
 * с автоматическим fallback на JS реализацию
 */

import { Logger } from '../utils/logger.js';
import {
  SemanticChunker,
  isChunkerNativeAvailable,
  type ChunkResult,
  type CodeChunk as NativeCodeChunk
} from '../native/index.js';

// Флаг использования нативного модуля
let useNativeChunker = isChunkerNativeAvailable();
let nativeChunker: SemanticChunker | null = null;

// Инициализация нативного chunker
if (useNativeChunker) {
  try {
    nativeChunker = new SemanticChunker({
      maxChunkTokens: 1000,  // ~4000 символов
      overlapTokens: 50,
      respectBoundaries: true,
      includeContext: true
    });
    Logger.info('FileChunker: Using native C++ chunker for high performance');
  } catch (e) {
    useNativeChunker = false;
    Logger.warn('FileChunker: Native chunker init failed, using JS fallback');
  }
} else {
  Logger.info('FileChunker: Using JS fallback chunker');
}

/**
 * Маппинг типов из нативного модуля в FileChunk типы
 */
function mapNativeChunkType(nativeType: string): FileChunk['type'] {
  const typeMap: Record<string, FileChunk['type']> = {
    'function': 'function',
    'class': 'class',
    'interface': 'interface',
    'struct': 'class',
    'enum': 'code',
    'module': 'namespace',
    'import': 'header',
    'export': 'code',
    'comment': 'code',
    'block': 'code',
    'statement': 'code',
    'unknown': 'code'
  };
  return typeMap[nativeType] || 'code';
}

export interface FileChunk {
  id: string;
  filePath: string;
  chunkIndex: number;
  totalChunks: number;
  startLine: number;
  endLine: number;
  type: 'header' | 'namespace' | 'class' | 'function' | 'trait' | 'interface' | 'code';
  name: string;
  content: string;
  context: string; // Импорты, namespace - добавляется к каждому чанку
}

export interface ChunkingOptions {
  maxChunkSize: number;      // Максимальный размер чанка в символах
  minChunkSize: number;      // Минимальный размер (не разбивать маленькие)
  includeContext: boolean;   // Добавлять импорты/namespace к каждому чанку
  language: string;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  maxChunkSize: 4000,
  minChunkSize: 500,
  includeContext: true,
  language: 'unknown'
};

export class FileChunker {
  /**
   * Разбить файл на логические чанки
   * Использует нативный C++ chunker если доступен, иначе JS fallback
   */
  async chunkFile(content: string, filePath: string, options: Partial<ChunkingOptions> = {}): Promise<FileChunk[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Попробовать нативный chunker
    if (useNativeChunker && nativeChunker) {
      try {
        const result = await this.chunkWithNative(content, filePath, opts);
        if (result.length > 0) {
          Logger.debug(`[Native] Chunked ${filePath}: ${content.length} chars -> ${result.length} chunks`);
          return result;
        }
      } catch (e) {
        Logger.warn(`Native chunker failed for ${filePath}, falling back to JS:`, e);
      }
    }

    // JS Fallback
    return this.chunkFileJS(content, filePath, opts);
  }

  /**
   * Синхронная версия для обратной совместимости
   */
  chunkFileSync(content: string, filePath: string, options: Partial<ChunkingOptions> = {}): FileChunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return this.chunkFileJS(content, filePath, opts);
  }

  /**
   * Чанкинг с использованием нативного модуля
   */
  private async chunkWithNative(content: string, filePath: string, opts: ChunkingOptions): Promise<FileChunk[]> {
    if (!nativeChunker) return [];

    const result: ChunkResult = await nativeChunker.chunk(content, opts.language);
    const fileName = filePath.split(/[/\\]/).pop() || 'file';

    return result.chunks.map((chunk: NativeCodeChunk, index: number) => ({
      id: `${filePath}:chunk:${chunk.type}:${chunk.context?.parentName || index}:${chunk.location?.lineStart || index}`,
      filePath,
      chunkIndex: index,
      totalChunks: result.chunks.length,
      startLine: chunk.location?.lineStart || 0,
      endLine: chunk.location?.lineEnd || 0,
      type: mapNativeChunkType(chunk.type),
      name: chunk.context?.parentName || `${fileName} chunk ${index + 1}`,
      content: chunk.content,
      context: chunk.context?.imports?.join('\n') || ''
    }));
  }

  /**
   * JS реализация чанкинга (fallback)
   */
  private chunkFileJS(content: string, filePath: string, opts: ChunkingOptions): FileChunk[] {
    const lines = content.split('\n');

    // Если файл маленький - возвращаем как есть
    if (content.length <= opts.maxChunkSize) {
      return [{
        id: `${filePath}:chunk:0`,
        filePath,
        chunkIndex: 0,
        totalChunks: 1,
        startLine: 0,
        endLine: lines.length - 1,
        type: 'code',
        name: filePath.split(/[/\\]/).pop() || 'file',
        content,
        context: ''
      }];
    }

    // Извлекаем контекст (импорты, namespace, use statements)
    const contextInfo = this.extractContext(lines, opts.language);

    // Находим логические границы (классы, функции и т.д.)
    const boundaries = this.findLogicalBoundaries(lines, opts.language);

    // Создаём чанки
    const chunks = this.createChunks(lines, boundaries, contextInfo, filePath, opts);

    Logger.debug(`[JS] Chunked ${filePath}: ${content.length} chars -> ${chunks.length} chunks`);

    return chunks;
  }

  /**
   * Извлечь контекст файла (импорты, namespace)
   */
  private extractContext(lines: string[], language: string): { context: string; endLine: number } {
    const contextLines: string[] = [];
    let endLine = 0;

    const contextPatterns: Record<string, RegExp[]> = {
      php: [
        /^\s*<\?php/,
        /^\s*namespace\s+/,
        /^\s*use\s+/,
        /^\s*require(_once)?\s+/,
        /^\s*include(_once)?\s+/,
      ],
      typescript: [
        /^\s*import\s+/,
        /^\s*export\s+\{[^}]*\}\s+from/,
        /^\s*\/\/\s*@ts-/,
      ],
      javascript: [
        /^\s*import\s+/,
        /^\s*const\s+\{[^}]*\}\s*=\s*require/,
        /^\s*require\s*\(/,
      ],
      python: [
        /^\s*import\s+/,
        /^\s*from\s+\w+\s+import/,
        /^\s*#.*coding[:=]/,
      ],
      java: [
        /^\s*package\s+/,
        /^\s*import\s+/,
      ],
      csharp: [
        /^\s*using\s+/,
        /^\s*namespace\s+/,
      ],
      go: [
        /^\s*package\s+/,
        /^\s*import\s+/,
      ],
      rust: [
        /^\s*use\s+/,
        /^\s*mod\s+/,
        /^\s*extern\s+crate/,
      ],
      ruby: [
        /^\s*require\s+/,
        /^\s*require_relative\s+/,
        /^\s*include\s+/,
      ]
    };

    const patterns = contextPatterns[language] || [];

    // Собираем все строки импортов/namespace в начале файла
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Пустые строки и комментарии в начале - пропускаем но добавляем
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        if (contextLines.length > 0 || patterns.some(p => p.test(trimmed))) {
          contextLines.push(line);
          endLine = i;
        }
        continue;
      }

      // Проверяем паттерны
      const isContext = patterns.some(p => p.test(trimmed));
      if (isContext) {
        contextLines.push(line);
        endLine = i;
      } else if (contextLines.length > 0) {
        // Достигли конца контекста
        break;
      }
    }

    return {
      context: contextLines.join('\n'),
      endLine
    };
  }

  /**
   * Найти логические границы в файле
   */
  private findLogicalBoundaries(lines: string[], language: string): Array<{
    startLine: number;
    endLine: number;
    type: FileChunk['type'];
    name: string;
  }> {
    const boundaries: Array<{
      startLine: number;
      endLine: number;
      type: FileChunk['type'];
      name: string;
    }> = [];

    // Паттерны для начала блоков
    const blockPatterns: Record<string, Array<{ pattern: RegExp; type: FileChunk['type'] }>> = {
      php: [
        { pattern: /^\s*namespace\s+([\w\\]+)/, type: 'namespace' },
        { pattern: /^\s*(?:final\s+|abstract\s+)?class\s+(\w+)/, type: 'class' },
        { pattern: /^\s*interface\s+(\w+)/, type: 'interface' },
        { pattern: /^\s*trait\s+(\w+)/, type: 'trait' },
        { pattern: /^\s*(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)/, type: 'function' },
      ],
      typescript: [
        { pattern: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, type: 'class' },
        { pattern: /^\s*(?:export\s+)?interface\s+(\w+)/, type: 'interface' },
        { pattern: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: 'function' },
        { pattern: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/, type: 'function' },
      ],
      javascript: [
        { pattern: /^\s*(?:export\s+)?class\s+(\w+)/, type: 'class' },
        { pattern: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: 'function' },
        { pattern: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/, type: 'function' },
      ],
      python: [
        { pattern: /^class\s+(\w+)/, type: 'class' },
        { pattern: /^(?:async\s+)?def\s+(\w+)/, type: 'function' },
      ],
      java: [
        { pattern: /^\s*(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)/, type: 'class' },
        { pattern: /^\s*(?:public|private|protected)?\s*interface\s+(\w+)/, type: 'interface' },
        { pattern: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/, type: 'function' },
      ],
      csharp: [
        { pattern: /^\s*(?:public|private|protected|internal)?\s*(?:partial\s+)?class\s+(\w+)/, type: 'class' },
        { pattern: /^\s*(?:public|private|protected|internal)?\s*interface\s+(\w+)/, type: 'interface' },
      ],
      go: [
        { pattern: /^func\s+(?:\([^)]+\)\s+)?(\w+)/, type: 'function' },
        { pattern: /^type\s+(\w+)\s+struct/, type: 'class' },
        { pattern: /^type\s+(\w+)\s+interface/, type: 'interface' },
      ],
      rust: [
        { pattern: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, type: 'function' },
        { pattern: /^(?:pub\s+)?struct\s+(\w+)/, type: 'class' },
        { pattern: /^(?:pub\s+)?trait\s+(\w+)/, type: 'interface' },
        { pattern: /^impl(?:<[^>]+>)?\s+(\w+)/, type: 'class' },
      ],
      ruby: [
        { pattern: /^\s*class\s+(\w+)/, type: 'class' },
        { pattern: /^\s*module\s+(\w+)/, type: 'namespace' },
        { pattern: /^\s*def\s+(\w+)/, type: 'function' },
      ]
    };

    const patterns = blockPatterns[language] || blockPatterns.javascript || [];

    // Находим все блоки
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const { pattern, type } of patterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1] || 'anonymous';

          // Находим конец блока (по скобкам или отступам)
          const endLine = this.findBlockEnd(lines, i, language);

          boundaries.push({
            startLine: i,
            endLine,
            type,
            name
          });

          // Пропускаем вложенные определения для классов
          if (type === 'class' || type === 'interface' || type === 'trait') {
            i = endLine;
          }
          break;
        }
      }
    }

    return boundaries;
  }

  /**
   * Найти конец блока кода
   */
  private findBlockEnd(lines: string[], startLine: number, language: string): number {
    // Для языков с фигурными скобками
    const braceLanguages = ['php', 'typescript', 'javascript', 'java', 'csharp', 'go', 'rust', 'c', 'cpp'];

    if (braceLanguages.includes(language)) {
      let braceCount = 0;
      let foundFirstBrace = false;

      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];

        // Подсчитываем скобки (упрощённо, не учитываем строки/комментарии)
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            foundFirstBrace = true;
          } else if (char === '}') {
            braceCount--;
          }
        }

        // Блок закрыт
        if (foundFirstBrace && braceCount === 0) {
          return i;
        }
      }
    }

    // Для Python - по отступам
    if (language === 'python') {
      const startIndent = this.getIndent(lines[startLine]);

      for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;

        const indent = this.getIndent(line);
        if (indent <= startIndent && line.trim() !== '') {
          return i - 1;
        }
      }
    }

    // Fallback: ищем следующее определение того же уровня или конец файла
    return Math.min(startLine + 100, lines.length - 1);
  }

  /**
   * Получить уровень отступа строки
   */
  private getIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  /**
   * Создать чанки из найденных границ
   */
  private createChunks(
    lines: string[],
    boundaries: Array<{ startLine: number; endLine: number; type: FileChunk['type']; name: string }>,
    contextInfo: { context: string; endLine: number },
    filePath: string,
    opts: ChunkingOptions
  ): FileChunk[] {
    const chunks: FileChunk[] = [];
    const fileName = filePath.split(/[/\\]/).pop() || 'file';

    // Если нет логических границ - разбиваем по размеру
    if (boundaries.length === 0) {
      return this.chunkBySize(lines, filePath, contextInfo, opts);
    }

    // Добавляем header chunk если есть контекст
    if (contextInfo.context && contextInfo.context.length > opts.minChunkSize) {
      chunks.push({
        id: `${filePath}:chunk:header`,
        filePath,
        chunkIndex: 0,
        totalChunks: 0, // Будет обновлено позже
        startLine: 0,
        endLine: contextInfo.endLine,
        type: 'header',
        name: `${fileName} imports`,
        content: contextInfo.context,
        context: ''
      });
    }

    // Создаём чанки для каждой логической границы
    for (const boundary of boundaries) {
      const chunkLines = lines.slice(boundary.startLine, boundary.endLine + 1);
      let content = chunkLines.join('\n');

      // Если чанк слишком большой - разбиваем дальше
      if (content.length > opts.maxChunkSize) {
        const subChunks = this.splitLargeBlock(chunkLines, boundary, filePath, contextInfo, opts);
        chunks.push(...subChunks);
      } else {
        // Добавляем контекст если нужно
        const contextPrefix = opts.includeContext && contextInfo.context
          ? `// Context from ${fileName}:\n${contextInfo.context}\n\n// ${boundary.type}: ${boundary.name}\n`
          : '';

        chunks.push({
          id: `${filePath}:chunk:${boundary.type}:${boundary.name}:${boundary.startLine}`,
          filePath,
          chunkIndex: chunks.length,
          totalChunks: 0,
          startLine: boundary.startLine,
          endLine: boundary.endLine,
          type: boundary.type,
          name: boundary.name,
          content,
          context: contextPrefix
        });
      }
    }

    // Обновляем totalChunks
    const total = chunks.length;
    chunks.forEach((chunk, i) => {
      chunk.totalChunks = total;
      chunk.chunkIndex = i;
    });

    return chunks;
  }

  /**
   * Разбить большой блок на подчанки
   */
  private splitLargeBlock(
    lines: string[],
    boundary: { startLine: number; endLine: number; type: FileChunk['type']; name: string },
    filePath: string,
    contextInfo: { context: string; endLine: number },
    opts: ChunkingOptions
  ): FileChunk[] {
    const chunks: FileChunk[] = [];
    let currentChunk: string[] = [];
    let currentSize = 0;
    let chunkStartLine = boundary.startLine;
    let partNum = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length + 1; // +1 for newline

      if (currentSize + lineSize > opts.maxChunkSize && currentChunk.length > 0) {
        // Сохраняем текущий чанк
        const contextPrefix = opts.includeContext && contextInfo.context
          ? `// Context: ${boundary.type} ${boundary.name} (part ${partNum})\n`
          : '';

        chunks.push({
          id: `${filePath}:chunk:${boundary.type}:${boundary.name}:${chunkStartLine}:part${partNum}`,
          filePath,
          chunkIndex: chunks.length,
          totalChunks: 0,
          startLine: chunkStartLine,
          endLine: boundary.startLine + i - 1,
          type: boundary.type,
          name: `${boundary.name} (part ${partNum})`,
          content: currentChunk.join('\n'),
          context: contextPrefix
        });

        currentChunk = [];
        currentSize = 0;
        chunkStartLine = boundary.startLine + i;
        partNum++;
      }

      currentChunk.push(line);
      currentSize += lineSize;
    }

    // Последний чанк
    if (currentChunk.length > 0) {
      chunks.push({
        id: `${filePath}:chunk:${boundary.type}:${boundary.name}:${chunkStartLine}:part${partNum}`,
        filePath,
        chunkIndex: chunks.length,
        totalChunks: 0,
        startLine: chunkStartLine,
        endLine: boundary.endLine,
        type: boundary.type,
        name: `${boundary.name} (part ${partNum})`,
        content: currentChunk.join('\n'),
        context: opts.includeContext ? `// Context: ${boundary.type} ${boundary.name} (part ${partNum})\n` : ''
      });
    }

    return chunks;
  }

  /**
   * Разбить файл по размеру (fallback)
   */
  private chunkBySize(
    lines: string[],
    filePath: string,
    contextInfo: { context: string; endLine: number },
    opts: ChunkingOptions
  ): FileChunk[] {
    const chunks: FileChunk[] = [];
    const fileName = filePath.split(/[/\\]/).pop() || 'file';
    let currentChunk: string[] = [];
    let currentSize = 0;
    let chunkStartLine = 0;
    let partNum = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length + 1;

      if (currentSize + lineSize > opts.maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `${filePath}:chunk:${chunkStartLine}:part${partNum}`,
          filePath,
          chunkIndex: chunks.length,
          totalChunks: 0,
          startLine: chunkStartLine,
          endLine: i - 1,
          type: 'code',
          name: `${fileName} (part ${partNum})`,
          content: currentChunk.join('\n'),
          context: opts.includeContext && partNum === 1 ? contextInfo.context : ''
        });

        currentChunk = [];
        currentSize = 0;
        chunkStartLine = i;
        partNum++;
      }

      currentChunk.push(line);
      currentSize += lineSize;
    }

    if (currentChunk.length > 0) {
      chunks.push({
        id: `${filePath}:chunk:${chunkStartLine}:part${partNum}`,
        filePath,
        chunkIndex: chunks.length,
        totalChunks: 0,
        startLine: chunkStartLine,
        endLine: lines.length - 1,
        type: 'code',
        name: `${fileName} (part ${partNum})`,
        content: currentChunk.join('\n'),
        context: ''
      });
    }

    // Обновляем totalChunks
    const total = chunks.length;
    chunks.forEach((chunk, i) => {
      chunk.totalChunks = total;
      chunk.chunkIndex = i;
    });

    return chunks;
  }
}
