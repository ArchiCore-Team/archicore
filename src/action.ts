/**
 * ArchiCore GitHub Action entry point.
 *
 * This file is bundled into dist/action.js via esbuild as a self-contained CJS
 * bundle.  It intentionally does NOT import any ArchiCore source modules — it
 * shells out to the `archicore` CLI so the bundle stays free of native C++
 * tree-sitter bindings.
 *
 * Build:  npm run build:action
 */

import * as core from '@actions/core';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Types (mirrors the CLI JSON output; only the fields we use)
// ---------------------------------------------------------------------------

interface Vulnerability {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  file: string;
  line: number;
  code: string;
  cwe?: string;
  owasp?: string;
  remediation: string;
}

interface SecuritySummary {
  riskScore: number;
  grade: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  secretsFound: number;
}

interface SecurityResult {
  vulnerabilities: Vulnerability[];
  secrets: Array<{ type: string; file: string; line: number; confidence: string }>;
  summary: SecuritySummary;
}

interface MetricsResult {
  totalLOC: number;
  avgComplexity: number;
  maintainabilityIndex: number;
  technicalDebt: number;
  grade: string;
}

interface AnalysisReport {
  security?: SecurityResult;
  metrics?: MetricsResult;
  deadCode?: unknown;
  duplication?: unknown;
  // The CLI may nest results under a `results` key in some versions
  results?: {
    security?: SecurityResult;
    metrics?: MetricsResult;
    deadCode?: unknown;
    duplication?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = {
  none: 0,
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

function severityRank(s: string): number {
  return SEVERITY_RANK[s.toLowerCase()] ?? 0;
}

// ---------------------------------------------------------------------------
// CLI installation
// ---------------------------------------------------------------------------

function ensureCli(): void {
  try {
    execSync('archicore --version', { stdio: 'pipe' });
    core.info('archicore CLI already available in PATH');
  } catch {
    core.info('archicore CLI not found — installing archicore-oss@latest globally…');
    execSync('npm install -g archicore-oss@latest', { stdio: 'inherit' });
  }
}

// ---------------------------------------------------------------------------
// Build CLI flags from action inputs
// ---------------------------------------------------------------------------

function buildCliArgs(analyzePath: string, analyzers: string, tmpReport: string): string[] {
  const args = ['archicore', 'analyze', '--root', analyzePath];

  const list = analyzers.split(',').map(a => a.trim().toLowerCase());

  if (list.includes('all')) {
    args.push('--all');
  } else {
    if (list.includes('security'))    args.push('--security');
    if (list.includes('metrics'))     args.push('--metrics');
    if (list.includes('dead-code'))   args.push('--dead-code');
    if (list.includes('duplication')) args.push('--duplication');
  }

  args.push('--json', '--output', tmpReport);
  return args;
}

// ---------------------------------------------------------------------------
// Markdown summary helpers
// ---------------------------------------------------------------------------

function writeSummary(
  analyzePath: string,
  security: SecurityResult | undefined,
  metrics: MetricsResult | undefined,
): void {
  const summary = core.summary;

  summary.addHeading('ArchiCore Analysis', 2);
  summary.addRaw(`**Analyzed path:** \`${analyzePath}\`\n\n`);

  // --- Security table ---
  if (security?.summary) {
    const s = security.summary;
    summary.addHeading('Security', 3);
    summary.addTable([
      [
        { data: 'Risk Score', header: true },
        { data: 'Grade', header: true },
        { data: 'Critical', header: true },
        { data: 'High', header: true },
        { data: 'Medium', header: true },
        { data: 'Low', header: true },
        { data: 'Secrets', header: true },
      ],
      [
        String(s.riskScore ?? '-'),
        s.grade ?? '-',
        String(s.critical ?? 0),
        String(s.high ?? 0),
        String(s.medium ?? 0),
        String(s.low ?? 0),
        String(s.secretsFound ?? 0),
      ],
    ]);

    // Top HIGH/CRITICAL findings (max 10)
    const severe = (security.vulnerabilities ?? [])
      .filter(v => v.severity === 'high' || v.severity === 'critical')
      .slice(0, 10);

    if (severe.length > 0) {
      summary.addHeading('High / Critical Findings', 4);
      summary.addTable([
        [
          { data: 'File', header: true },
          { data: 'Line', header: true },
          { data: 'Type', header: true },
          { data: 'Severity', header: true },
          { data: 'Remediation', header: true },
        ],
        ...severe.map(v => [
          `\`${v.file}\``,
          String(v.line ?? '-'),
          v.type ?? v.title ?? '-',
          v.severity.toUpperCase(),
          v.remediation ?? '-',
        ]),
      ]);
    }
  }

  // --- Metrics table ---
  if (metrics) {
    summary.addHeading('Code Metrics', 3);
    summary.addTable([
      [
        { data: 'Total LOC', header: true },
        { data: 'Avg Complexity', header: true },
        { data: 'Maintainability', header: true },
        { data: 'Tech Debt (hrs)', header: true },
        { data: 'Grade', header: true },
      ],
      [
        String(metrics.totalLOC ?? '-'),
        String(metrics.avgComplexity != null ? metrics.avgComplexity.toFixed(2) : '-'),
        String(metrics.maintainabilityIndex != null ? metrics.maintainabilityIndex.toFixed(1) : '-'),
        String(metrics.technicalDebt != null ? metrics.technicalDebt.toFixed(1) : '-'),
        metrics.grade ?? '-',
      ],
    ]);
  }

  summary.addSeparator();
  summary.addRaw(
    '<sub>Generated by <a href="https://github.com/ArchiCore-Team/archicore">ArchiCore</a></sub>\n',
  );

  summary.write();
}

// ---------------------------------------------------------------------------
// File annotations
// ---------------------------------------------------------------------------

function annotateFindings(security: SecurityResult | undefined, analyzePath: string): void {
  if (!security?.vulnerabilities) return;

  for (const v of security.vulnerabilities) {
    if (v.severity !== 'high' && v.severity !== 'critical') continue;

    const filePath = v.file ? path.join(analyzePath, v.file) : undefined;
    const annotation: core.AnnotationProperties = {
      title: `[${v.severity.toUpperCase()}] ${v.type || v.title}`,
      ...(filePath ? { file: filePath } : {}),
      ...(v.line ? { startLine: v.line } : {}),
    };
    core.warning(v.remediation || v.description || v.title, annotation);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  try {
    // 1. Read inputs
    const analyzePath = path.resolve(core.getInput('path') || '.');
    const analyzers   = core.getInput('analyzers') || 'security,metrics';
    const failOn      = (core.getInput('fail-on-severity') || 'high').toLowerCase();
    const jsonOutput  = core.getInput('json-output') || '';

    // 2. Ensure CLI is available
    ensureCli();

    // 3. Build command
    const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir();
    const tmpReport  = path.join(runnerTemp, `archicore-report-${Date.now()}.json`);
    const args       = buildCliArgs(analyzePath, analyzers, tmpReport);
    const cmd        = args.join(' ');

    core.info(`Running: ${cmd}`);

    // 4. Execute — the CLI may exit non-zero when findings exist, so we catch
    //    and only fail later via core.setFailed() based on severity threshold.
    try {
      execSync(cmd, { stdio: 'inherit', timeout: 300_000 });
    } catch (execErr: unknown) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      core.warning(`archicore exited with an error (this may be expected when findings exist): ${msg}`);
    }

    // 5. Read & parse report
    let report: AnalysisReport = {};

    if (fs.existsSync(tmpReport)) {
      try {
        const raw = fs.readFileSync(tmpReport, 'utf-8');
        report = JSON.parse(raw) as AnalysisReport;
      } catch (parseErr: unknown) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        core.warning(`Failed to parse ArchiCore JSON report: ${msg}`);
      }
    } else {
      core.warning('ArchiCore did not produce a JSON report file.');
    }

    // Defensive: report may nest under `results`
    const security: SecurityResult | undefined =
      report.security ?? report.results?.security ?? undefined;
    const metrics: MetricsResult | undefined =
      report.metrics ?? report.results?.metrics ?? undefined;

    // 6. Copy report to user-requested path if specified
    if (jsonOutput && fs.existsSync(tmpReport)) {
      const dest = path.resolve(jsonOutput);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(tmpReport, dest);
      core.info(`JSON report written to ${dest}`);
    }

    // 7. Set outputs
    const riskScore      = security?.summary?.riskScore ?? 0;
    const grade          = security?.summary?.grade ?? '-';
    const highCount      = (security?.summary?.critical ?? 0) + (security?.summary?.high ?? 0);
    const totalFindings  = (security?.vulnerabilities?.length ?? 0) + (security?.secrets?.length ?? 0);

    core.setOutput('risk-score', String(riskScore));
    core.setOutput('findings-count', String(totalFindings));
    core.setOutput('high-severity-count', String(highCount));
    core.setOutput('grade', grade);

    try {
      core.setOutput('report', JSON.stringify(report));
    } catch {
      core.setOutput('report', '{}');
    }

    // 8. Write step summary
    writeSummary(analyzePath, security, metrics);

    // 9. File annotations for HIGH/CRITICAL
    annotateFindings(security, analyzePath);

    // 10. Fail if severity threshold is met
    if (failOn !== 'none' && security?.vulnerabilities) {
      const failRank  = severityRank(failOn);
      const breaching = security.vulnerabilities.filter(v => severityRank(v.severity) >= failRank);

      if (breaching.length > 0) {
        core.setFailed(
          `ArchiCore found ${breaching.length} finding(s) at or above "${failOn}" severity. ` +
          `Risk score: ${riskScore}, Grade: ${grade}.`,
        );
      }
    }

    // Cleanup temp file
    try { fs.unlinkSync(tmpReport); } catch { /* ignore */ }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    core.setFailed(`ArchiCore action failed: ${msg}`);
  }
}

run();
