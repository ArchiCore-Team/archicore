/**
 * Documentation Generator
 *
 * Генератор качественной проектной документации.
 * Фокус на описании архитектуры, не на проблемах.
 */

import { DependencyGraph, Symbol } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface ProjectDocumentation {
  /** Название проекта */
  projectName: string;
  /** Полная документация в Markdown */
  markdown: string;
  /** Секции документации */
  sections: DocumentationSection[];
}

export interface DocumentationSection {
  title: string;
  content: string;
}

interface FileInfo {
  path: string;
  language: string;
  size: number;
}

interface ComponentInfo {
  name: string;
  path: string;
  type: 'page' | 'component' | 'layout' | 'widget' | 'util';
  description: string;
  props?: string[];
  emits?: string[];
  imports?: string[];
}

interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
  handler?: string;
}

interface StoreModule {
  name: string;
  path: string;
  type: 'vuex' | 'pinia' | 'redux' | 'mobx' | 'zustand';
  state?: string[];
  actions?: string[];
  getters?: string[];
}

/**
 * Генератор документации проекта
 */
export class DocumentationGenerator {

  /**
   * Генерация полной документации проекта
   */
  async generate(
    projectName: string,
    graph: DependencyGraph,
    symbols: Map<string, Symbol>,
    fileContents: Map<string, string>,
    metadata?: {
      framework?: string;
      backend?: string;
      database?: string;
      dependencies?: Record<string, string>;
    }
  ): Promise<ProjectDocumentation> {
    Logger.info('Generating project documentation...');

    const files = this.extractFileInfo(graph);
    const stack = this.detectFullStack(files, fileContents, metadata);
    const structure = this.analyzeProjectStructure(files, fileContents);
    const components = this.extractComponents(files, fileContents, symbols);
    const api = this.extractApiEndpoints(files, fileContents, symbols);
    const stores = this.extractStores(files, fileContents, symbols);
    const routing = this.extractRouting(files, fileContents);
    const config = this.extractConfiguration(files, fileContents);

    const sections: DocumentationSection[] = [];

    // 1. Overview - подробное описание проекта
    sections.push({
      title: 'Overview',
      content: this.generateOverview(projectName, stack, structure, files)
    });

    // 2. Technology Stack - детальный стек
    sections.push({
      title: 'Technology Stack',
      content: this.generateStackSection(stack)
    });

    // 3. Project Structure - структура проекта
    sections.push({
      title: 'Project Structure',
      content: this.generateStructureSection(structure)
    });

    // 4. Architecture - архитектура
    sections.push({
      title: 'Architecture',
      content: this.generateArchitectureSection(structure, components, stores)
    });

    // 5. Components - компоненты (для фронтенда)
    if (components.length > 0) {
      sections.push({
        title: 'Components',
        content: this.generateComponentsSection(components)
      });
    }

    // 6. State Management - управление состоянием
    if (stores.length > 0) {
      sections.push({
        title: 'State Management',
        content: this.generateStoresSection(stores)
      });
    }

    // 7. Routing - роутинг
    if (routing.routes.length > 0) {
      sections.push({
        title: 'Routing',
        content: this.generateRoutingSection(routing)
      });
    }

    // 8. API Endpoints - эндпоинты (для бэкенда)
    if (api.length > 0) {
      sections.push({
        title: 'API Endpoints',
        content: this.generateApiSection(api)
      });
    }

    // 9. Configuration - конфигурация
    if (config.files.length > 0) {
      sections.push({
        title: 'Configuration',
        content: this.generateConfigSection(config)
      });
    }

    // 10. Dependencies - зависимости
    sections.push({
      title: 'Key Dependencies',
      content: this.generateDependenciesSection(stack)
    });

    // Собираем Markdown
    const markdown = this.buildMarkdown(projectName, sections);

    Logger.success('Documentation generated successfully');

    return {
      projectName,
      markdown,
      sections
    };
  }

  private extractFileInfo(graph: DependencyGraph): FileInfo[] {
    const files: FileInfo[] = [];

    // graph.nodes is a Map<string, GraphNode>
    for (const [nodeId] of graph.nodes) {
      files.push({
        path: this.cleanPath(nodeId),
        language: this.detectLanguage(nodeId),
        size: 0 // будет заполнено позже
      });
    }

    return files;
  }

  private cleanPath(filePath: string): string {
    // Убираем серверные пути
    const patterns = [
      /^.*\.archicore[\/\\]projects[\/\\][^\/\\]+[\/\\][^\/\\]+[\/\\]/,
      /^.*\.archicore[\/\\]projects[\/\\][^\/\\]+[\/\\]/,
      /^\/app\/.archicore\/projects\/[^/]+\/[^/]+\//,
    ];

    let clean = filePath;
    for (const pattern of patterns) {
      clean = clean.replace(pattern, '');
    }

    return clean;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      'ts': 'TypeScript', 'tsx': 'TypeScript',
      'js': 'JavaScript', 'jsx': 'JavaScript',
      'vue': 'Vue', 'svelte': 'Svelte',
      'py': 'Python', 'go': 'Go', 'rs': 'Rust',
      'java': 'Java', 'kt': 'Kotlin',
      'cs': 'C#', 'php': 'PHP', 'rb': 'Ruby',
      'css': 'CSS', 'scss': 'SCSS', 'less': 'LESS',
      'html': 'HTML', 'json': 'JSON', 'yaml': 'YAML',
      'sql': 'SQL', 'graphql': 'GraphQL'
    };
    return langMap[ext] || ext.toUpperCase();
  }

  private detectFullStack(
    _files: FileInfo[],
    fileContents: Map<string, string>,
    metadata?: { framework?: string; backend?: string; database?: string; dependencies?: Record<string, string> }
  ): ProjectStack {
    const stack: ProjectStack = {
      type: 'unknown',
      frontend: null,
      backend: null,
      database: null,
      styling: [],
      testing: [],
      buildTools: [],
      deployment: [],
      dependencies: {}
    };

    // Анализируем package.json
    for (const [path, content] of fileContents) {
      if (path.endsWith('package.json') && !path.includes('node_modules')) {
        try {
          const pkg = JSON.parse(content);
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          stack.dependencies = allDeps;

          // Frontend Framework
          if (allDeps['vue'] || allDeps['@vue/cli-service']) {
            stack.frontend = {
              name: 'Vue.js',
              version: allDeps['vue'] || '',
              variant: allDeps['nuxt'] ? 'Nuxt.js' : allDeps['@quasar/extras'] ? 'Quasar' : 'Vue CLI'
            };
            stack.type = 'frontend';
          } else if (allDeps['react'] || allDeps['react-dom']) {
            stack.frontend = {
              name: 'React',
              version: allDeps['react'] || '',
              variant: allDeps['next'] ? 'Next.js' : allDeps['gatsby'] ? 'Gatsby' : 'Create React App'
            };
            stack.type = 'frontend';
          } else if (allDeps['@angular/core']) {
            stack.frontend = {
              name: 'Angular',
              version: allDeps['@angular/core'] || '',
              variant: 'Angular CLI'
            };
            stack.type = 'frontend';
          } else if (allDeps['svelte']) {
            stack.frontend = {
              name: 'Svelte',
              version: allDeps['svelte'] || '',
              variant: allDeps['@sveltejs/kit'] ? 'SvelteKit' : 'Svelte'
            };
            stack.type = 'frontend';
          }

          // Backend Framework
          if (allDeps['express']) {
            stack.backend = { name: 'Express.js', version: allDeps['express'] };
            stack.type = stack.frontend ? 'fullstack' : 'backend';
          } else if (allDeps['fastify']) {
            stack.backend = { name: 'Fastify', version: allDeps['fastify'] };
            stack.type = stack.frontend ? 'fullstack' : 'backend';
          } else if (allDeps['@nestjs/core']) {
            stack.backend = { name: 'NestJS', version: allDeps['@nestjs/core'] };
            stack.type = stack.frontend ? 'fullstack' : 'backend';
          } else if (allDeps['koa']) {
            stack.backend = { name: 'Koa', version: allDeps['koa'] };
            stack.type = stack.frontend ? 'fullstack' : 'backend';
          }

          // Database
          if (allDeps['prisma'] || allDeps['@prisma/client']) {
            stack.database = { name: 'Prisma ORM', type: 'ORM' };
          } else if (allDeps['typeorm']) {
            stack.database = { name: 'TypeORM', type: 'ORM' };
          } else if (allDeps['sequelize']) {
            stack.database = { name: 'Sequelize', type: 'ORM' };
          } else if (allDeps['mongoose']) {
            stack.database = { name: 'MongoDB (Mongoose)', type: 'NoSQL' };
          } else if (allDeps['pg'] || allDeps['postgres']) {
            stack.database = { name: 'PostgreSQL', type: 'SQL' };
          } else if (allDeps['mysql'] || allDeps['mysql2']) {
            stack.database = { name: 'MySQL', type: 'SQL' };
          }

          // Styling
          if (allDeps['tailwindcss']) stack.styling.push('Tailwind CSS');
          if (allDeps['sass'] || allDeps['node-sass']) stack.styling.push('SASS/SCSS');
          if (allDeps['styled-components']) stack.styling.push('Styled Components');
          if (allDeps['@emotion/react']) stack.styling.push('Emotion');
          if (allDeps['bootstrap']) stack.styling.push('Bootstrap');
          if (allDeps['vuetify']) stack.styling.push('Vuetify');
          if (allDeps['element-plus'] || allDeps['element-ui']) stack.styling.push('Element UI');
          if (allDeps['antd'] || allDeps['ant-design-vue']) stack.styling.push('Ant Design');

          // Testing
          if (allDeps['jest']) stack.testing.push('Jest');
          if (allDeps['vitest']) stack.testing.push('Vitest');
          if (allDeps['mocha']) stack.testing.push('Mocha');
          if (allDeps['cypress']) stack.testing.push('Cypress');
          if (allDeps['playwright']) stack.testing.push('Playwright');
          if (allDeps['@testing-library/react'] || allDeps['@testing-library/vue']) {
            stack.testing.push('Testing Library');
          }

          // Build Tools
          if (allDeps['vite']) stack.buildTools.push('Vite');
          if (allDeps['webpack']) stack.buildTools.push('Webpack');
          if (allDeps['esbuild']) stack.buildTools.push('esbuild');
          if (allDeps['rollup']) stack.buildTools.push('Rollup');
          if (allDeps['parcel']) stack.buildTools.push('Parcel');
          if (allDeps['turbo']) stack.buildTools.push('Turborepo');

          // State Management
          if (allDeps['vuex']) stack.stateManagement = 'Vuex';
          if (allDeps['pinia']) stack.stateManagement = 'Pinia';
          if (allDeps['redux'] || allDeps['@reduxjs/toolkit']) stack.stateManagement = 'Redux';
          if (allDeps['mobx']) stack.stateManagement = 'MobX';
          if (allDeps['zustand']) stack.stateManagement = 'Zustand';
          if (allDeps['recoil']) stack.stateManagement = 'Recoil';

        } catch (e) {
          // Invalid JSON
        }
        break;
      }
    }

    // Fallback from metadata
    if (metadata?.framework && !stack.frontend) {
      stack.frontend = { name: metadata.framework, version: '' };
    }
    if (metadata?.backend && !stack.backend) {
      stack.backend = { name: metadata.backend, version: '' };
    }
    if (metadata?.database && !stack.database) {
      stack.database = { name: metadata.database, type: 'Unknown' };
    }

    return stack;
  }

  private analyzeProjectStructure(
    files: FileInfo[],
    _fileContents: Map<string, string>
  ): ProjectStructure {
    const structure: ProjectStructure = {
      type: 'unknown',
      directories: {},
      entryPoints: [],
      layers: []
    };

    // Подсчёт файлов по директориям
    const dirCounts: Record<string, number> = {};

    for (const file of files) {
      const parts = file.path.split(/[\/\\]/);
      if (parts.length > 1) {
        const topDir = parts[0];
        dirCounts[topDir] = (dirCounts[topDir] || 0) + 1;
      }
    }

    structure.directories = dirCounts;

    // Определяем тип структуры
    const dirs = Object.keys(dirCounts);

    if (dirs.includes('src')) {
      // Проверяем внутреннюю структуру src
      const srcDirs = files
        .filter(f => f.path.startsWith('src/'))
        .map(f => f.path.split(/[\/\\]/)[1])
        .filter((v, i, a) => a.indexOf(v) === i);

      if (srcDirs.includes('features') || srcDirs.includes('modules')) {
        structure.type = 'feature-based';
        structure.layers = ['features', 'shared', 'core'];
      } else if (srcDirs.includes('components') && srcDirs.includes('views')) {
        structure.type = 'mvc-like';
        structure.layers = ['views', 'components', 'store', 'api', 'utils'];
      } else if (srcDirs.includes('domain') && srcDirs.includes('infrastructure')) {
        structure.type = 'clean-architecture';
        structure.layers = ['domain', 'application', 'infrastructure', 'presentation'];
      } else if (srcDirs.includes('pages') && srcDirs.includes('components')) {
        structure.type = 'page-based';
        structure.layers = ['pages', 'components', 'hooks', 'utils'];
      } else {
        structure.type = 'standard';
        structure.layers = srcDirs.slice(0, 10);
      }
    } else if (dirs.includes('app')) {
      structure.type = 'app-directory';
      structure.layers = ['app', 'components', 'lib'];
    } else if (dirs.includes('pages')) {
      structure.type = 'pages-based';
      structure.layers = ['pages', 'components', 'public'];
    }

    // Entry points
    const entryPatterns = ['main.ts', 'main.js', 'index.ts', 'index.js', 'app.ts', 'app.js', 'server.ts', 'server.js'];
    for (const file of files) {
      const fileName = file.path.split(/[\/\\]/).pop() || '';
      if (entryPatterns.includes(fileName)) {
        structure.entryPoints.push(file.path);
      }
    }

    return structure;
  }

  private extractComponents(
    files: FileInfo[],
    fileContents: Map<string, string>,
    _symbols: Map<string, Symbol>
  ): ComponentInfo[] {
    const components: ComponentInfo[] = [];

    // Vue компоненты
    const vueFiles = files.filter(f => f.path.endsWith('.vue'));
    for (const file of vueFiles.slice(0, 50)) { // Limit
      const content = this.getFileContent(fileContents, file.path);
      if (!content) continue;

      const name = file.path.split(/[\/\\]/).pop()?.replace('.vue', '') || '';
      const type = this.detectComponentType(file.path, name);

      const component: ComponentInfo = {
        name,
        path: file.path,
        type,
        description: this.generateComponentDescription(name, type, content)
      };

      // Extract props
      const propsMatch = content.match(/defineProps[<\s]*[{(]([^})]+)[})]/s);
      if (propsMatch) {
        component.props = this.extractPropNames(propsMatch[1]);
      }

      // Extract emits
      const emitsMatch = content.match(/defineEmits[<\s]*\[([^\]]+)\]/);
      if (emitsMatch) {
        component.emits = emitsMatch[1].split(',').map(e => e.trim().replace(/['"]/g, ''));
      }

      components.push(component);
    }

    // React компоненты
    const reactFiles = files.filter(f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx'));
    for (const file of reactFiles.slice(0, 50)) {
      const content = this.getFileContent(fileContents, file.path);
      if (!content) continue;

      // Проверяем что это компонент
      if (!content.includes('export') || !content.match(/function\s+\w+|const\s+\w+\s*=.*=>/)) continue;

      const name = file.path.split(/[\/\\]/).pop()?.replace(/\.(tsx|jsx)$/, '') || '';
      const type = this.detectComponentType(file.path, name);

      components.push({
        name,
        path: file.path,
        type,
        description: this.generateComponentDescription(name, type, content)
      });
    }

    return components;
  }

  private detectComponentType(path: string, name: string): ComponentInfo['type'] {
    const lowerPath = path.toLowerCase();
    const lowerName = name.toLowerCase();

    if (lowerPath.includes('/pages/') || lowerPath.includes('/views/')) return 'page';
    if (lowerPath.includes('/layouts/')) return 'layout';
    if (lowerPath.includes('/widgets/')) return 'widget';
    if (lowerPath.includes('/utils/') || lowerPath.includes('/helpers/')) return 'util';
    if (lowerName.endsWith('view') || lowerName.endsWith('page')) return 'page';
    if (lowerName.endsWith('layout')) return 'layout';

    return 'component';
  }

  private generateComponentDescription(name: string, type: string, content: string): string {
    // Простое описание на основе имени и типа
    const typeDescriptions: Record<string, string> = {
      'page': 'Page view',
      'layout': 'Layout wrapper',
      'widget': 'Widget component',
      'util': 'Utility component',
      'component': 'UI component'
    };

    // Проверяем комментарии в начале файла
    const commentMatch = content.match(/^\/\*\*?\s*\n?\s*\*?\s*(.+?)(?:\n|\*\/)/);
    if (commentMatch) {
      return commentMatch[1].trim();
    }

    return `${typeDescriptions[type] || 'Component'} for ${this.humanizeName(name)}`;
  }

  private humanizeName(name: string): string {
    // CamelCase to words
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[-_]/g, ' ')
      .trim()
      .toLowerCase();
  }

  private extractPropNames(propsStr: string): string[] {
    // Простое извлечение имён пропсов
    const props: string[] = [];
    const matches = propsStr.matchAll(/(\w+)\s*[?:]|\s*['"](\w+)['"]/g);
    for (const match of matches) {
      props.push(match[1] || match[2]);
    }
    return props.slice(0, 10); // Limit
  }

  private extractApiEndpoints(
    files: FileInfo[],
    fileContents: Map<string, string>,
    _symbols: Map<string, Symbol>
  ): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];

    // Express/Fastify routes
    const routePatterns = [
      /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)/gi
    ];

    for (const file of files) {
      if (!file.path.includes('route') && !file.path.includes('controller') && !file.path.includes('api')) {
        continue;
      }

      const content = this.getFileContent(fileContents, file.path);
      if (!content) continue;

      for (const pattern of routePatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          endpoints.push({
            method: match[1].toUpperCase(),
            path: match[2] || '/',
            file: file.path
          });
        }
      }
    }

    return endpoints.slice(0, 50); // Limit
  }

  private extractStores(
    files: FileInfo[],
    fileContents: Map<string, string>,
    _symbols: Map<string, Symbol>
  ): StoreModule[] {
    const stores: StoreModule[] = [];

    // Vuex/Pinia stores
    const storeFiles = files.filter(f =>
      f.path.includes('/store') ||
      f.path.includes('/stores') ||
      f.path.includes('Store.') ||
      f.path.includes('.store.')
    );

    for (const file of storeFiles.slice(0, 20)) {
      const content = this.getFileContent(fileContents, file.path);
      if (!content) continue;

      const name = file.path.split(/[\/\\]/).pop()?.replace(/\.(ts|js)$/, '') || '';

      let type: StoreModule['type'] = 'vuex';
      if (content.includes('defineStore')) type = 'pinia';
      if (content.includes('createSlice') || content.includes('createStore')) type = 'redux';
      if (content.includes('makeAutoObservable')) type = 'mobx';
      if (content.includes('create(')) type = 'zustand';

      const store: StoreModule = {
        name: this.humanizeName(name),
        path: file.path,
        type
      };

      // Extract state keys
      const stateMatch = content.match(/state\s*[:(]\s*\(\s*\)\s*=>\s*\({([^}]+)\}/s);
      if (stateMatch) {
        store.state = this.extractObjectKeys(stateMatch[1]);
      }

      // Extract actions
      const actionsMatch = content.match(/actions\s*:\s*{([^}]+)}/s);
      if (actionsMatch) {
        store.actions = this.extractFunctionNames(actionsMatch[1]);
      }

      stores.push(store);
    }

    return stores;
  }

  private extractObjectKeys(str: string): string[] {
    const keys: string[] = [];
    const matches = str.matchAll(/(\w+)\s*:/g);
    for (const match of matches) {
      keys.push(match[1]);
    }
    return keys.slice(0, 10);
  }

  private extractFunctionNames(str: string): string[] {
    const names: string[] = [];
    const matches = str.matchAll(/(\w+)\s*\(|async\s+(\w+)/g);
    for (const match of matches) {
      names.push(match[1] || match[2]);
    }
    return names.slice(0, 10);
  }

  private extractRouting(
    files: FileInfo[],
    fileContents: Map<string, string>
  ): { type: string; routes: { path: string; component: string; name?: string }[] } {
    const result = { type: 'unknown', routes: [] as any[] };

    // Vue Router
    const routerFile = files.find(f =>
      f.path.includes('router') && (f.path.endsWith('.ts') || f.path.endsWith('.js'))
    );

    if (routerFile) {
      const content = this.getFileContent(fileContents, routerFile.path);
      if (content) {
        result.type = 'vue-router';

        // Extract routes
        const routeMatches = content.matchAll(/{\s*path:\s*['"`]([^'"`]+)['"`](?:[^}]*name:\s*['"`]([^'"`]+)['"`])?(?:[^}]*component:\s*(?:()?\s*=>|import\s*\()?[^,}]*['"`]?([^'"`\s,)]+))?/g);

        for (const match of routeMatches) {
          result.routes.push({
            path: match[1],
            name: match[2],
            component: match[4] || 'Dynamic'
          });
        }
      }
    }

    // Next.js / Nuxt - page-based routing
    const pageFiles = files.filter(f => f.path.includes('/pages/') && !f.path.includes('_'));
    if (pageFiles.length > 0 && result.routes.length === 0) {
      result.type = 'file-based';
      for (const page of pageFiles.slice(0, 20)) {
        const routePath = page.path
          .replace(/.*\/pages/, '')
          .replace(/\.(vue|tsx?|jsx?)$/, '')
          .replace(/\/index$/, '/')
          .replace(/\[([^\]]+)\]/g, ':$1');

        result.routes.push({
          path: routePath || '/',
          component: page.path.split(/[\/\\]/).pop() || ''
        });
      }
    }

    return result;
  }

  private extractConfiguration(
    files: FileInfo[],
    _fileContents: Map<string, string>
  ): { files: { name: string; purpose: string }[] } {
    const configFiles: { name: string; purpose: string }[] = [];

    const configPatterns: Record<string, string> = {
      'vite.config': 'Vite bundler configuration',
      'webpack.config': 'Webpack bundler configuration',
      'tsconfig': 'TypeScript compiler options',
      'eslint': 'Code linting rules',
      'prettier': 'Code formatting rules',
      'tailwind.config': 'Tailwind CSS configuration',
      'postcss.config': 'PostCSS processing',
      'jest.config': 'Jest testing configuration',
      'vitest.config': 'Vitest testing configuration',
      '.env': 'Environment variables',
      'docker-compose': 'Docker services configuration',
      'Dockerfile': 'Container build instructions',
      'nginx': 'Nginx web server configuration',
      'package.json': 'Project dependencies and scripts'
    };

    for (const file of files) {
      const fileName = file.path.split(/[\/\\]/).pop() || '';

      for (const [pattern, purpose] of Object.entries(configPatterns)) {
        if (fileName.toLowerCase().includes(pattern.toLowerCase())) {
          configFiles.push({ name: fileName, purpose });
          break;
        }
      }
    }

    return { files: configFiles };
  }

  private getFileContent(fileContents: Map<string, string>, path: string): string | null {
    // Пробуем найти по разным вариантам пути
    if (fileContents.has(path)) return fileContents.get(path)!;

    for (const [key, value] of fileContents) {
      if (key.endsWith(path) || path.endsWith(key.split(/[\/\\]/).slice(-3).join('/'))) {
        return value;
      }
    }

    return null;
  }

  // ============ SECTION GENERATORS ============

  private generateOverview(
    projectName: string,
    stack: ProjectStack,
    structure: ProjectStructure,
    files: FileInfo[]
  ): string {
    const totalFiles = files.length;
    const languages = this.countLanguages(files);
    const topLanguages = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    let overview = '';

    // Тип проекта
    if (stack.frontend && stack.backend) {
      overview += `**${projectName}** is a full-stack web application `;
    } else if (stack.frontend) {
      overview += `**${projectName}** is a frontend web application `;
    } else if (stack.backend) {
      overview += `**${projectName}** is a backend service `;
    } else {
      overview += `**${projectName}** is a software project `;
    }

    // Фреймворк
    if (stack.frontend) {
      overview += `built with **${stack.frontend.name}**`;
      if (stack.frontend.variant && stack.frontend.variant !== stack.frontend.name) {
        overview += ` (${stack.frontend.variant})`;
      }
    }
    if (stack.backend) {
      if (stack.frontend) overview += ' and ';
      overview += `**${stack.backend.name}**`;
    }
    overview += '.\n\n';

    // Статистика
    overview += `### Project Statistics\n\n`;
    overview += `| Metric | Value |\n`;
    overview += `|--------|-------|\n`;
    overview += `| Total Files | ${totalFiles} |\n`;
    overview += `| Primary Language | ${topLanguages[0]?.[0] || 'Unknown'} (${topLanguages[0]?.[1] || 0} files) |\n`;
    overview += `| Architecture | ${this.formatArchitectureType(structure.type)} |\n`;
    if (stack.stateManagement) {
      overview += `| State Management | ${stack.stateManagement} |\n`;
    }
    if (stack.database) {
      overview += `| Database | ${stack.database.name} |\n`;
    }
    overview += '\n';

    // Языки
    if (topLanguages.length > 1) {
      overview += `### Languages\n\n`;
      for (const [lang, count] of topLanguages) {
        const percent = Math.round((count / totalFiles) * 100);
        overview += `- **${lang}**: ${count} files (${percent}%)\n`;
      }
      overview += '\n';
    }

    return overview;
  }

  private formatArchitectureType(type: string): string {
    const typeNames: Record<string, string> = {
      'feature-based': 'Feature-Based Architecture',
      'mvc-like': 'MVC-like Architecture',
      'clean-architecture': 'Clean Architecture',
      'page-based': 'Page-Based Structure',
      'app-directory': 'App Directory Structure',
      'pages-based': 'Pages-Based Structure',
      'standard': 'Standard Structure',
      'unknown': 'Custom Structure'
    };
    return typeNames[type] || type;
  }

  private countLanguages(files: FileInfo[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const file of files) {
      counts[file.language] = (counts[file.language] || 0) + 1;
    }
    return counts;
  }

  private generateStackSection(stack: ProjectStack): string {
    let content = '';

    // Frontend
    if (stack.frontend) {
      content += `### Frontend\n\n`;
      content += `- **Framework**: ${stack.frontend.name}`;
      if (stack.frontend.version) content += ` ${stack.frontend.version}`;
      content += '\n';
      if (stack.frontend.variant && stack.frontend.variant !== stack.frontend.name) {
        content += `- **Meta-Framework**: ${stack.frontend.variant}\n`;
      }
      if (stack.stateManagement) {
        content += `- **State Management**: ${stack.stateManagement}\n`;
      }
      content += '\n';
    }

    // Backend
    if (stack.backend) {
      content += `### Backend\n\n`;
      content += `- **Framework**: ${stack.backend.name}`;
      if (stack.backend.version) content += ` ${stack.backend.version}`;
      content += '\n';
      if (stack.database) {
        content += `- **Database**: ${stack.database.name} (${stack.database.type})\n`;
      }
      content += '\n';
    }

    // Styling
    if (stack.styling.length > 0) {
      content += `### Styling\n\n`;
      for (const style of stack.styling) {
        content += `- ${style}\n`;
      }
      content += '\n';
    }

    // Build Tools
    if (stack.buildTools.length > 0) {
      content += `### Build Tools\n\n`;
      for (const tool of stack.buildTools) {
        content += `- ${tool}\n`;
      }
      content += '\n';
    }

    // Testing
    if (stack.testing.length > 0) {
      content += `### Testing\n\n`;
      for (const test of stack.testing) {
        content += `- ${test}\n`;
      }
      content += '\n';
    }

    return content || '*No specific technology stack detected.*\n';
  }

  private generateStructureSection(structure: ProjectStructure): string {
    let content = `The project follows a **${this.formatArchitectureType(structure.type)}** pattern.\n\n`;

    // Directory tree
    content += `### Directory Layout\n\n`;
    content += '```\n';

    const sortedDirs = Object.entries(structure.directories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    for (const [dir, count] of sortedDirs) {
      content += `${dir}/`.padEnd(30) + `(${count} files)\n`;
    }

    content += '```\n\n';

    // Layers
    if (structure.layers.length > 0) {
      content += `### Layers\n\n`;
      for (const layer of structure.layers) {
        content += `- \`${layer}/\`\n`;
      }
      content += '\n';
    }

    // Entry points
    if (structure.entryPoints.length > 0) {
      content += `### Entry Points\n\n`;
      for (const entry of structure.entryPoints) {
        content += `- \`${entry}\`\n`;
      }
      content += '\n';
    }

    return content;
  }

  private generateArchitectureSection(
    structure: ProjectStructure,
    components: ComponentInfo[],
    stores: StoreModule[]
  ): string {
    let content = '';

    // Архитектурный паттерн
    content += `### Pattern\n\n`;
    content += `This project uses **${this.formatArchitectureType(structure.type)}**.\n\n`;

    // Описание паттерна
    const patternDescriptions: Record<string, string> = {
      'feature-based': 'Code is organized by features/modules, each containing its own components, services, and state. This promotes modularity and makes it easier to work on isolated features.',
      'mvc-like': 'Traditional separation between Views (pages), Components (reusable UI), and Store (state management). Common in Vue.js applications.',
      'clean-architecture': 'Follows Clean Architecture principles with clear separation between Domain, Application, Infrastructure, and Presentation layers.',
      'page-based': 'File-based routing where each page is a separate file. Components are shared across pages.',
      'app-directory': 'Uses the App Router pattern with colocated components and layouts.',
      'pages-based': 'File-based routing with a pages directory structure.'
    };

    if (patternDescriptions[structure.type]) {
      content += `> ${patternDescriptions[structure.type]}\n\n`;
    }

    // Обзор компонентов по типам
    if (components.length > 0) {
      const byType = this.groupBy(components, 'type');

      content += `### Component Distribution\n\n`;
      content += `| Type | Count |\n`;
      content += `|------|-------|\n`;

      for (const [type, items] of Object.entries(byType)) {
        content += `| ${type.charAt(0).toUpperCase() + type.slice(1)}s | ${items.length} |\n`;
      }
      content += '\n';
    }

    // Обзор сторов
    if (stores.length > 0) {
      content += `### State Modules\n\n`;
      for (const store of stores) {
        content += `- **${store.name}** (\`${store.path}\`)\n`;
      }
      content += '\n';
    }

    return content;
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((result, item) => {
      const group = String(item[key]);
      if (!result[group]) result[group] = [];
      result[group].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }

  private generateComponentsSection(components: ComponentInfo[]): string {
    let content = '';

    const byType = this.groupBy(components, 'type');

    // Pages
    if (byType['page']?.length > 0) {
      content += `### Pages\n\n`;
      content += `| Name | Path |\n`;
      content += `|------|------|\n`;
      for (const comp of byType['page'].slice(0, 15)) {
        content += `| ${comp.name} | \`${comp.path}\` |\n`;
      }
      if (byType['page'].length > 15) {
        content += `| ... | *${byType['page'].length - 15} more pages* |\n`;
      }
      content += '\n';
    }

    // Layouts
    if (byType['layout']?.length > 0) {
      content += `### Layouts\n\n`;
      for (const comp of byType['layout']) {
        content += `- **${comp.name}** - \`${comp.path}\`\n`;
      }
      content += '\n';
    }

    // Key components
    if (byType['component']?.length > 0) {
      content += `### Key Components\n\n`;
      content += `| Component | Description |\n`;
      content += `|-----------|-------------|\n`;
      for (const comp of byType['component'].slice(0, 20)) {
        content += `| ${comp.name} | ${comp.description} |\n`;
      }
      if (byType['component'].length > 20) {
        content += `| ... | *${byType['component'].length - 20} more components* |\n`;
      }
      content += '\n';
    }

    return content;
  }

  private generateStoresSection(stores: StoreModule[]): string {
    let content = '';

    const storeType = stores[0]?.type || 'unknown';
    const typeNames: Record<string, string> = {
      'vuex': 'Vuex',
      'pinia': 'Pinia',
      'redux': 'Redux',
      'mobx': 'MobX',
      'zustand': 'Zustand'
    };

    content += `This project uses **${typeNames[storeType] || 'custom'}** for state management.\n\n`;

    content += `### Store Modules\n\n`;

    for (const store of stores) {
      content += `#### ${store.name}\n\n`;
      content += `- **Path**: \`${store.path}\`\n`;

      if (store.state && store.state.length > 0) {
        content += `- **State**: ${store.state.join(', ')}\n`;
      }
      if (store.actions && store.actions.length > 0) {
        content += `- **Actions**: ${store.actions.join(', ')}\n`;
      }
      content += '\n';
    }

    return content;
  }

  private generateRoutingSection(routing: { type: string; routes: any[] }): string {
    let content = '';

    const typeNames: Record<string, string> = {
      'vue-router': 'Vue Router',
      'react-router': 'React Router',
      'file-based': 'File-based routing',
      'unknown': 'Custom routing'
    };

    content += `This project uses **${typeNames[routing.type] || routing.type}**.\n\n`;

    content += `### Routes\n\n`;
    content += `| Path | Component |\n`;
    content += `|------|----------|\n`;

    for (const route of routing.routes.slice(0, 30)) {
      content += `| \`${route.path}\` | ${route.component || route.name || 'Dynamic'} |\n`;
    }

    if (routing.routes.length > 30) {
      content += `| ... | *${routing.routes.length - 30} more routes* |\n`;
    }

    content += '\n';

    return content;
  }

  private generateApiSection(endpoints: ApiEndpoint[]): string {
    let content = '';

    content += `### Endpoints\n\n`;
    content += `| Method | Path | Handler |\n`;
    content += `|--------|------|--------|\n`;

    for (const endpoint of endpoints) {
      const file = endpoint.file.split(/[\/\\]/).pop() || '';
      content += `| \`${endpoint.method}\` | \`${endpoint.path}\` | ${file} |\n`;
    }

    content += '\n';

    return content;
  }

  private generateConfigSection(config: { files: { name: string; purpose: string }[] }): string {
    let content = '';

    content += `| File | Purpose |\n`;
    content += `|------|--------|\n`;

    for (const file of config.files) {
      content += `| \`${file.name}\` | ${file.purpose} |\n`;
    }

    content += '\n';

    return content;
  }

  private generateDependenciesSection(stack: ProjectStack): string {
    let content = '';

    if (Object.keys(stack.dependencies).length === 0) {
      return '*No dependencies detected.*\n';
    }

    // Группируем ключевые зависимости
    const categories: Record<string, string[]> = {
      'UI Framework': [],
      'State Management': [],
      'Routing': [],
      'HTTP Client': [],
      'Form Handling': [],
      'Utilities': [],
      'Development': []
    };

    const depCategories: Record<string, string> = {
      'vue': 'UI Framework', 'react': 'UI Framework', 'angular': 'UI Framework', 'svelte': 'UI Framework',
      'vuex': 'State Management', 'pinia': 'State Management', 'redux': 'State Management', 'mobx': 'State Management',
      'vue-router': 'Routing', 'react-router': 'Routing',
      'axios': 'HTTP Client', 'fetch': 'HTTP Client', 'ky': 'HTTP Client',
      'vee-validate': 'Form Handling', 'formik': 'Form Handling', 'yup': 'Form Handling',
      'lodash': 'Utilities', 'dayjs': 'Utilities', 'date-fns': 'Utilities',
      'vite': 'Development', 'webpack': 'Development', 'typescript': 'Development', 'eslint': 'Development'
    };

    for (const [dep, version] of Object.entries(stack.dependencies)) {
      for (const [key, category] of Object.entries(depCategories)) {
        if (dep.includes(key)) {
          categories[category].push(`${dep} ${version}`);
          break;
        }
      }
    }

    for (const [category, deps] of Object.entries(categories)) {
      if (deps.length > 0) {
        content += `### ${category}\n\n`;
        for (const dep of deps.slice(0, 10)) {
          content += `- ${dep}\n`;
        }
        content += '\n';
      }
    }

    return content || '*See package.json for full dependency list.*\n';
  }

  private buildMarkdown(projectName: string, sections: DocumentationSection[]): string {
    let md = `# ${projectName} Documentation\n\n`;
    md += `> Auto-generated documentation by ArchiCore\n\n`;
    md += `---\n\n`;

    // Table of contents
    md += `## Table of Contents\n\n`;
    for (let i = 0; i < sections.length; i++) {
      const anchor = sections[i].title.toLowerCase().replace(/\s+/g, '-');
      md += `${i + 1}. [${sections[i].title}](#${anchor})\n`;
    }
    md += '\n---\n\n';

    // Sections
    for (const section of sections) {
      md += `## ${section.title}\n\n`;
      md += section.content;
      md += '\n---\n\n';
    }

    md += `\n*Generated by ArchiCore Documentation Generator*\n`;

    return md;
  }
}

// Types
interface ProjectStack {
  type: 'frontend' | 'backend' | 'fullstack' | 'unknown';
  frontend: { name: string; version: string; variant?: string } | null;
  backend: { name: string; version: string } | null;
  database: { name: string; type: string } | null;
  styling: string[];
  testing: string[];
  buildTools: string[];
  deployment: string[];
  stateManagement?: string;
  dependencies: Record<string, string>;
}

interface ProjectStructure {
  type: string;
  directories: Record<string, number>;
  entryPoints: string[];
  layers: string[];
}
