/**
 * Project Analyzer - анализ package.json для определения стека технологий
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ProjectMetadata } from '../types/index.js';
import { Logger } from './logger.js';

/**
 * Анализирует package.json проекта и определяет используемые технологии
 */
export function analyzeProjectStack(projectPath: string): ProjectMetadata | null {
  try {
    const packageJsonPath = join(projectPath, 'package.json');

    if (!existsSync(packageJsonPath)) {
      Logger.warn('package.json not found in project');
      return null;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };

    const metadata: ProjectMetadata = {
      dependencies: deps,
      devDependencies: devDeps
    };

    // Определяем frontend framework
    if (allDeps['vue'] || allDeps['@vue/cli']) {
      metadata.framework = 'Vue.js';
    } else if (allDeps['react'] || allDeps['react-dom']) {
      metadata.framework = 'React';
    } else if (allDeps['@angular/core']) {
      metadata.framework = 'Angular';
    } else if (allDeps['svelte']) {
      metadata.framework = 'Svelte';
    } else if (allDeps['next']) {
      metadata.framework = 'Next.js (React)';
    } else if (allDeps['nuxt']) {
      metadata.framework = 'Nuxt.js (Vue)';
    } else if (allDeps['@remix-run/react']) {
      metadata.framework = 'Remix (React)';
    } else {
      // Проверяем есть ли хоть что-то frontend
      const hasFrontend = ['jquery', 'bootstrap', 'tailwindcss', '@mui/material'].some(dep => allDeps[dep]);
      metadata.framework = hasFrontend ? 'Vanilla JS (no framework)' : 'None (backend only)';
    }

    // Определяем backend framework
    if (allDeps['express']) {
      metadata.backend = 'Express';
    } else if (allDeps['fastify']) {
      metadata.backend = 'Fastify';
    } else if (allDeps['@nestjs/core']) {
      metadata.backend = 'NestJS';
    } else if (allDeps['koa']) {
      metadata.backend = 'Koa';
    } else if (allDeps['hapi']) {
      metadata.backend = 'Hapi';
    }

    // Определяем database
    if (allDeps['pg'] || allDeps['postgres']) {
      metadata.database = 'PostgreSQL';
    } else if (allDeps['mongodb'] || allDeps['mongoose']) {
      metadata.database = 'MongoDB';
    } else if (allDeps['mysql'] || allDeps['mysql2']) {
      metadata.database = 'MySQL';
    } else if (allDeps['sqlite3'] || allDeps['better-sqlite3']) {
      metadata.database = 'SQLite';
    } else if (allDeps['redis'] || allDeps['ioredis']) {
      metadata.database = 'Redis';
    }

    // Определяем build tool
    if (allDeps['vite'] || devDeps['vite']) {
      metadata.buildTool = 'Vite';
    } else if (allDeps['webpack'] || devDeps['webpack']) {
      metadata.buildTool = 'Webpack';
    } else if (allDeps['rollup'] || devDeps['rollup']) {
      metadata.buildTool = 'Rollup';
    } else if (allDeps['parcel'] || devDeps['parcel']) {
      metadata.buildTool = 'Parcel';
    } else if (allDeps['esbuild'] || devDeps['esbuild']) {
      metadata.buildTool = 'esbuild';
    }

    Logger.info(`Project stack detected: ${metadata.framework || 'Unknown'} + ${metadata.backend || 'Unknown'}`);

    return metadata;
  } catch (error) {
    Logger.error('Failed to analyze project stack:', error);
    return null;
  }
}

/**
 * Создает человекочитаемое описание стека проекта
 */
export function describeProjectStack(metadata: ProjectMetadata | null): string {
  if (!metadata) {
    return 'Unknown stack (package.json not found)';
  }

  const parts: string[] = [];

  if (metadata.framework && metadata.framework !== 'None (backend only)') {
    parts.push(`Frontend: ${metadata.framework}`);
  }

  if (metadata.backend) {
    parts.push(`Backend: ${metadata.backend}`);
  }

  if (metadata.database) {
    parts.push(`Database: ${metadata.database}`);
  }

  if (metadata.buildTool) {
    parts.push(`Build: ${metadata.buildTool}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Minimal project (no major frameworks)';
}
