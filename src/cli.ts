#!/usr/bin/env node
/**
 * ArchiCore OSS - CLI Entry Point
 */

import { Command } from 'commander';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { config } from 'dotenv';
import { ProjectManager } from './server/project-manager.js';
import { loadLLMPlugin } from './plugins/index.js';
import * as ui from './cli/ui/index.js';

config();

const program = new Command();
const pm = new ProjectManager();

async function ensureIndexed(rootDir?: string): Promise<void> {
  if (!rootDir) {
    throw new Error('Project not indexed. Provide --root <dir> or run: archicore index <dir> first');
  }
  const spinner = ora('Initializing...').start();
  await pm.initialize();
  spinner.text = 'Indexing project...';
  await pm.indexProject(resolve(rootDir), (msg) => { spinner.text = msg; });
  spinner.succeed(`Indexed: ${pm.getStats().files} files, ${pm.getStats().symbols} symbols`);
}

program
  .name('archicore')
  .description('ArchiCore OSS - Code architecture analysis tool')
  .version('1.0.0');

// ===== init =====
program
  .command('init')
  .description('Initialize ArchiCore in the current directory')
  .action(async () => {
    ui.header('ArchiCore OSS - Initialize');
    const spinner = ora('Connecting to graph store...').start();

    try {
      await pm.initialize();
      spinner.succeed('Graph store initialized');

      const status = pm.getStatus();
      if (status.neo4jConnected) {
        ui.success('Connected to Neo4j');
      } else {
        ui.info('Using in-memory graph (Neo4j not available)');
      }

      const plugin = await loadLLMPlugin();
      if (plugin) {
        ui.success(`LLM plugin loaded: ${plugin.name}`);
      } else {
        ui.dim('No LLM plugin (optional - use --explain with Ollama or OpenAI)');
      }

      ui.success('ArchiCore initialized. Run: archicore index .');
    } catch (error) {
      spinner.fail(`Initialization failed: ${error}`);
      process.exit(1);
    }
  });

// ===== index =====
program
  .command('index [dir]')
  .description('Index a project directory')
  .action(async (dir?: string) => {
    const rootDir = resolve(dir || '.');
    ui.header(`Indexing: ${rootDir}`);

    const spinner = ora('Initializing...').start();

    try {
      await pm.initialize();
      spinner.text = 'Scanning files...';

      await pm.indexProject(rootDir, (msg) => {
        spinner.text = msg;
      });

      spinner.succeed('Indexing complete');

      const stats = pm.getStats();
      console.log('');
      ui.table(
        ['Metric', 'Value'],
        [
          ['Files', String(stats.files)],
          ['Symbols', String(stats.symbols)],
          ['Graph Nodes', String(stats.graphNodes)],
          ['Graph Edges', String(stats.graphEdges)],
          ['Search Index', `${stats.searchIndex.files} files, ${stats.searchIndex.symbols} symbols`],
        ]
      );
    } catch (error) {
      spinner.fail(`Indexing failed: ${error}`);
      process.exit(1);
    }
  });

// ===== query =====
program
  .command('query <type> [file]')
  .description('Query the dependency graph (deps|dependents|impact|cycles|path|hubs|orphans)')
  .option('--root <dir>', 'Project directory to index first')
  .option('--to <file>', 'Target file (for path query)')
  .option('--depth <n>', 'Max depth for impact query', '5')
  .option('--limit <n>', 'Result limit', '20')
  .option('--explain', 'Get LLM explanation (requires plugin)')
  .action(async (type: string, file: string | undefined, opts) => {
    const rootDir = opts.root ? resolve(opts.root) : undefined;
    if (rootDir) await ensureIndexed(rootDir);
    const queries = pm.getGraphQueries();
    if (!queries) {
      ui.error('Graph not initialized. Run: archicore index <dir> first');
      process.exit(1);
    }
    const rp = (p: string) => relPath(p, rootDir);

    switch (type) {
      case 'deps':
      case 'dependencies': {
        if (!file) { ui.error('File path required'); process.exit(1); }
        ui.header(`Dependencies of: ${rp(file)}`);
        const deps = await queries.dependenciesOf(file);
        ui.table(['File', 'Type'], deps.map(d => [rp(d.file), d.type || '']));
        break;
      }
      case 'dependents': {
        if (!file) { ui.error('File path required'); process.exit(1); }
        ui.header(`Dependents of: ${rp(file)}`);
        const dependents = await queries.dependentsOf(file);
        ui.table(['File', 'Type'], dependents.map(d => [rp(d.file), d.type || '']));
        break;
      }
      case 'impact': {
        if (!file) { ui.error('File path required'); process.exit(1); }
        ui.header(`Impact of changes to: ${rp(file)}`);
        const impact = await queries.impactOf(file, parseInt(opts.depth));
        ui.table(['File', 'Depth'], impact.map(i => [rp(i.file), String(i.depth || 0)]));
        break;
      }
      case 'cycles': {
        ui.header('Circular Dependencies');
        const cycles = await queries.findCycles();
        if (cycles.length === 0) {
          ui.success('No circular dependencies found');
        } else {
          for (const c of cycles) {
            console.log(chalk.yellow(`  ${c.cycle.map(rp).join(' → ')}`));
          }
          ui.warning(`Found ${cycles.length} cycle(s)`);
        }
        break;
      }
      case 'path': {
        if (!file || !opts.to) { ui.error('Both --from and --to files required'); process.exit(1); }
        ui.header(`Shortest path: ${rp(file)} → ${rp(opts.to)}`);
        const path = await queries.shortestPath(file, opts.to);
        if (path) {
          console.log(chalk.green(`  ${path.path.map(rp).join(' → ')}`));
          ui.info(`Length: ${path.length}`);
        } else {
          ui.warning('No path found');
        }
        break;
      }
      case 'hubs': {
        ui.header('Hub Files (most depended on)');
        const hubs = await queries.hubFiles(parseInt(opts.limit));
        ui.table(['File', 'Dependents'], hubs.map(h => [rp(h.file), String(h.dependentCount)]));
        break;
      }
      case 'orphans': {
        ui.header('Orphan Files (no dependencies)');
        const orphans = await queries.orphanFiles();
        if (orphans.length === 0) {
          ui.success('No orphan files found');
        } else {
          for (const o of orphans) {
            console.log(`  ${rp(o.file)}`);
          }
          ui.info(`Found ${orphans.length} orphan file(s)`);
        }
        break;
      }
      default:
        ui.error(`Unknown query type: ${type}. Use: deps|dependents|impact|cycles|path|hubs|orphans`);
        process.exit(1);
    }
  });

// ===== search =====
program
  .command('search <query>')
  .description('BM25 code search')
  .option('--root <dir>', 'Project directory to index and search')
  .option('--symbols', 'Search symbols instead of code')
  .option('--limit <n>', 'Result limit', '20')
  .action(async (query: string, opts) => {
    if (opts.root) await ensureIndexed(opts.root);
    ui.header(`Search: "${query}"`);

    const limit = parseInt(opts.limit);
    if (opts.symbols) {
      const results = pm.searchSymbols(query, limit);
      ui.table(
        ['Symbol', 'Kind', 'File', 'Score'],
        results.map(r => [r.symbolName || '', r.symbolKind || '', r.filePath, r.score.toFixed(2)])
      );
    } else {
      const results = pm.searchCode(query, limit);
      ui.table(
        ['File', 'Score'],
        results.map(r => [r.filePath, r.score.toFixed(2)])
      );
    }
  });

// Helper: strip rootDir prefix from paths for readable output
function relPath(absPath: string, rootDir?: string): string {
  if (!rootDir) return absPath;
  const norm = absPath.replace(/\\/g, '/');
  const normRoot = rootDir.replace(/\\/g, '/').replace(/\/$/, '') + '/';
  if (norm.startsWith(normRoot)) return norm.slice(normRoot.length);
  return absPath;
}

// Helper: recursively relativize paths in objects for JSON output
function relativizePaths(obj: unknown, rootDir?: string): unknown {
  if (!rootDir) return obj;
  if (typeof obj === 'string') return relPath(obj, rootDir);
  if (Array.isArray(obj)) return obj.map(item => relativizePaths(item, rootDir));
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = relativizePaths(v, rootDir);
    }
    return result;
  }
  return obj;
}

// ===== analyze =====
program
  .command('analyze')
  .description('Run code analysis')
  .option('--root <dir>', 'Project directory to index and analyze')
  .option('--metrics', 'Code metrics')
  .option('--security', 'Security issues')
  .option('--dead-code', 'Dead code detection')
  .option('--duplication', 'Code duplication')
  .option('--rules', 'Architecture rules')
  .option('--narrator', 'AI narrator report')
  .option('--all', 'Run all analyzers')
  .option('--json', 'Output full JSON instead of compact summary')
  .option('--output <file>', 'Write full JSON results to file')
  .option('--explain', 'Get LLM explanation (requires plugin)')
  .action(async (opts) => {
    const rootDir = opts.root ? resolve(opts.root) : undefined;
    if (rootDir) await ensureIndexed(rootDir);
    const runAll = opts.all || (!opts.metrics && !opts.security && !opts.deadCode && !opts.duplication && !opts.rules && !opts.narrator);
    const jsonMode = !!(opts.json || opts.output);
    const allResults: Record<string, unknown> = {};

    if (runAll || opts.metrics) {
      ui.header('Code Metrics');
      try {
        const metrics = await pm.getMetrics() as unknown as Record<string, unknown>;
        allResults.metrics = metrics;
        if (!jsonMode) {
          const s = (metrics.summary || {}) as Record<string, unknown>;
          ui.table(['Metric', 'Value'], [
            ['Files', String(s.totalFiles ?? 0)],
            ['Lines of Code', String(s.totalLOC ?? 0)],
            ['Avg Complexity', String(s.avgComplexity ?? 0)],
            ['Avg Maintainability', String(s.avgMaintainability ?? 0)],
            ['Tech Debt (hours)', String(s.technicalDebtHours ?? 0)],
            ['Grade', String(s.grade ?? '-')],
          ]);
          const files = ((metrics.files || []) as Record<string, unknown>[])
            .filter(f => Array.isArray(f.issues) && (f.issues as unknown[]).length > 0)
            .sort((a, b) => ((b.issues as unknown[]).length) - ((a.issues as unknown[]).length))
            .slice(0, 5);
          if (files.length > 0) {
            console.log('');
            ui.dim('Top hotspots:');
            for (const f of files) {
              const issues = (f.issues as Record<string, unknown>[]) || [];
              const high = issues.filter(i => i.severity === 'high').length;
              console.log(`  ${chalk.yellow(relPath(String(f.filePath), rootDir))} — ${high} high, ${issues.length} total`);
            }
          }
        }
      } catch (e) { ui.error(String(e)); }
    }

    if (runAll || opts.security) {
      ui.header('Security Analysis');
      try {
        const issues = await pm.getSecurityIssues() as unknown as Record<string, unknown>;
        allResults.security = issues;
        if (!jsonMode) {
          const s = (issues.summary || {}) as Record<string, unknown>;
          ui.table(['Metric', 'Value'], [
            ['Total', String(s.totalVulnerabilities ?? 0)],
            ['Critical', String(s.critical ?? 0)],
            ['High', String(s.high ?? 0)],
            ['Medium', String(s.medium ?? 0)],
            ['Low', String(s.low ?? 0)],
            ['Secrets', String(s.secretsFound ?? 0)],
            ['Grade', String(s.grade ?? '-')],
          ]);
          const vulns = (issues.vulnerabilities || []) as Record<string, unknown>[];
          const byType: Record<string, number> = {};
          for (const v of vulns) byType[String(v.type)] = (byType[String(v.type)] || 0) + 1;
          if (Object.keys(byType).length > 0) {
            console.log('');
            ui.dim('By type:');
            for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
              console.log(`  ${type}: ${count}`);
            }
          }
        }
      } catch (e) { ui.error(String(e)); }
    }

    if (runAll || opts.deadCode) {
      ui.header('Dead Code Detection');
      try {
        const dead = await pm.getDeadCode() as unknown as Record<string, unknown>;
        allResults.deadCode = dead;
        if (!jsonMode) {
          const s = (dead.summary || {}) as Record<string, unknown>;
          ui.table(['Metric', 'Value'], [
            ['Total Issues', String(s.totalIssues ?? 0)],
            ['Unused Variables', String(s.unusedVariablesCount ?? 0)],
            ['Unused Exports', String(s.unusedExportsCount ?? 0)],
            ['Unreachable Lines', String(s.unreachableCodeLines ?? 0)],
            ['Commented Code', String(s.commentedCodeLines ?? 0)],
            ['Cleanup (hours)', String(s.estimatedCleanupHours ?? 0)],
          ]);
        }
      } catch (e) { ui.error(String(e)); }
    }

    if (runAll || opts.duplication) {
      ui.header('Code Duplication');
      try {
        const dup = await pm.getDuplication() as unknown as Record<string, unknown>;
        allResults.duplication = dup;
        if (!jsonMode) {
          const s = (dup.summary || {}) as Record<string, unknown>;
          ui.table(['Metric', 'Value'], [
            ['Clones', String(s.totalClones ?? 0)],
            ['Duplicated Lines', String(s.totalDuplicatedLines ?? 0)],
            ['Duplication %', (s.duplicationPercentage ?? 0) + '%'],
            ['Files Affected', String(s.filesAffected ?? 0)],
            ['Refactor (hours)', String(s.estimatedRefactorHours ?? 0)],
          ]);
        }
      } catch (e) { ui.error(String(e)); }
    }

    if (runAll || opts.rules) {
      ui.header('Architecture Rules');
      try {
        const violations = await pm.checkRules() as unknown as Record<string, unknown>;
        allResults.rules = violations;
        if (!jsonMode) {
          const s = (violations.summary || {}) as Record<string, unknown>;
          const status = violations.passed ? chalk.green('PASSED') : chalk.red('FAILED');
          console.log(`  Status: ${status}`);
          ui.table(['Metric', 'Value'], [
            ['Total Violations', String(s.total ?? 0)],
            ['Errors', String(s.errors ?? 0)],
            ['Warnings', String(s.warnings ?? 0)],
          ]);
        }
      } catch (e) { ui.error(String(e)); }
    }

    if (runAll || opts.narrator) {
      ui.header('Architecture Narrator');
      try {
        const report = await pm.getNarratorReport() as unknown as Record<string, unknown>;
        allResults.narrator = report;
        if (!jsonMode) {
          const s = (report.summary || {}) as Record<string, unknown>;
          const tech = (report.techStack || {}) as Record<string, string[]>;
          const arch = (report.architecture || {}) as Record<string, unknown>;
          console.log(`  Project: ${chalk.bold(String(s.projectType ?? 'Unknown'))}`);
          console.log(`  Files: ${s.totalFiles ?? 0} | Symbols: ${s.totalSymbols ?? 0} | LOC: ${s.linesOfCode ?? 0}`);
          if (tech.frontend?.length) console.log(`  Frontend: ${chalk.cyan(tech.frontend.join(', '))}`);
          if (tech.backend?.length) console.log(`  Backend: ${chalk.green(tech.backend.join(', '))}`);
          console.log(`  Architecture: ${chalk.bold(String(arch.detected ?? 'Unknown'))} (${arch.confidence ?? 0}% confidence)`);
        }
      } catch (e) { ui.error(String(e)); }
    }

    // JSON output mode
    if (jsonMode) {
      const output = JSON.stringify(relativizePaths(allResults, rootDir), null, 2);
      if (opts.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(opts.output, output);
        ui.success(`Results saved to: ${opts.output}`);
      } else {
        console.log(output);
      }
    }
  });

// ===== export =====
program
  .command('export <format>')
  .description('Export analysis report (json|html|markdown|csv|graphml)')
  .option('--root <dir>', 'Project directory to index first')
  .option('--output <file>', 'Output file path')
  .action(async (format: string, opts) => {
    if (opts.root) await ensureIndexed(opts.root);
    ui.header(`Export: ${format}`);

    try {
      const result = await pm.exportAs(format as 'json' | 'html' | 'markdown' | 'csv' | 'graphml');

      if (opts.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(opts.output, typeof result === 'string' ? result : JSON.stringify(result, null, 2));
        ui.success(`Exported to: ${opts.output}`);
      } else {
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      }
    } catch (error) {
      ui.error(`Export failed: ${error}`);
      process.exit(1);
    }
  });

// ===== server =====
program
  .command('server')
  .description('Start the REST API server')
  .option('--port <n>', 'Port number', '3000')
  .action(async (opts) => {
    process.env.PORT = opts.port;
    // Dynamically import the server module to start it
    await import('./server/index.js');
  });

program.parse();
