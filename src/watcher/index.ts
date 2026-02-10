/**
 * Real-time File Watcher
 *
 * Мониторинг изменений файлов:
 * - Автоматическая переиндексация при изменениях
 * - Debounce для избежания лишних обновлений
 * - Поддержка .gitignore паттернов
 * - События для уведомления о изменениях
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export interface WatcherConfig {
  debounceMs: number;           // Задержка перед обработкой (мс)
  ignorePatterns: string[];     // Паттерны для игнорирования
  watchExtensions: string[];    // Расширения для отслеживания
  recursive: boolean;           // Рекурсивный мониторинг
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'delete';
  path: string;
  timestamp: Date;
}

export interface WatcherStats {
  watchedFiles: number;
  watchedDirectories: number;
  totalChanges: number;
  lastChangeTime?: Date;
  isWatching: boolean;
}

const DEFAULT_CONFIG: WatcherConfig = {
  debounceMs: 300,
  ignorePatterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '__pycache__',
    '*.log',
    '*.lock',
    '.DS_Store',
    'Thumbs.db'
  ],
  watchExtensions: [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h',
    '.cs', '.rb', '.php', '.swift', '.kt', '.scala',
    '.vue', '.svelte', '.astro'
  ],
  recursive: true
};

export class FileWatcher extends EventEmitter {
  private config: WatcherConfig;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private stats: WatcherStats = {
    watchedFiles: 0,
    watchedDirectories: 0,
    totalChanges: 0,
    isWatching: false
  };
  private rootPath: string = '';

  constructor(config: Partial<WatcherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Начать мониторинг директории
   */
  async watch(dirPath: string): Promise<void> {
    this.rootPath = path.resolve(dirPath);

    if (!fs.existsSync(this.rootPath)) {
      throw new Error(`Directory not found: ${this.rootPath}`);
    }

    Logger.progress(`Starting file watcher on: ${this.rootPath}`);

    // Загружаем .gitignore если есть
    await this.loadGitignore();

    // Сканируем и устанавливаем watchers
    await this.setupWatchers(this.rootPath);

    this.stats.isWatching = true;
    Logger.success(`Watching ${this.stats.watchedDirectories} directories, ${this.stats.watchedFiles} files`);

    this.emit('ready', this.stats);
  }

  /**
   * Остановить мониторинг
   */
  stop(): void {
    Logger.progress('Stopping file watcher...');

    // Очищаем все таймеры
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Закрываем все watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    this.stats.isWatching = false;
    this.emit('stopped');

    Logger.success('File watcher stopped');
  }

  /**
   * Получить статистику
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  /**
   * Загрузка паттернов из .gitignore
   */
  private async loadGitignore(): Promise<void> {
    const gitignorePath = path.join(this.rootPath, '.gitignore');

    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        const patterns = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));

        this.config.ignorePatterns = [
          ...new Set([...this.config.ignorePatterns, ...patterns])
        ];

        Logger.info(`Loaded ${patterns.length} patterns from .gitignore`);
      } catch (error) {
        Logger.warn('Failed to load .gitignore');
      }
    }
  }

  /**
   * Установка watchers рекурсивно
   */
  private async setupWatchers(dirPath: string): Promise<void> {
    if (this.shouldIgnore(dirPath)) {
      return;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      // Создаём watcher для директории
      this.createDirectoryWatcher(dirPath);

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.config.recursive) {
            await this.setupWatchers(fullPath);
          }
        } else if (entry.isFile()) {
          if (this.shouldWatchFile(fullPath)) {
            this.stats.watchedFiles++;
          }
        }
      }
    } catch (error) {
      Logger.warn(`Cannot access directory: ${dirPath}`);
    }
  }

  /**
   * Создание watcher для директории
   */
  private createDirectoryWatcher(dirPath: string): void {
    if (this.watchers.has(dirPath)) {
      return;
    }

    try {
      const watcher = fs.watch(dirPath, { persistent: true }, (eventType, filename) => {
        if (filename) {
          const fullPath = path.join(dirPath, filename);
          this.handleFileEvent(eventType, fullPath);
        }
      });

      watcher.on('error', (error) => {
        Logger.warn(`Watcher error for ${dirPath}: ${error.message}`);
        this.watchers.delete(dirPath);
      });

      this.watchers.set(dirPath, watcher);
      this.stats.watchedDirectories++;
    } catch (error) {
      Logger.warn(`Failed to watch directory: ${dirPath}`);
    }
  }

  /**
   * Обработка события файла
   */
  private handleFileEvent(eventType: string, filePath: string): void {
    if (this.shouldIgnore(filePath)) {
      return;
    }

    // Определяем тип события
    let changeType: FileChangeEvent['type'];

    if (!fs.existsSync(filePath)) {
      changeType = 'delete';
    } else {
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Новая директория - добавляем watcher
        if (!this.watchers.has(filePath)) {
          this.setupWatchers(filePath);
        }
        return;
      }

      if (!this.shouldWatchFile(filePath)) {
        return;
      }

      // Проверяем, новый ли файл
      changeType = eventType === 'rename' ? 'add' : 'change';
    }

    const event: FileChangeEvent = {
      type: changeType,
      path: filePath,
      timestamp: new Date()
    };

    // Debounce
    this.debounceEvent(event);
  }

  /**
   * Debounce обработки события
   */
  private debounceEvent(event: FileChangeEvent): void {
    const key = event.path;

    // Отменяем предыдущий таймер
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Сохраняем событие
    this.pendingChanges.set(key, event);

    // Устанавливаем новый таймер
    const timer = setTimeout(() => {
      this.processPendingChange(key);
    }, this.config.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Обработка отложенного изменения
   */
  private processPendingChange(key: string): void {
    const event = this.pendingChanges.get(key);
    if (!event) return;

    this.pendingChanges.delete(key);
    this.debounceTimers.delete(key);

    // Обновляем статистику
    this.stats.totalChanges++;
    this.stats.lastChangeTime = event.timestamp;

    // Если файл удалён, обновляем счётчик
    if (event.type === 'delete') {
      this.stats.watchedFiles = Math.max(0, this.stats.watchedFiles - 1);
    } else if (event.type === 'add') {
      this.stats.watchedFiles++;
    }

    // Эмитим событие
    this.emit('change', event);
    this.emit(event.type, event);

    Logger.info(`File ${event.type}: ${path.relative(this.rootPath, event.path)}`);
  }

  /**
   * Проверка, нужно ли игнорировать путь
   */
  private shouldIgnore(filePath: string): boolean {
    const relativePath = path.relative(this.rootPath, filePath);
    const parts = relativePath.split(path.sep);

    for (const pattern of this.config.ignorePatterns) {
      // Простая проверка паттернов
      if (pattern.startsWith('*.')) {
        // Расширение файла
        const ext = pattern.slice(1);
        if (filePath.endsWith(ext)) return true;
      } else if (pattern.includes('*')) {
        // Glob паттерн (упрощённый)
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        if (parts.some(p => regex.test(p))) return true;
      } else {
        // Точное совпадение с любой частью пути
        if (parts.includes(pattern)) return true;
      }
    }

    return false;
  }

  /**
   * Проверка, нужно ли отслеживать файл
   */
  private shouldWatchFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.config.watchExtensions.includes(ext);
  }

  /**
   * Добавить паттерн для игнорирования
   */
  addIgnorePattern(pattern: string): void {
    if (!this.config.ignorePatterns.includes(pattern)) {
      this.config.ignorePatterns.push(pattern);
    }
  }

  /**
   * Удалить паттерн игнорирования
   */
  removeIgnorePattern(pattern: string): void {
    const index = this.config.ignorePatterns.indexOf(pattern);
    if (index !== -1) {
      this.config.ignorePatterns.splice(index, 1);
    }
  }

  /**
   * Получить все отслеживаемые файлы
   */
  getWatchedFiles(): string[] {
    const files: string[] = [];

    const scanDir = (dirPath: string) => {
      if (this.shouldIgnore(dirPath)) return;

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && this.shouldWatchFile(fullPath)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore errors
      }
    };

    scanDir(this.rootPath);
    return files;
  }
}

/**
 * Менеджер автоматической переиндексации
 */
export class AutoReindexManager {
  private watcher: FileWatcher;
  private reindexCallback?: () => Promise<void>;
  private batchTimeout?: NodeJS.Timeout;
  private pendingReindex = false;
  private batchDelayMs: number;

  constructor(batchDelayMs: number = 1000) {
    this.watcher = new FileWatcher();
    this.batchDelayMs = batchDelayMs;

    // Подписываемся на изменения
    this.watcher.on('change', () => this.scheduleReindex());
    this.watcher.on('add', () => this.scheduleReindex());
    this.watcher.on('delete', () => this.scheduleReindex());
  }

  /**
   * Запуск мониторинга с callback для переиндексации
   */
  async start(dirPath: string, reindexCallback: () => Promise<void>): Promise<void> {
    this.reindexCallback = reindexCallback;
    await this.watcher.watch(dirPath);
  }

  /**
   * Остановка мониторинга
   */
  stop(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    this.watcher.stop();
  }

  /**
   * Планирование переиндексации (с батчингом)
   */
  private scheduleReindex(): void {
    this.pendingReindex = true;

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(async () => {
      if (this.pendingReindex && this.reindexCallback) {
        this.pendingReindex = false;
        Logger.progress('Auto-reindexing triggered...');

        try {
          await this.reindexCallback();
          Logger.success('Auto-reindex completed');
        } catch (error) {
          Logger.error(`Auto-reindex failed: ${error}`);
        }
      }
    }, this.batchDelayMs);
  }

  /**
   * Получить статистику watcher'а
   */
  getStats(): WatcherStats {
    return this.watcher.getStats();
  }

  /**
   * Получить экземпляр watcher'а
   */
  getWatcher(): FileWatcher {
    return this.watcher;
  }
}
