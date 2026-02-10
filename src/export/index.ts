/**
 * Export/Import System
 *
 * Форматы экспорта:
 * - JSON (полный)
 * - HTML отчёт
 * - Markdown отчёт
 * - PDF (через HTML)
 * - CSV (метрики)
 * - GraphML (граф зависимостей)
 */

import { DependencyGraph, Symbol } from '../types/index.js';
import { ProjectMetrics } from '../metrics/index.js';
import { RulesCheckResult } from '../rules-engine/index.js';
import { DeadCodeResult } from '../analyzers/dead-code.js';
import { DuplicationResult } from '../analyzers/duplication.js';
import { SecurityResult } from '../analyzers/security.js';
import { Logger } from '../utils/logger.js';

export interface ExportData {
  projectName: string;
  exportDate: string;
  version: string;
  graph?: DependencyGraph;
  symbols?: Map<string, Symbol>;
  metrics?: ProjectMetrics;
  rules?: RulesCheckResult;
  deadCode?: DeadCodeResult;
  duplication?: DuplicationResult;
  security?: SecurityResult;
}

export interface ExportOptions {
  format: 'json' | 'html' | 'markdown' | 'csv' | 'graphml';
  includeGraph?: boolean;
  includeSymbols?: boolean;
  includeMetrics?: boolean;
  includeRules?: boolean;
  includeDeadCode?: boolean;
  includeDuplication?: boolean;
  includeSecurity?: boolean;
  language?: 'en' | 'ru';
}

export interface ImportResult {
  success: boolean;
  data?: ExportData;
  errors?: string[];
}

const translations = {
  en: {
    reportTitle: 'Architecture Analysis Report',
    generatedOn: 'Generated on',
    projectOverview: 'Project Overview',
    totalFiles: 'Total Files',
    totalSymbols: 'Total Symbols',
    dependencies: 'Dependencies',
    circularDeps: 'Circular Dependencies',
    metricsSection: 'Code Metrics',
    totalLOC: 'Total Lines of Code',
    avgComplexity: 'Average Complexity',
    maintainabilityIndex: 'Maintainability Index',
    hotspots: 'Hotspots',
    rulesSection: 'Architecture Rules',
    rulesPassed: 'Rules Passed',
    violations: 'Violations',
    securitySection: 'Security Analysis',
    vulnerabilities: 'Vulnerabilities',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    hardcodedSecrets: 'Hardcoded Secrets',
    deadCodeSection: 'Dead Code',
    unusedExports: 'Unused Exports',
    unusedVariables: 'Unused Variables',
    unreachableCode: 'Unreachable Code',
    duplicationSection: 'Code Duplication',
    totalClones: 'Total Clones',
    duplicationPercentage: 'Duplication Percentage',
    estimatedRefactorTime: 'Estimated Refactor Time',
    hours: 'hours',
    file: 'File',
    line: 'Line',
    type: 'Type',
    severity: 'Severity',
    message: 'Message',
    recommendation: 'Recommendation'
  },
  ru: {
    reportTitle: 'Отчёт об анализе архитектуры',
    generatedOn: 'Сформирован',
    projectOverview: 'Обзор проекта',
    totalFiles: 'Всего файлов',
    totalSymbols: 'Всего символов',
    dependencies: 'Зависимостей',
    circularDeps: 'Циклических зависимостей',
    metricsSection: 'Метрики кода',
    totalLOC: 'Всего строк кода',
    avgComplexity: 'Средняя сложность',
    maintainabilityIndex: 'Индекс поддерживаемости',
    hotspots: 'Проблемные места',
    rulesSection: 'Правила архитектуры',
    rulesPassed: 'Правил выполнено',
    violations: 'Нарушений',
    securitySection: 'Анализ безопасности',
    vulnerabilities: 'Уязвимостей',
    critical: 'Критических',
    high: 'Высоких',
    medium: 'Средних',
    low: 'Низких',
    hardcodedSecrets: 'Захардкоженных секретов',
    deadCodeSection: 'Мёртвый код',
    unusedExports: 'Неиспользуемых экспортов',
    unusedVariables: 'Неиспользуемых переменных',
    unreachableCode: 'Недостижимый код',
    duplicationSection: 'Дублирование кода',
    totalClones: 'Всего клонов',
    duplicationPercentage: 'Процент дублирования',
    estimatedRefactorTime: 'Время на рефакторинг',
    hours: 'часов',
    file: 'Файл',
    line: 'Строка',
    type: 'Тип',
    severity: 'Серьёзность',
    message: 'Сообщение',
    recommendation: 'Рекомендация'
  }
};

export class ExportManager {
  private version = '1.0.0';

  /**
   * Экспорт данных в указанный формат
   */
  async export(data: ExportData, options: ExportOptions): Promise<string> {
    Logger.progress(`Exporting to ${options.format}...`);

    let result: string;

    switch (options.format) {
      case 'json':
        result = this.exportJSON(data, options);
        break;
      case 'html':
        result = this.exportHTML(data, options);
        break;
      case 'markdown':
        result = this.exportMarkdown(data, options);
        break;
      case 'csv':
        result = this.exportCSV(data);
        break;
      case 'graphml':
        result = this.exportGraphML(data);
        break;
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    Logger.success(`Export completed (${result.length} bytes)`);
    return result;
  }

  /**
   * Импорт данных из JSON
   */
  async import(jsonString: string): Promise<ImportResult> {
    Logger.progress('Importing data...');

    try {
      const parsed = JSON.parse(jsonString);

      // Валидация
      const errors: string[] = [];

      if (!parsed.projectName) {
        errors.push('Missing projectName');
      }

      if (!parsed.exportDate) {
        errors.push('Missing exportDate');
      }

      // Восстанавливаем Map из объектов
      if (parsed.symbols && typeof parsed.symbols === 'object') {
        parsed.symbols = new Map(Object.entries(parsed.symbols));
      }

      if (errors.length > 0) {
        return { success: false, errors };
      }

      Logger.success('Import completed');
      return { success: true, data: parsed as ExportData };
    } catch (error) {
      return {
        success: false,
        errors: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Экспорт в JSON
   */
  private exportJSON(data: ExportData, options: ExportOptions): string {
    const exportObj: Record<string, unknown> = {
      projectName: data.projectName,
      exportDate: data.exportDate,
      version: this.version
    };

    if (options.includeGraph && data.graph) {
      exportObj.graph = {
        nodes: data.graph.nodes,
        edges: Object.fromEntries(data.graph.edges)
      };
    }

    if (options.includeSymbols && data.symbols) {
      exportObj.symbols = Object.fromEntries(data.symbols);
    }

    if (options.includeMetrics && data.metrics) {
      exportObj.metrics = data.metrics;
    }

    if (options.includeRules && data.rules) {
      exportObj.rules = data.rules;
    }

    if (options.includeDeadCode && data.deadCode) {
      exportObj.deadCode = data.deadCode;
    }

    if (options.includeDuplication && data.duplication) {
      exportObj.duplication = data.duplication;
    }

    if (options.includeSecurity && data.security) {
      exportObj.security = data.security;
    }

    return JSON.stringify(exportObj, null, 2);
  }

  /**
   * Экспорт в HTML
   */
  private exportHTML(data: ExportData, options: ExportOptions): string {
    const t = translations[options.language || 'en'];

    let html = `<!DOCTYPE html>
<html lang="${options.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.reportTitle} - ${data.projectName}</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --card-bg: #12121a;
      --border: #1e1e2e;
      --text: #e4e4e7;
      --text-muted: #71717a;
      --primary: #8b5cf6;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: var(--primary); margin-bottom: 0.5rem; }
    h2 { color: var(--text); margin: 2rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    .meta { color: var(--text-muted); margin-bottom: 2rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; color: var(--primary); }
    .stat-label { color: var(--text-muted); font-size: 0.875rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-weight: 500; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge-critical { background: var(--error); color: white; }
    .badge-high { background: #dc2626; color: white; }
    .badge-medium { background: var(--warning); color: black; }
    .badge-low { background: var(--success); color: white; }
    .progress { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
    .progress-bar { height: 100%; background: var(--primary); }
  </style>
</head>
<body>
  <div class="container">
    <h1>${t.reportTitle}</h1>
    <p class="meta">${data.projectName} | ${t.generatedOn}: ${new Date(data.exportDate).toLocaleString()}</p>
`;

    // Project Overview
    if (data.graph) {
      const totalDeps = Array.from(data.graph.edges.values()).reduce((sum, e) => sum + e.length, 0);
      html += `
    <h2>${t.projectOverview}</h2>
    <div class="card">
      <div class="grid">
        <div class="stat">
          <div class="stat-value">${data.graph.nodes.size}</div>
          <div class="stat-label">${t.totalFiles}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.symbols?.size || 0}</div>
          <div class="stat-label">${t.totalSymbols}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${totalDeps}</div>
          <div class="stat-label">${t.dependencies}</div>
        </div>
        <div class="stat">
          <div class="stat-value">0</div>
          <div class="stat-label">${t.circularDeps}</div>
        </div>
      </div>
    </div>
`;
    }

    // Metrics
    if (data.metrics) {
      html += `
    <h2>${t.metricsSection}</h2>
    <div class="card">
      <div class="grid">
        <div class="stat">
          <div class="stat-value">${data.metrics.summary.totalLOC.toLocaleString()}</div>
          <div class="stat-label">${t.totalLOC}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.metrics.summary.avgComplexity.toFixed(1)}</div>
          <div class="stat-label">${t.avgComplexity}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.metrics.summary.avgMaintainability.toFixed(0)}</div>
          <div class="stat-label">${t.maintainabilityIndex}</div>
        </div>
      </div>
    </div>
`;

      if (data.metrics.hotspots.length > 0) {
        html += `
    <h3>${t.hotspots}</h3>
    <div class="card">
      <table>
        <thead><tr><th>${t.file}</th><th>Score</th></tr></thead>
        <tbody>
          ${data.metrics.hotspots.slice(0, 10).map(h => `
          <tr><td>${h.filePath}</td><td>${h.score.toFixed(0)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
`;
      }
    }

    // Security
    if (data.security) {
      html += `
    <h2>${t.securitySection}</h2>
    <div class="card">
      <div class="grid">
        <div class="stat">
          <div class="stat-value" style="color: var(--error)">${data.security.summary.critical}</div>
          <div class="stat-label">${t.critical}</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: #dc2626">${data.security.summary.high}</div>
          <div class="stat-label">${t.high}</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: var(--warning)">${data.security.summary.medium}</div>
          <div class="stat-label">${t.medium}</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: var(--success)">${data.security.summary.low}</div>
          <div class="stat-label">${t.low}</div>
        </div>
      </div>
    </div>
`;

      if (data.security.vulnerabilities.length > 0) {
        html += `
    <div class="card">
      <table>
        <thead><tr><th>${t.file}</th><th>${t.line}</th><th>${t.type}</th><th>${t.severity}</th></tr></thead>
        <tbody>
          ${data.security.vulnerabilities.slice(0, 20).map(v => `
          <tr>
            <td>${v.file}</td>
            <td>${v.line}</td>
            <td>${v.type}</td>
            <td><span class="badge badge-${v.severity}">${v.severity}</span></td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
`;
      }
    }

    // Rules
    if (data.rules) {
      html += `
    <h2>${t.rulesSection}</h2>
    <div class="card">
      <div class="grid">
        <div class="stat">
          <div class="stat-value" style="color: var(--success)">${data.rules.passed}</div>
          <div class="stat-label">${t.rulesPassed}</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: var(--error)">${data.rules.violations.length}</div>
          <div class="stat-label">${t.violations}</div>
        </div>
      </div>
    </div>
`;
    }

    // Dead Code
    if (data.deadCode) {
      html += `
    <h2>${t.deadCodeSection}</h2>
    <div class="card">
      <div class="grid">
        <div class="stat">
          <div class="stat-value">${data.deadCode.summary.unusedExportsCount}</div>
          <div class="stat-label">${t.unusedExports}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.deadCode.summary.unusedVariablesCount}</div>
          <div class="stat-label">${t.unusedVariables}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.deadCode.summary.unreachableCodeLines}</div>
          <div class="stat-label">${t.unreachableCode}</div>
        </div>
      </div>
    </div>
`;
    }

    // Duplication
    if (data.duplication) {
      html += `
    <h2>${t.duplicationSection}</h2>
    <div class="card">
      <div class="grid">
        <div class="stat">
          <div class="stat-value">${data.duplication.summary.totalClones}</div>
          <div class="stat-label">${t.totalClones}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.duplication.summary.duplicationPercentage}%</div>
          <div class="stat-label">${t.duplicationPercentage}</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.duplication.summary.estimatedRefactorHours}</div>
          <div class="stat-label">${t.estimatedRefactorTime} (${t.hours})</div>
        </div>
      </div>
    </div>
`;
    }

    html += `
  </div>
</body>
</html>`;

    return html;
  }

  /**
   * Экспорт в Markdown
   */
  private exportMarkdown(data: ExportData, options: ExportOptions): string {
    const t = translations[options.language || 'en'];

    let md = `# ${t.reportTitle}

**${data.projectName}**
${t.generatedOn}: ${new Date(data.exportDate).toLocaleString()}

---

`;

    // Overview
    if (data.graph) {
      const totalDeps = Array.from(data.graph.edges.values()).reduce((sum, e) => sum + e.length, 0);
      md += `## ${t.projectOverview}

| Metric | Value |
|--------|-------|
| ${t.totalFiles} | ${data.graph.nodes.size} |
| ${t.totalSymbols} | ${data.symbols?.size || 0} |
| ${t.dependencies} | ${totalDeps} |
| ${t.circularDeps} | 0 |

`;
    }

    // Metrics
    if (data.metrics) {
      md += `## ${t.metricsSection}

| Metric | Value |
|--------|-------|
| ${t.totalLOC} | ${data.metrics.summary.totalLOC.toLocaleString()} |
| ${t.avgComplexity} | ${data.metrics.summary.avgComplexity.toFixed(1)} |
| ${t.maintainabilityIndex} | ${data.metrics.summary.avgMaintainability.toFixed(0)} |

`;

      if (data.metrics.hotspots.length > 0) {
        md += `### ${t.hotspots}

| ${t.file} | Score |
|------|-------|
${data.metrics.hotspots.slice(0, 10).map(h => `| ${h.filePath} | ${h.score.toFixed(0)} |`).join('\n')}

`;
      }
    }

    // Security
    if (data.security) {
      md += `## ${t.securitySection}

| ${t.severity} | Count |
|----------|-------|
| ${t.critical} | ${data.security.summary.critical} |
| ${t.high} | ${data.security.summary.high} |
| ${t.medium} | ${data.security.summary.medium} |
| ${t.low} | ${data.security.summary.low} |

`;

      if (data.security.vulnerabilities.length > 0) {
        md += `### ${t.vulnerabilities}

| ${t.file} | ${t.line} | ${t.type} | ${t.severity} |
|------|------|------|----------|
${data.security.vulnerabilities.slice(0, 20).map(v =>
          `| ${v.file} | ${v.line} | ${v.type} | ${v.severity} |`
        ).join('\n')}

`;
      }
    }

    // Rules
    if (data.rules) {
      md += `## ${t.rulesSection}

- ${t.rulesPassed}: ${data.rules.passed}
- ${t.violations}: ${data.rules.violations.length}

`;
    }

    // Dead Code
    if (data.deadCode) {
      md += `## ${t.deadCodeSection}

| ${t.type} | Count |
|------|-------|
| ${t.unusedExports} | ${data.deadCode.summary.unusedExportsCount} |
| ${t.unusedVariables} | ${data.deadCode.summary.unusedVariablesCount} |
| ${t.unreachableCode} | ${data.deadCode.summary.unreachableCodeLines} |

`;
    }

    // Duplication
    if (data.duplication) {
      md += `## ${t.duplicationSection}

| Metric | Value |
|--------|-------|
| ${t.totalClones} | ${data.duplication.summary.totalClones} |
| ${t.duplicationPercentage} | ${data.duplication.summary.duplicationPercentage}% |
| ${t.estimatedRefactorTime} | ${data.duplication.summary.estimatedRefactorHours} ${t.hours} |

`;
    }

    return md;
  }

  /**
   * Экспорт метрик в CSV
   */
  private exportCSV(data: ExportData): string {
    const rows: string[] = [];

    // Header
    rows.push('File,LOC,SLOC,Comments,Complexity,Cognitive,Maintainability,Afferent,Efferent,Instability');

    // Data
    if (data.metrics?.files) {
      for (const fileMetrics of data.metrics.files) {
        rows.push([
          `"${fileMetrics.filePath}"`,
          fileMetrics.loc.total,
          fileMetrics.loc.code,
          fileMetrics.loc.comments,
          fileMetrics.complexity.cyclomatic,
          fileMetrics.complexity.cognitive,
          fileMetrics.maintainability.toFixed(2),
          fileMetrics.coupling.afferentCoupling,
          fileMetrics.coupling.efferentCoupling,
          fileMetrics.coupling.instability.toFixed(2)
        ].join(','));
      }
    }

    return rows.join('\n');
  }

  /**
   * Экспорт графа в GraphML
   */
  private exportGraphML(data: ExportData): string {
    if (!data.graph) {
      return '<?xml version="1.0" encoding="UTF-8"?><graphml/>';
    }

    let graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns
         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">

  <key id="d0" for="node" attr.name="label" attr.type="string"/>
  <key id="d1" for="node" attr.name="type" attr.type="string"/>
  <key id="d2" for="edge" attr.name="type" attr.type="string"/>

  <graph id="G" edgedefault="directed">
`;

    // Nodes
    for (const [nodeId, node] of data.graph.nodes) {
      const id = this.sanitizeId(nodeId);
      const label = node.filePath.split(/[/\\]/).pop() || node.filePath;
      graphml += `    <node id="${id}">
      <data key="d0">${this.escapeXml(label)}</data>
      <data key="d1">${node.type}</data>
    </node>
`;
    }

    // Edges
    let edgeId = 0;
    for (const [source, edges] of data.graph.edges) {
      for (const edge of edges) {
        const sourceId = this.sanitizeId(source);
        const targetId = this.sanitizeId(edge.to);
        graphml += `    <edge id="e${edgeId++}" source="${sourceId}" target="${targetId}">
      <data key="d2">${edge.type}</data>
    </edge>
`;
      }
    }

    graphml += `  </graph>
</graphml>`;

    return graphml;
  }

  /**
   * Санитизация ID для GraphML
   */
  private sanitizeId(str: string): string {
    return str.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Экранирование XML
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Быстрые функции экспорта
 */
export async function exportToJSON(data: ExportData): Promise<string> {
  const manager = new ExportManager();
  return manager.export(data, {
    format: 'json',
    includeGraph: true,
    includeSymbols: true,
    includeMetrics: true,
    includeRules: true,
    includeDeadCode: true,
    includeDuplication: true,
    includeSecurity: true
  });
}

export async function exportToHTML(data: ExportData, language: 'en' | 'ru' = 'en'): Promise<string> {
  const manager = new ExportManager();
  return manager.export(data, {
    format: 'html',
    includeGraph: true,
    includeMetrics: true,
    includeRules: true,
    includeDeadCode: true,
    includeDuplication: true,
    includeSecurity: true,
    language
  });
}

export async function exportToMarkdown(data: ExportData, language: 'en' | 'ru' = 'en'): Promise<string> {
  const manager = new ExportManager();
  return manager.export(data, {
    format: 'markdown',
    includeGraph: true,
    includeMetrics: true,
    includeRules: true,
    includeDeadCode: true,
    includeDuplication: true,
    includeSecurity: true,
    language
  });
}

export async function importFromJSON(jsonString: string): Promise<ImportResult> {
  const manager = new ExportManager();
  return manager.import(jsonString);
}
