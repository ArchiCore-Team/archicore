/**
 * Code Duplication Detector
 *
 * Оптимизированное обнаружение дублирования кода:
 * - Использует хеширование строк (Rabin-Karp подход)
 * - Ограничивает размер анализа для больших проектов
 * - Не хранит весь код в памяти
 */

import { Logger } from '../utils/logger.js';

export interface DuplicationResult {
  clones: CodeClone[];
  summary: DuplicationSummary;
}

export interface CodeClone {
  id: string;
  type: 'exact' | 'similar' | 'structural';
  instances: CloneInstance[];
  linesCount: number;
  similarity: number;    // 0-100%
  suggestion: string;
}

export interface CloneInstance {
  file: string;
  startLine: number;
  endLine: number;
  code: string;
}

export interface DuplicationSummary {
  totalClones: number;
  totalDuplicatedLines: number;
  duplicationPercentage: number;
  filesAffected: number;
  estimatedRefactorHours: number;
}

interface LineHash {
  file: string;
  lineNum: number;
  hash: string;
}

export class DuplicationDetector {
  private readonly MIN_LINES = 6;           // Минимум строк для детекции
  private readonly WINDOW_SIZES = [6, 10, 15, 25];  // Фиксированные размеры окон
  private readonly MAX_CLONES = 50;         // Максимум клонов в результате
  private readonly MAX_FILES = 500;         // Максимум файлов для анализа
  private readonly MAX_LINES_PER_FILE = 5000; // Максимум строк на файл

  /**
   * Анализ дублирования
   */
  async analyze(fileContents: Map<string, string>): Promise<DuplicationResult> {
    Logger.progress('Analyzing code duplication...');

    // Ограничиваем размер для больших проектов
    const files = this.limitFiles(fileContents);

    // Считаем общее количество строк
    let totalLines = 0;
    for (const content of files.values()) {
      totalLines += content.split('\n').length;
    }

    // Для очень больших проектов используем быстрый алгоритм
    const clones = totalLines > 50000
      ? await this.findClonesQuick(files)
      : await this.findClonesNormal(files);

    const summary = this.calculateSummary(clones, totalLines, files.size);

    Logger.success(`Found ${clones.length} code clones (${summary.duplicationPercentage}% duplication)`);

    return { clones, summary };
  }

  /**
   * Ограничение файлов для анализа
   */
  private limitFiles(fileContents: Map<string, string>): Map<string, string> {
    if (fileContents.size <= this.MAX_FILES) {
      return fileContents;
    }

    Logger.warn(`Too many files (${fileContents.size}), analyzing first ${this.MAX_FILES}`);

    const limited = new Map<string, string>();
    let count = 0;

    for (const [path, content] of fileContents) {
      if (count >= this.MAX_FILES) break;
      limited.set(path, content);
      count++;
    }

    return limited;
  }

  /**
   * Быстрый алгоритм для больших проектов
   * Использует только хеширование строк
   */
  private async findClonesQuick(fileContents: Map<string, string>): Promise<CodeClone[]> {
    const lineHashes = new Map<string, LineHash[]>();

    // Хешируем каждую строку
    for (const [filePath, content] of fileContents) {
      const lines = content.split('\n').slice(0, this.MAX_LINES_PER_FILE);

      for (let i = 0; i < lines.length; i++) {
        const normalized = this.normalizeLine(lines[i]);
        if (normalized.length < 10) continue; // Слишком короткая строка

        const hash = this.quickHash(normalized);
        const existing = lineHashes.get(hash) || [];
        existing.push({ file: filePath, lineNum: i + 1, hash });
        lineHashes.set(hash, existing);
      }
    }

    // Находим последовательности одинаковых строк
    const clones: CodeClone[] = [];
    const processed = new Set<string>();

    for (const [hash, locations] of lineHashes) {
      if (locations.length < 2) continue;

      // Группируем по файлам
      const byFile = new Map<string, number[]>();
      for (const loc of locations) {
        const existing = byFile.get(loc.file) || [];
        existing.push(loc.lineNum);
        byFile.set(loc.file, existing);
      }

      // Ищем блоки в разных файлах
      const files = Array.from(byFile.keys());
      if (files.length < 2) continue;

      for (let i = 0; i < files.length && clones.length < this.MAX_CLONES; i++) {
        for (let j = i + 1; j < files.length && clones.length < this.MAX_CLONES; j++) {
          const file1 = files[i];
          const file2 = files[j];
          const lines1 = byFile.get(file1)!;
          const lines2 = byFile.get(file2)!;

          for (const line1 of lines1) {
            for (const line2 of lines2) {
              const key = `${file1}:${line1}-${file2}:${line2}`;
              if (processed.has(key)) continue;

              // Расширяем блок вниз
              const blockSize = this.expandBlock(
                fileContents.get(file1)!,
                fileContents.get(file2)!,
                line1,
                line2
              );

              if (blockSize >= this.MIN_LINES) {
                processed.add(key);

                const code1 = this.getCodeBlock(fileContents.get(file1)!, line1, line1 + blockSize - 1);

                clones.push({
                  id: `clone-${hash.substring(0, 8)}-${clones.length}`,
                  type: 'exact',
                  instances: [
                    { file: file1, startLine: line1, endLine: line1 + blockSize - 1, code: code1 },
                    { file: file2, startLine: line2, endLine: line2 + blockSize - 1, code: code1 }
                  ],
                  linesCount: blockSize,
                  similarity: 100,
                  suggestion: 'Создайте общий модуль/утилиту и импортируйте его'
                });
              }
            }
          }
        }
      }
    }

    return this.deduplicateClones(clones);
  }

  /**
   * Обычный алгоритм для средних проектов
   */
  private async findClonesNormal(fileContents: Map<string, string>): Promise<CodeClone[]> {
    const clones: CodeClone[] = [];

    for (const windowSize of this.WINDOW_SIZES) {
      if (clones.length >= this.MAX_CLONES) break;

      const blockHashes = new Map<string, Array<{ file: string; startLine: number; code: string }>>();

      // Собираем хеши блоков
      for (const [filePath, content] of fileContents) {
        const lines = content.split('\n').slice(0, this.MAX_LINES_PER_FILE);

        for (let start = 0; start <= lines.length - windowSize; start++) {
          const blockLines = lines.slice(start, start + windowSize);
          const normalized = this.normalizeBlock(blockLines);

          if (normalized.length < 20) continue;

          const hash = this.quickHash(normalized);
          const existing = blockHashes.get(hash) || [];

          existing.push({
            file: filePath,
            startLine: start + 1,
            code: blockLines.join('\n')
          });

          blockHashes.set(hash, existing);
        }
      }

      // Находим дубликаты
      for (const [hash, blocks] of blockHashes) {
        if (blocks.length < 2) continue;
        if (clones.length >= this.MAX_CLONES) break;

        // Фильтруем перекрывающиеся блоки
        const filtered = this.filterOverlapping(blocks, windowSize);
        if (filtered.length < 2) continue;

        // Проверяем, что это не все в одном файле рядом
        const uniqueFiles = new Set(filtered.map(b => b.file));
        const inSameFile = uniqueFiles.size === 1;

        if (inSameFile) {
          // Проверяем что блоки не рядом
          const sorted = [...filtered].sort((a, b) => a.startLine - b.startLine);
          let hasDistant = false;
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].startLine - sorted[i - 1].startLine > windowSize * 2) {
              hasDistant = true;
              break;
            }
          }
          if (!hasDistant) continue;
        }

        clones.push({
          id: `clone-${hash.substring(0, 8)}`,
          type: 'exact',
          instances: filtered.slice(0, 5).map(b => ({
            file: b.file,
            startLine: b.startLine,
            endLine: b.startLine + windowSize - 1,
            code: b.code
          })),
          linesCount: windowSize,
          similarity: 100,
          suggestion: inSameFile
            ? 'Извлеките дублированный код в отдельную функцию'
            : 'Создайте общий модуль/утилиту и импортируйте его'
        });
      }
    }

    return this.deduplicateClones(clones);
  }

  /**
   * Расширение блока вниз пока строки совпадают
   */
  private expandBlock(content1: string, content2: string, line1: number, line2: number): number {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');

    let size = 1;
    const maxExpand = Math.min(50, lines1.length - line1 + 1, lines2.length - line2 + 1);

    while (size < maxExpand) {
      const idx1 = line1 - 1 + size;
      const idx2 = line2 - 1 + size;

      if (idx1 >= lines1.length || idx2 >= lines2.length) break;

      const norm1 = this.normalizeLine(lines1[idx1]);
      const norm2 = this.normalizeLine(lines2[idx2]);

      if (norm1 !== norm2 || norm1.length < 3) break;

      size++;
    }

    return size;
  }

  /**
   * Получить блок кода по номерам строк
   */
  private getCodeBlock(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }

  /**
   * Нормализация одной строки
   */
  private normalizeLine(line: string): string {
    return line
      .replace(/\/\/.*$/, '')           // Удаляем однострочные комментарии
      .replace(/['"`][^'"`]*['"`]/g, '""')  // Нормализуем строки
      .replace(/\s+/g, ' ')             // Нормализуем пробелы
      .trim();
  }

  /**
   * Нормализация блока строк
   */
  private normalizeBlock(lines: string[]): string {
    return lines
      .map(l => this.normalizeLine(l))
      .filter(l => l.length > 0)
      .join('\n');
  }

  /**
   * Быстрое хеширование
   */
  private quickHash(str: string): string {
    // Используем короткий хеш для скорости
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Фильтрация перекрывающихся блоков
   */
  private filterOverlapping(
    blocks: Array<{ file: string; startLine: number; code: string }>,
    windowSize: number
  ): Array<{ file: string; startLine: number; code: string }> {
    const byFile = new Map<string, Array<{ file: string; startLine: number; code: string }>>();

    for (const block of blocks) {
      const existing = byFile.get(block.file) || [];
      existing.push(block);
      byFile.set(block.file, existing);
    }

    const result: Array<{ file: string; startLine: number; code: string }> = [];

    for (const fileBlocks of byFile.values()) {
      fileBlocks.sort((a, b) => a.startLine - b.startLine);

      let lastEnd = -windowSize;
      for (const block of fileBlocks) {
        if (block.startLine > lastEnd) {
          result.push(block);
          lastEnd = block.startLine + windowSize;
        }
      }
    }

    return result;
  }

  /**
   * Удаление дубликатов клонов (перекрывающихся)
   */
  private deduplicateClones(clones: CodeClone[]): CodeClone[] {
    // Сортируем по размеру (больше лучше)
    clones.sort((a, b) => b.linesCount - a.linesCount);

    const result: CodeClone[] = [];
    const covered = new Set<string>();

    for (const clone of clones) {
      let isDuplicate = false;

      for (const instance of clone.instances) {
        for (let line = instance.startLine; line <= instance.endLine; line++) {
          const key = `${instance.file}:${line}`;
          if (covered.has(key)) {
            isDuplicate = true;
            break;
          }
        }
        if (isDuplicate) break;
      }

      if (!isDuplicate) {
        result.push(clone);

        // Отмечаем строки как покрытые
        for (const instance of clone.instances) {
          for (let line = instance.startLine; line <= instance.endLine; line++) {
            covered.add(`${instance.file}:${line}`);
          }
        }
      }

      if (result.length >= this.MAX_CLONES) break;
    }

    return result;
  }

  /**
   * Подсчёт статистики
   */
  private calculateSummary(
    clones: CodeClone[],
    totalLines: number,
    _totalFiles: number
  ): DuplicationSummary {
    const duplicatedLines = new Set<string>();

    for (const clone of clones) {
      for (const instance of clone.instances) {
        for (let line = instance.startLine; line <= instance.endLine; line++) {
          duplicatedLines.add(`${instance.file}:${line}`);
        }
      }
    }

    const totalDuplicatedLines = duplicatedLines.size;
    const duplicationPercentage = totalLines > 0
      ? Math.round((totalDuplicatedLines / totalLines) * 100)
      : 0;

    const filesAffected = new Set(
      clones.flatMap(c => c.instances.map(i => i.file))
    ).size;

    const estimatedRefactorHours = clones.reduce((sum, clone) => {
      return sum + 0.25 + clone.instances.length * 0.08;
    }, 0);

    return {
      totalClones: clones.length,
      totalDuplicatedLines,
      duplicationPercentage,
      filesAffected,
      estimatedRefactorHours: Math.round(estimatedRefactorHours * 10) / 10
    };
  }
}
