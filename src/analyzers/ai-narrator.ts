/**
 * AI Narrator
 *
 * Генерирует человекопонятное описание архитектуры проекта:
 * - Что это за проект
 * - Какая архитектура используется
 * - Где проблемные места
 * - Конкретные рекомендации
 */

import { DependencyGraph, Symbol } from '../types/index.js';
import { Logger } from '../utils/logger.js';

// Архитектурные паттерны
export interface DetectedPattern {
  name: string;
  confidence: number; // 0-100
  evidence: string[];
  files: string[];
}

// Архитектурный слой
export interface ArchitectureLayer {
  name: string;
  files: string[];
  coverage: number; // процент файлов в слое
  role: string;
}

// Проблемное место
export interface ProblemArea {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  files: string[];
  suggestion: string;
}

// Полный отчёт нарратора
export interface NarratorReport {
  // Общее описание
  summary: {
    projectType: string;
    primaryLanguage: string;
    secondaryLanguages: string[];
    totalFiles: number;
    totalSymbols: number;
    linesOfCode: number;
  };

  // Стек технологий
  techStack: {
    frontend: string[];
    backend: string[];
    database: string[];
    infrastructure: string[];
  };

  // Архитектура
  architecture: {
    detected: string;
    confidence: number;
    layers: ArchitectureLayer[];
    patterns: DetectedPattern[];
  };

  // Проблемы
  problems: ProblemArea[];

  // Рекомендации
  recommendations: string[];

  // Человекопонятный текст
  narrative: string;
  narrativeRu: string;
}

export class AINarrator {
  /**
   * Анализирует проект и генерирует нарратив
   */
  async analyze(
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    fileContents: Map<string, string>,
    projectMetadata?: {
      framework?: string;
      backend?: string;
      database?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }
  ): Promise<NarratorReport> {
    Logger.progress('AI Narrator analyzing project...');

    // 1. Анализ структуры файлов
    const fileAnalysis = this.analyzeFiles(graph, fileContents);

    // 2. Определение стека технологий
    const techStack = this.detectTechStack(fileAnalysis, projectMetadata);

    // 3. Анализ символов и их распределения (используется для статистики)
    this.analyzeSymbols(symbols);

    // 4. Определение архитектуры
    const architecture = this.detectArchitecture(graph, symbols, fileAnalysis);

    // 5. Поиск проблем
    const problems = this.findProblems(graph, symbols, fileContents, fileAnalysis);

    // 6. Генерация рекомендаций
    const recommendations = this.generateRecommendations(problems, architecture);

    // 7. Генерация нарратива
    const narrative = this.generateNarrative(
      fileAnalysis,
      techStack,
      architecture,
      problems,
      recommendations,
      'en'
    );

    const narrativeRu = this.generateNarrative(
      fileAnalysis,
      techStack,
      architecture,
      problems,
      recommendations,
      'ru'
    );

    Logger.success('AI Narrator analysis complete');

    return {
      summary: {
        projectType: this.detectProjectType(techStack, fileAnalysis),
        primaryLanguage: fileAnalysis.primaryLanguage,
        secondaryLanguages: fileAnalysis.secondaryLanguages,
        totalFiles: fileAnalysis.totalFiles,
        totalSymbols: symbols.size,
        linesOfCode: fileAnalysis.totalLines,
      },
      techStack,
      architecture,
      problems,
      recommendations,
      narrative,
      narrativeRu,
    };
  }

  /**
   * Анализ файловой структуры
   */
  private analyzeFiles(graph: DependencyGraph, fileContents: Map<string, string>): {
    totalFiles: number;
    totalLines: number;
    primaryLanguage: string;
    secondaryLanguages: string[];
    filesByLanguage: Map<string, number>;
    filesByDirectory: Map<string, string[]>;
    largeFiles: Array<{ path: string; lines: number }>;
  } {
    const filesByLanguage = new Map<string, number>();
    const filesByDirectory = new Map<string, string[]>();
    const largeFiles: Array<{ path: string; lines: number }> = [];
    let totalLines = 0;

    for (const [filePath, content] of fileContents) {
      // Подсчёт строк
      const lines = content.split('\n').length;
      totalLines += lines;

      // Большие файлы (> 500 строк)
      if (lines > 500) {
        largeFiles.push({ path: filePath, lines });
      }

      // Язык по расширению
      const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown';
      const lang = this.extToLanguage(ext);
      filesByLanguage.set(lang, (filesByLanguage.get(lang) || 0) + 1);

      // Директория
      const dir = filePath.split(/[/\\]/).slice(0, -1).join('/') || '/';
      if (!filesByDirectory.has(dir)) {
        filesByDirectory.set(dir, []);
      }
      filesByDirectory.get(dir)!.push(filePath);
    }

    // Определяем основной язык
    const sortedLanguages = [...filesByLanguage.entries()]
      .sort((a, b) => b[1] - a[1]);

    const primaryLanguage = sortedLanguages[0]?.[0] || 'unknown';
    const secondaryLanguages = sortedLanguages.slice(1, 4).map(([lang]) => lang);

    return {
      totalFiles: fileContents.size || graph.nodes.size,
      totalLines,
      primaryLanguage,
      secondaryLanguages,
      filesByLanguage,
      filesByDirectory,
      largeFiles: largeFiles.sort((a, b) => b.lines - a.lines).slice(0, 10),
    };
  }

  /**
   * Определение стека технологий
   */
  private detectTechStack(
    fileAnalysis: ReturnType<typeof this.analyzeFiles>,
    projectMetadata?: { framework?: string; backend?: string; database?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  ): NarratorReport['techStack'] {
    const frontend: string[] = [];
    const backend: string[] = [];
    const database: string[] = [];
    const infrastructure: string[] = [];

    // Из метаданных проекта
    if (projectMetadata?.framework) frontend.push(projectMetadata.framework);
    if (projectMetadata?.backend) backend.push(projectMetadata.backend);
    if (projectMetadata?.database) database.push(projectMetadata.database);

    // Merge all dependencies
    const allDeps = { ...(projectMetadata?.dependencies || {}), ...(projectMetadata?.devDependencies || {}) };
    const depNames = Object.keys(allDeps);

    // Frontend frameworks
    if (depNames.includes('vue') || depNames.includes('@vue/cli-service')) frontend.push('Vue.js');
    if (depNames.includes('react') || depNames.includes('react-dom')) frontend.push('React');
    if (depNames.includes('@angular/core')) frontend.push('Angular');
    if (depNames.includes('svelte')) frontend.push('Svelte');
    if (depNames.includes('next')) frontend.push('Next.js');
    if (depNames.includes('nuxt') || depNames.includes('nuxt3')) frontend.push('Nuxt.js');

    // Vue ecosystem
    if (depNames.includes('quasar') || depNames.includes('@quasar/extras') || depNames.includes('@quasar/app-vite') || depNames.includes('@quasar/app-webpack')) frontend.push('Quasar');
    if (depNames.includes('pinia')) frontend.push('Pinia');
    if (depNames.includes('vuex')) frontend.push('Vuex');
    if (depNames.includes('vue-router')) frontend.push('Vue Router');
    if (depNames.includes('vuetify')) frontend.push('Vuetify');
    if (depNames.includes('element-plus') || depNames.includes('element-ui')) frontend.push('Element UI');

    // CSS frameworks
    if (depNames.includes('tailwindcss')) frontend.push('Tailwind CSS');

    // Detect Vue 3 Composition API from file contents
    const allFilePaths = [...fileAnalysis.filesByDirectory.values()].flat();
    const hasScriptSetup = allFilePaths.some(f => f.endsWith('.vue'));
    if (hasScriptSetup && depNames.includes('vue')) {
      // Check Vue version
      const vueVersion = allDeps['vue'] || '';
      if (vueVersion.startsWith('3') || vueVersion.startsWith('^3') || vueVersion.startsWith('~3')) {
        frontend.push('Vue 3');
      }
    }

    // Build tools
    if (depNames.includes('vite')) infrastructure.push('Vite');
    if (depNames.includes('webpack') || depNames.includes('webpack-cli')) infrastructure.push('Webpack');

    // Backend frameworks
    if (depNames.includes('express')) backend.push('Express.js');
    if (depNames.includes('fastify')) backend.push('Fastify');
    if (depNames.includes('@nestjs/core')) backend.push('NestJS');
    if (depNames.includes('koa')) backend.push('Koa');

    // Из структуры файлов
    const dirs = [...fileAnalysis.filesByDirectory.keys()].join(' ');

    // File/dir-based detection
    if (dirs.includes('quasar.conf') || dirs.includes('quasar.config')) frontend.push('Quasar');

    // PHP frameworks
    if (dirs.includes('laravel') || dirs.includes('app/Http')) backend.push('Laravel');
    if (dirs.includes('symfony')) backend.push('Symfony');
    if (dirs.includes('bitrix') || dirs.includes('local/modules')) backend.push('Bitrix');
    if (dirs.includes('yii')) backend.push('Yii');
    if (dirs.includes('wordpress') || dirs.includes('wp-content')) backend.push('WordPress');

    // Python backends
    if (depNames.includes('django') || dirs.includes('django')) backend.push('Django');
    if (depNames.includes('flask')) backend.push('Flask');
    if (depNames.includes('fastapi')) backend.push('FastAPI');

    // Database
    if (depNames.some(d => d === 'mysql' || d === 'mysql2')) database.push('MySQL');
    if (depNames.some(d => d === 'pg' || d === 'postgres')) database.push('PostgreSQL');
    if (depNames.some(d => d === 'mongodb' || d === 'mongoose')) database.push('MongoDB');
    if (depNames.some(d => d === 'redis' || d === 'ioredis')) database.push('Redis');
    if (depNames.some(d => d === 'sqlite3' || d === 'better-sqlite3')) database.push('SQLite');

    // Infrastructure
    if (depNames.some(d => d.includes('docker'))) infrastructure.push('Docker');
    if (dirs.includes('kubernetes') || dirs.includes('k8s')) infrastructure.push('Kubernetes');
    if (depNames.some(d => d.includes('aws-sdk'))) infrastructure.push('AWS');

    // Дедупликация
    return {
      frontend: [...new Set(frontend)],
      backend: [...new Set(backend)],
      database: [...new Set(database)],
      infrastructure: [...new Set(infrastructure)],
    };
  }

  /**
   * Анализ символов
   */
  private analyzeSymbols(symbols: Map<string, Symbol>): {
    byKind: Map<string, number>;
    byFile: Map<string, number>;
    complexSymbols: Symbol[];
  } {
    const byKind = new Map<string, number>();
    const byFile = new Map<string, number>();
    const complexSymbols: Symbol[] = [];

    for (const symbol of symbols.values()) {
      // По типу
      byKind.set(symbol.kind, (byKind.get(symbol.kind) || 0) + 1);

      // По файлу
      byFile.set(symbol.filePath, (byFile.get(symbol.filePath) || 0) + 1);

      // Сложные символы (много ссылок)
      if (symbol.references.length > 20) {
        complexSymbols.push(symbol);
      }
    }

    return { byKind, byFile, complexSymbols };
  }

  /**
   * Определение архитектуры
   */
  private detectArchitecture(
    _graph: DependencyGraph,
    _symbols: Map<string, Symbol>,
    fileAnalysis: ReturnType<typeof this.analyzeFiles>
  ): NarratorReport['architecture'] {
    const patterns: DetectedPattern[] = [];
    const layers: ArchitectureLayer[] = [];
    let detectedArch = 'Unknown';
    let confidence = 0;

    const dirs = [...fileAnalysis.filesByDirectory.keys()];
    const allFiles = [...fileAnalysis.filesByDirectory.values()].flat();

    // MVC Detection
    const hasControllers = dirs.some(d => d.includes('controller') || d.includes('Controller'));
    const hasModels = dirs.some(d => d.includes('model') || d.includes('Model') || d.includes('entities'));
    const hasViews = dirs.some(d => d.includes('view') || d.includes('View') || d.includes('templates'));

    if (hasControllers && hasModels) {
      patterns.push({
        name: 'MVC',
        confidence: hasViews ? 90 : 70,
        evidence: [
          hasControllers ? 'Controllers directory found' : '',
          hasModels ? 'Models directory found' : '',
          hasViews ? 'Views directory found' : '',
        ].filter(Boolean),
        files: dirs.filter(d =>
          d.includes('controller') || d.includes('model') || d.includes('view')
        ),
      });
    }

    // Clean Architecture Detection
    const hasDomain = dirs.some(d => d.includes('domain') || d.includes('entities'));
    const hasUseCases = dirs.some(d => d.includes('usecase') || d.includes('use-case') || d.includes('application'));
    const hasInfra = dirs.some(d => d.includes('infrastructure') || d.includes('infra'));

    if (hasDomain && (hasUseCases || hasInfra)) {
      patterns.push({
        name: 'Clean Architecture',
        confidence: hasUseCases && hasInfra ? 85 : 60,
        evidence: [
          hasDomain ? 'Domain layer found' : '',
          hasUseCases ? 'Use Cases layer found' : '',
          hasInfra ? 'Infrastructure layer found' : '',
        ].filter(Boolean),
        files: dirs.filter(d =>
          d.includes('domain') || d.includes('usecase') || d.includes('infrastructure')
        ),
      });
    }

    // Repository Pattern
    const hasRepositories = dirs.some(d => d.includes('repositor'));
    if (hasRepositories) {
      patterns.push({
        name: 'Repository Pattern',
        confidence: 80,
        evidence: ['Repository directory/files found'],
        files: dirs.filter(d => d.includes('repositor')),
      });
    }

    // Service Layer
    const hasServices = dirs.some(d => d.includes('service') || d.includes('Service'));
    if (hasServices) {
      patterns.push({
        name: 'Service Layer',
        confidence: 85,
        evidence: ['Services directory found'],
        files: dirs.filter(d => d.includes('service')),
      });
    }

    // Vue SPA Detection
    const hasComponents = dirs.some(d => /\/components\b/i.test(d));
    const hasVueViews = dirs.some(d => /\/views\b/i.test(d));
    const hasStore = dirs.some(d => /\/(store|stores)\b/i.test(d));
    const hasRouter = dirs.some(d => /\/router\b/i.test(d));
    const hasComposables = dirs.some(d => /\/composables\b/i.test(d));
    const hasPages = dirs.some(d => /\/pages\b/i.test(d));
    const hasLayouts = dirs.some(d => /\/layouts\b/i.test(d));

    if (hasComponents && (hasVueViews || hasPages) && hasStore) {
      const evidence: string[] = [];
      if (hasComponents) evidence.push('Components directory found');
      if (hasVueViews) evidence.push('Views directory found');
      if (hasStore) evidence.push('Store directory found');
      if (hasRouter) evidence.push('Router directory found');
      if (hasComposables) evidence.push('Composables directory found (Composition API)');

      patterns.push({
        name: 'Vue SPA',
        confidence: hasRouter ? 85 : 75,
        evidence,
        files: dirs.filter(d => /\/(components|views|store|stores|router|composables)\b/i.test(d)),
      });
    }

    if (hasComposables) {
      patterns.push({
        name: 'Composition API Pattern',
        confidence: 90,
        evidence: ['Composables directory found'],
        files: dirs.filter(d => /\/composables\b/i.test(d)),
      });
    }

    if (hasPages && hasLayouts) {
      patterns.push({
        name: 'File-based Routing',
        confidence: 80,
        evidence: ['Pages directory found', 'Layouts directory found'],
        files: dirs.filter(d => /\/(pages|layouts)\b/i.test(d)),
      });
    }

    // Определяем основную архитектуру
    if (patterns.length > 0) {
      const bestPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];
      detectedArch = bestPattern.name;
      confidence = bestPattern.confidence;
    }

    // Формируем слои
    const layerMappings: Array<{ name: string; patterns: string[]; role: string }> = [
      { name: 'Presentation', patterns: ['controller', 'view', 'component', 'page'], role: 'UI and API endpoints' },
      { name: 'Application', patterns: ['service', 'usecase', 'handler'], role: 'Business logic orchestration' },
      { name: 'Domain', patterns: ['model', 'entity', 'domain', 'core'], role: 'Business rules and entities' },
      { name: 'Infrastructure', patterns: ['repository', 'database', 'api', 'external'], role: 'External integrations' },
    ];

    for (const mapping of layerMappings) {
      const layerFiles = allFiles.filter(f =>
        mapping.patterns.some(p => f.toLowerCase().includes(p))
      );

      if (layerFiles.length > 0) {
        layers.push({
          name: mapping.name,
          files: layerFiles,
          coverage: Math.round((layerFiles.length / allFiles.length) * 100),
          role: mapping.role,
        });
      }
    }

    return {
      detected: detectedArch,
      confidence,
      layers,
      patterns,
    };
  }

  /**
   * Поиск проблем
   */
  private findProblems(
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    _fileContents: Map<string, string>,
    fileAnalysis: ReturnType<typeof this.analyzeFiles>
  ): ProblemArea[] {
    const problems: ProblemArea[] = [];

    // 1. Большие файлы (God Objects)
    for (const { path, lines } of fileAnalysis.largeFiles) {
      if (lines > 1000) {
        problems.push({
          severity: 'critical',
          title: 'God Object',
          description: `File ${this.shortPath(path)} has ${lines} lines - likely too many responsibilities`,
          files: [path],
          suggestion: 'Split into smaller, focused modules with single responsibility',
        });
      } else if (lines > 500) {
        problems.push({
          severity: 'warning',
          title: 'Large File',
          description: `File ${this.shortPath(path)} has ${lines} lines`,
          files: [path],
          suggestion: 'Consider breaking into smaller modules',
        });
      }
    }

    // 2. Файлы с большим количеством символов (высокая сложность)
    const symbolsPerFile = new Map<string, number>();
    for (const symbol of symbols.values()) {
      symbolsPerFile.set(symbol.filePath, (symbolsPerFile.get(symbol.filePath) || 0) + 1);
    }

    for (const [file, count] of symbolsPerFile) {
      if (count > 50) {
        problems.push({
          severity: 'warning',
          title: 'High Complexity',
          description: `File ${this.shortPath(file)} has ${count} symbols - may be too complex`,
          files: [file],
          suggestion: 'Extract related functions into separate modules',
        });
      }
    }

    // 3. Circular dependencies (если есть в графе)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const detectCycle = (nodeId: string, path: string[] = []): void => {
      if (recursionStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }
      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const edges = graph.edges.get(nodeId) || [];
      for (const edge of edges) {
        detectCycle(edge.to, [...path, nodeId]);
      }

      recursionStack.delete(nodeId);
    };

    for (const nodeId of graph.nodes.keys()) {
      detectCycle(nodeId);
    }

    if (cycles.length > 0) {
      problems.push({
        severity: 'critical',
        title: 'Circular Dependencies',
        description: `Found ${cycles.length} circular dependency chains`,
        files: cycles.flat().slice(0, 10),
        suggestion: 'Break cycles by introducing interfaces or restructuring modules',
      });
    }

    // 4. Файлы без очевидной структуры
    const unstructuredDirs = [...fileAnalysis.filesByDirectory.entries()]
      .filter(([dir, files]) => {
        // Много файлов в одной директории без подпапок
        return files.length > 20 && !dir.includes('/');
      });

    if (unstructuredDirs.length > 0) {
      problems.push({
        severity: 'info',
        title: 'Flat Structure',
        description: 'Many files in root directories without clear organization',
        files: unstructuredDirs.flatMap(([, files]) => files.slice(0, 5)),
        suggestion: 'Organize files into feature-based or layer-based directories',
      });
    }

    return problems.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Генерация рекомендаций
   */
  private generateRecommendations(
    problems: ProblemArea[],
    architecture: NarratorReport['architecture']
  ): string[] {
    const recommendations: string[] = [];

    // Из проблем
    const criticalProblems = problems.filter(p => p.severity === 'critical');
    if (criticalProblems.length > 0) {
      recommendations.push(
        `Address ${criticalProblems.length} critical issues first: ${criticalProblems.map(p => p.title).join(', ')}`
      );
    }

    // Архитектурные
    if (architecture.confidence < 50) {
      recommendations.push(
        'Define clear architectural boundaries - current structure is unclear'
      );
    }

    if (!architecture.patterns.some(p => p.name === 'Repository Pattern')) {
      recommendations.push(
        'Consider implementing Repository Pattern to separate data access logic'
      );
    }

    if (architecture.layers.length < 3) {
      recommendations.push(
        'Structure code into clear layers (Presentation, Business, Data) for better maintainability'
      );
    }

    // Общие best practices
    if (problems.some(p => p.title === 'God Object')) {
      recommendations.push(
        'Apply Single Responsibility Principle - each module should do one thing well'
      );
    }

    return recommendations;
  }

  /**
   * Генерация человекопонятного текста
   */
  private generateNarrative(
    fileAnalysis: ReturnType<typeof this.analyzeFiles>,
    techStack: NarratorReport['techStack'],
    architecture: NarratorReport['architecture'],
    problems: ProblemArea[],
    recommendations: string[],
    language: 'en' | 'ru'
  ): string {
    if (language === 'ru') {
      return this.generateNarrativeRu(fileAnalysis, techStack, architecture, problems, recommendations);
    }

    const lines: string[] = [];

    // Header
    lines.push('# Project Architecture Analysis\n');

    // Summary
    const projectType = this.detectProjectType(techStack, fileAnalysis);
    lines.push(`## Overview\n`);
    lines.push(`This is a **${projectType}** with ${fileAnalysis.totalFiles} files and approximately ${fileAnalysis.totalLines.toLocaleString()} lines of code.\n`);

    // Tech Stack
    lines.push(`## Technology Stack\n`);
    if (techStack.frontend.length > 0) {
      lines.push(`- **Frontend:** ${techStack.frontend.join(', ')}`);
    }
    if (techStack.backend.length > 0) {
      lines.push(`- **Backend:** ${techStack.backend.join(', ')}`);
    }
    if (techStack.database.length > 0) {
      lines.push(`- **Database:** ${techStack.database.join(', ')}`);
    }
    lines.push('');

    // Architecture
    lines.push(`## Architecture\n`);
    lines.push(`**Detected Pattern:** ${architecture.detected} (${architecture.confidence}% confidence)\n`);

    if (architecture.layers.length > 0) {
      lines.push('**Layers:**');
      for (const layer of architecture.layers) {
        lines.push(`- ${layer.name}: ${layer.files.length} files (${layer.coverage}%) - ${layer.role}`);
      }
    }
    lines.push('');

    // Problems
    if (problems.length > 0) {
      lines.push(`## Issues Found\n`);
      const criticalCount = problems.filter(p => p.severity === 'critical').length;
      const warningCount = problems.filter(p => p.severity === 'warning').length;

      lines.push(`Found **${criticalCount} critical** and **${warningCount} warning** issues:\n`);

      for (const problem of problems.slice(0, 5)) {
        const icon = problem.severity === 'critical' ? '🔴' : problem.severity === 'warning' ? '🟡' : '🔵';
        lines.push(`${icon} **${problem.title}**: ${problem.description}`);
        lines.push(`   → ${problem.suggestion}\n`);
      }
    }

    // Recommendations
    if (recommendations.length > 0) {
      lines.push(`## Recommendations\n`);
      for (let i = 0; i < Math.min(recommendations.length, 5); i++) {
        lines.push(`${i + 1}. ${recommendations[i]}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Генерация нарратива на русском
   */
  private generateNarrativeRu(
    fileAnalysis: ReturnType<typeof this.analyzeFiles>,
    techStack: NarratorReport['techStack'],
    architecture: NarratorReport['architecture'],
    problems: ProblemArea[],
    recommendations: string[]
  ): string {
    const lines: string[] = [];

    // Заголовок
    lines.push('# Анализ архитектуры проекта\n');

    // Обзор
    const projectType = this.detectProjectType(techStack, fileAnalysis);
    lines.push(`## Обзор\n`);
    lines.push(`Это **${this.translateProjectType(projectType)}** с ${fileAnalysis.totalFiles} файлами и примерно ${fileAnalysis.totalLines.toLocaleString()} строками кода.\n`);
    lines.push(`Основной язык: **${fileAnalysis.primaryLanguage}**`);
    if (fileAnalysis.secondaryLanguages.length > 0) {
      lines.push(`Дополнительные: ${fileAnalysis.secondaryLanguages.join(', ')}`);
    }
    lines.push('');

    // Стек технологий
    lines.push(`## Стек технологий\n`);
    if (techStack.frontend.length > 0) {
      lines.push(`- **Frontend:** ${techStack.frontend.join(', ')}`);
    }
    if (techStack.backend.length > 0) {
      lines.push(`- **Backend:** ${techStack.backend.join(', ')}`);
    }
    if (techStack.database.length > 0) {
      lines.push(`- **База данных:** ${techStack.database.join(', ')}`);
    }
    if (techStack.infrastructure.length > 0) {
      lines.push(`- **Инфраструктура:** ${techStack.infrastructure.join(', ')}`);
    }
    lines.push('');

    // Архитектура
    lines.push(`## Архитектура\n`);
    lines.push(`**Обнаружен паттерн:** ${architecture.detected} (уверенность ${architecture.confidence}%)\n`);

    if (architecture.layers.length > 0) {
      lines.push('**Слои:**');
      for (const layer of architecture.layers) {
        lines.push(`- ${this.translateLayer(layer.name)}: ${layer.files.length} файлов (${layer.coverage}%)`);
      }
    }

    if (architecture.patterns.length > 0) {
      lines.push('\n**Используемые паттерны:**');
      for (const pattern of architecture.patterns) {
        lines.push(`- ${pattern.name} (${pattern.confidence}%)`);
      }
    }
    lines.push('');

    // Проблемы
    if (problems.length > 0) {
      lines.push(`## Проблемные места\n`);
      const criticalCount = problems.filter(p => p.severity === 'critical').length;
      const warningCount = problems.filter(p => p.severity === 'warning').length;

      lines.push(`Найдено **${criticalCount} критических** и **${warningCount} предупреждений**:\n`);

      for (const problem of problems.slice(0, 7)) {
        const icon = problem.severity === 'critical' ? '🔴' : problem.severity === 'warning' ? '🟡' : '🔵';
        lines.push(`${icon} **${this.translateProblem(problem.title)}**`);
        lines.push(`   ${problem.description}`);
        lines.push(`   💡 ${this.translateSuggestion(problem.suggestion)}\n`);
      }
    }

    // Рекомендации
    if (recommendations.length > 0) {
      lines.push(`## Рекомендации\n`);
      for (let i = 0; i < Math.min(recommendations.length, 5); i++) {
        lines.push(`${i + 1}. ${this.translateRecommendation(recommendations[i])}`);
      }
    }

    return lines.join('\n');
  }

  // Вспомогательные методы

  private extToLanguage(ext: string): string {
    const map: Record<string, string> = {
      'ts': 'TypeScript', 'tsx': 'TypeScript',
      'js': 'JavaScript', 'jsx': 'JavaScript', 'mjs': 'JavaScript',
      'vue': 'Vue', 'svelte': 'Svelte',
      'php': 'PHP',
      'py': 'Python',
      'java': 'Java', 'kt': 'Kotlin',
      'cs': 'C#',
      'go': 'Go',
      'rs': 'Rust',
      'rb': 'Ruby',
      'swift': 'Swift',
      'css': 'CSS', 'scss': 'SCSS', 'less': 'LESS',
      'html': 'HTML',
      'sql': 'SQL',
      'json': 'JSON', 'yaml': 'YAML', 'yml': 'YAML',
    };
    return map[ext] || ext.toUpperCase();
  }

  private shortPath(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts.length > 3
      ? `.../${parts.slice(-3).join('/')}`
      : path;
  }

  private detectProjectType(
    techStack: NarratorReport['techStack'],
    fileAnalysis: ReturnType<typeof this.analyzeFiles>
  ): string {
    const { frontend, backend } = techStack;
    const { primaryLanguage } = fileAnalysis;

    if (frontend.length > 0 && backend.length > 0) {
      return `Full-stack ${frontend[0]} + ${backend[0]} application`;
    }
    if (frontend.length > 0) {
      return `${frontend[0]} frontend application`;
    }
    if (backend.length > 0) {
      return `${backend[0]} backend application`;
    }
    if (primaryLanguage === 'PHP') {
      return 'PHP web application';
    }
    if (primaryLanguage === 'Python') {
      return 'Python application';
    }
    return `${primaryLanguage} project`;
  }

  private translateProjectType(type: string): string {
    return type
      .replace('Full-stack', 'Полнoстековое')
      .replace('frontend application', 'фронтенд приложение')
      .replace('backend application', 'бэкенд приложение')
      .replace('web application', 'веб-приложение')
      .replace('application', 'приложение')
      .replace('project', 'проект');
  }

  private translateLayer(layer: string): string {
    const map: Record<string, string> = {
      'Presentation': 'Представление',
      'Application': 'Приложение',
      'Domain': 'Домен',
      'Infrastructure': 'Инфраструктура',
    };
    return map[layer] || layer;
  }

  private translateProblem(title: string): string {
    const map: Record<string, string> = {
      'God Object': 'God Object (слишком большой файл)',
      'Large File': 'Большой файл',
      'High Complexity': 'Высокая сложность',
      'Circular Dependencies': 'Циклические зависимости',
      'Flat Structure': 'Плоская структура',
    };
    return map[title] || title;
  }

  private translateSuggestion(suggestion: string): string {
    return suggestion
      .replace('Split into smaller', 'Разбейте на меньшие')
      .replace('Consider breaking', 'Рассмотрите разбиение')
      .replace('Extract related functions', 'Вынесите связанные функции')
      .replace('Break cycles by', 'Разорвите циклы через')
      .replace('Organize files into', 'Организуйте файлы в')
      .replace('focused modules', 'модули с одной ответственностью')
      .replace('feature-based', 'фича-ориентированные')
      .replace('layer-based', 'слой-ориентированные')
      .replace('directories', 'директории');
  }

  private translateRecommendation(rec: string): string {
    return rec
      .replace('Address', 'Решите')
      .replace('critical issues first', 'критические проблемы в первую очередь')
      .replace('Define clear architectural boundaries', 'Определите чёткие архитектурные границы')
      .replace('current structure is unclear', 'текущая структура неясна')
      .replace('Consider implementing', 'Рассмотрите внедрение')
      .replace('to separate data access logic', 'для разделения логики доступа к данным')
      .replace('Structure code into clear layers', 'Структурируйте код в чёткие слои')
      .replace('for better maintainability', 'для лучшей поддерживаемости')
      .replace('Apply Single Responsibility Principle', 'Применяйте принцип единой ответственности')
      .replace('each module should do one thing well', 'каждый модуль должен делать одно дело хорошо');
  }
}
