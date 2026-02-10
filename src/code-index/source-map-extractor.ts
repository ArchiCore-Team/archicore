/**
 * Source Map Extractor
 *
 * Извлекает оригинальный исходный код из source map файлов.
 * Позволяет индексировать bundled/minified проекты.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export interface VirtualFile {
  /** Виртуальный путь файла (восстановленный из source map) */
  path: string;
  /** Содержимое файла */
  content: string;
  /** Оригинальный source map файл */
  sourceMapPath: string;
}

export interface SourceMapData {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names?: string[];
  mappings: string;
}

export interface ExtractionResult {
  /** Извлечённые виртуальные файлы */
  files: VirtualFile[];
  /** Статистика извлечения */
  stats: {
    sourceMapCount: number;
    totalSources: number;
    extractedFiles: number;
    skippedFiles: number;
  };
}

export class SourceMapExtractor {
  private processedMaps = new Set<string>();

  /**
   * Проверяет, является ли проект bundled (содержит source maps)
   */
  async isBundledProject(projectPath: string): Promise<boolean> {
    const mapFiles = await this.findSourceMaps(projectPath);
    return mapFiles.length > 0;
  }

  /**
   * Находит все .map файлы в проекте
   */
  async findSourceMaps(projectPath: string): Promise<string[]> {
    const mapFiles: string[] = [];

    const scanDir = async (dir: string, depth = 0): Promise<void> => {
      // Ограничиваем глубину сканирования
      if (depth > 5) return;

      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Пропускаем node_modules и скрытые папки
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
              continue;
            }
            await scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.endsWith('.js.map')) {
            mapFiles.push(fullPath);
          }
        }
      } catch {
        // Игнорируем ошибки доступа
      }
    };

    await scanDir(projectPath);
    return mapFiles;
  }

  /**
   * Извлекает все исходные файлы из source maps проекта
   */
  async extractFromProject(projectPath: string): Promise<ExtractionResult> {
    const mapFiles = await this.findSourceMaps(projectPath);
    const allFiles: VirtualFile[] = [];
    const seenPaths = new Set<string>();

    let totalSources = 0;
    let skippedFiles = 0;

    Logger.info(`Found ${mapFiles.length} source map files`);

    for (const mapFile of mapFiles) {
      try {
        const extracted = await this.extractFromSourceMap(mapFile);
        totalSources += extracted.length;

        for (const file of extracted) {
          // Дедупликация по пути
          if (seenPaths.has(file.path)) {
            skippedFiles++;
            continue;
          }

          seenPaths.add(file.path);
          allFiles.push(file);
        }
      } catch (error) {
        Logger.warn(`Failed to extract from ${mapFile}: ${error}`);
      }
    }

    Logger.success(`Extracted ${allFiles.length} source files from ${mapFiles.length} source maps`);

    return {
      files: allFiles,
      stats: {
        sourceMapCount: mapFiles.length,
        totalSources,
        extractedFiles: allFiles.length,
        skippedFiles
      }
    };
  }

  /**
   * Извлекает исходные файлы из одного source map
   */
  async extractFromSourceMap(mapPath: string): Promise<VirtualFile[]> {
    if (this.processedMaps.has(mapPath)) {
      return [];
    }
    this.processedMaps.add(mapPath);

    const content = await fs.promises.readFile(mapPath, 'utf-8');
    const sourceMap: SourceMapData = JSON.parse(content);

    if (!sourceMap.sources || !sourceMap.sourcesContent) {
      Logger.debug(`Source map ${mapPath} has no embedded sources`);
      return [];
    }

    const files: VirtualFile[] = [];

    for (let i = 0; i < sourceMap.sources.length; i++) {
      const sourcePath = sourceMap.sources[i];
      const sourceContent = sourceMap.sourcesContent[i];

      // Пропускаем null/пустые источники
      if (!sourceContent) {
        continue;
      }

      // Пропускаем node_modules и внешние зависимости
      if (this.shouldSkipSource(sourcePath)) {
        continue;
      }

      // Нормализуем путь
      const normalizedPath = this.normalizePath(sourcePath, sourceMap.sourceRoot);

      // Проверяем, что это исходный код (не ассеты)
      if (!this.isSourceFile(normalizedPath)) {
        continue;
      }

      files.push({
        path: normalizedPath,
        content: sourceContent,
        sourceMapPath: mapPath
      });
    }

    return files;
  }

  /**
   * Нормализует путь из source map
   * webpack://project/./src/file.vue → src/file.vue
   */
  private normalizePath(sourcePath: string, sourceRoot?: string): string {
    let normalized = sourcePath;

    // Убираем webpack:// префикс
    if (normalized.startsWith('webpack://')) {
      // webpack://project-name/./src/file.ts → ./src/file.ts
      normalized = normalized.replace(/^webpack:\/\/[^/]+\//, '');
    }

    // Убираем ./ префикс
    if (normalized.startsWith('./')) {
      normalized = normalized.substring(2);
    }

    // Применяем sourceRoot если есть
    if (sourceRoot && !normalized.startsWith(sourceRoot)) {
      normalized = path.posix.join(sourceRoot, normalized);
    }

    // Убираем query strings (?xxxx)
    normalized = normalized.replace(/\?[a-f0-9]+$/, '');

    // Заменяем обратные слеши на прямые
    normalized = normalized.replace(/\\/g, '/');

    return normalized;
  }

  /**
   * Проверяет, нужно ли пропустить этот источник
   */
  private shouldSkipSource(sourcePath: string): boolean {
    const skipPatterns = [
      'node_modules/',
      '/node_modules/',
      'webpack/runtime',
      'webpack/bootstrap',
      '(webpack)',
      '__webpack',
      'ignored|',
      '/external ',
      'polyfill',
      '.css',  // CSS в JS обычно не нужен
    ];

    const lowerPath = sourcePath.toLowerCase();
    return skipPatterns.some(pattern => lowerPath.includes(pattern.toLowerCase()));
  }

  /**
   * Проверяет, является ли файл исходным кодом
   */
  private isSourceFile(filePath: string): boolean {
    const sourceExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.vue', '.svelte', '.astro',
      '.py', '.rb', '.go', '.rs', '.java', '.kt', '.scala',
      '.php', '.cs', '.swift', '.dart'
    ];

    const ext = path.extname(filePath).toLowerCase();
    return sourceExtensions.includes(ext);
  }

  /**
   * Очищает кэш обработанных map файлов
   */
  clearCache(): void {
    this.processedMaps.clear();
  }
}
