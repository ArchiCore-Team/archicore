/**
 * Security Analyzer
 *
 * Обнаружение уязвимостей безопасности:
 * - SQL Injection
 * - XSS (Cross-Site Scripting)
 * - Command Injection
 * - Path Traversal
 * - Hardcoded Secrets
 * - Insecure Dependencies
 * - OWASP Top 10
 */

import { Logger } from '../utils/logger.js';

export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SecurityResult {
  vulnerabilities: Vulnerability[];
  secrets: HardcodedSecret[];
  summary: SecuritySummary;
}

export interface Vulnerability {
  id: string;
  type: VulnerabilityType;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  file: string;
  line: number;
  code: string;
  cwe?: string;           // CWE ID
  owasp?: string;         // OWASP category
  remediation: string;
}

export type VulnerabilityType =
  | 'sql-injection'
  | 'xss'
  | 'command-injection'
  | 'path-traversal'
  | 'hardcoded-secret'
  | 'insecure-random'
  | 'weak-crypto'
  | 'open-redirect'
  | 'ssrf'
  | 'xxe'
  | 'insecure-deserialization'
  | 'sensitive-data-exposure'
  | 'missing-auth'
  | 'broken-access'
  | 'security-misconfiguration'
  | 'prototype-pollution'
  | 'regex-dos';

export interface HardcodedSecret {
  type: SecretType;
  file: string;
  line: number;
  preview: string;        // Маскированный превью
  confidence: 'high' | 'medium' | 'low';
}

export type SecretType =
  | 'api-key'
  | 'password'
  | 'private-key'
  | 'jwt-secret'
  | 'aws-key'
  | 'database-url'
  | 'oauth-secret'
  | 'generic-secret';

export interface SecuritySummary {
  totalVulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  secretsFound: number;
  riskScore: number;      // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

interface SecurityPattern {
  type: VulnerabilityType;
  pattern: RegExp;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  cwe?: string;
  owasp?: string;
  remediation: string;
  contextCheck?: (code: string, match: RegExpMatchArray, filePath: string) => boolean;
}

interface SecretPattern {
  type: SecretType;
  pattern: RegExp;
  confidence: 'high' | 'medium' | 'low';
}

export class SecurityAnalyzer {
  /**
   * Check if file is a vendor/third-party file that should be skipped
   */
  private isVendorFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    return /(?:^|\/)(?:public|vendor|dist|build|\.next|\.nuxt|bower_components|lib\/vendor)\//i.test(normalized)
      || /\.min\.(js|css)$/.test(normalized);
  }

  /**
   * Check if file is server-side (higher risk for injection patterns)
   */
  private isServerSideFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    // Server-side extensions
    if (/\.(py|rb|php|java|go)$/.test(normalized)) return true;
    // Server-side directories
    if (/\/(server|api|backend|routes|controllers|middleware|handlers)\//.test(normalized)) return true;
    return false;
  }

  /**
   * Check if file is frontend-only (lower risk for certain patterns)
   */
  private isFrontendFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('.vue')) return true;
    if (/\/(components|views|pages|layouts|composables|store|stores|screens|widgets)\//.test(normalized)) return true;
    return false;
  }

  /**
   * Check if a matched line is commented out
   */
  private isCommentedOut(content: string, matchIndex: number): boolean {
    // Find the start of the line containing the match
    let lineStart = content.lastIndexOf('\n', matchIndex) + 1;
    const lineContent = content.substring(lineStart, matchIndex).trimStart();
    return lineContent.startsWith('//') || lineContent.startsWith('/*') || lineContent.startsWith('*');
  }

  /**
   * Check if file is a build config (webpack, quasar, vite config)
   */
  private isConfigFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    const fileName = normalized.split('/').pop() || '';
    return /^(webpack|quasar|vite|rollup|babel|jest|postcss|tailwind|tsconfig|jsconfig)\.(config|conf)?\.(ts|js|mjs|cjs|json)$/.test(fileName);
  }

  private readonly vulnerabilityPatterns: SecurityPattern[] = [
    // SQL Injection — require SQL context before concatenation
    {
      type: 'sql-injection',
      pattern: /(?:query|execute|raw)\s*\(\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP)[^`'"]*(?:\$\{[^}]+\}|['"]\s*\+\s*\w+)/gi,
      severity: 'critical',
      title: 'Potential SQL Injection',
      description: 'User input may be directly concatenated into SQL query',
      cwe: 'CWE-89',
      owasp: 'A03:2021-Injection',
      remediation: 'Use parameterized queries or prepared statements',
      contextCheck: (_code, _match, filePath) => !this.isFrontendFile(filePath)
    },
    {
      type: 'sql-injection',
      pattern: /\.query\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
      severity: 'critical',
      title: 'SQL Injection via Template Literal',
      description: 'Template literal with interpolation used in SQL query',
      cwe: 'CWE-89',
      owasp: 'A03:2021-Injection',
      remediation: 'Use parameterized queries: query($1, [param])'
    },

    // XSS
    {
      type: 'xss',
      pattern: /innerHTML\s*=\s*(?!\s*['"`])/g,
      severity: 'high',
      title: 'Potential XSS via innerHTML',
      description: 'Setting innerHTML with dynamic content can lead to XSS',
      cwe: 'CWE-79',
      owasp: 'A03:2021-Injection',
      remediation: 'Use textContent or sanitize HTML with DOMPurify'
    },
    {
      type: 'xss',
      pattern: /document\.write\s*\(/g,
      severity: 'high',
      title: 'XSS via document.write',
      description: 'document.write() can execute arbitrary scripts',
      cwe: 'CWE-79',
      owasp: 'A03:2021-Injection',
      remediation: 'Use DOM manipulation methods instead'
    },
    {
      type: 'xss',
      pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/g,
      severity: 'medium',
      title: 'React dangerouslySetInnerHTML',
      description: 'Ensure HTML is properly sanitized before use',
      cwe: 'CWE-79',
      owasp: 'A03:2021-Injection',
      remediation: 'Sanitize HTML with DOMPurify before setting'
    },

    // XSS via Vue v-html directive
    {
      type: 'xss',
      pattern: /v-html\s*=\s*["']/g,
      severity: 'medium',
      title: 'XSS via v-html directive',
      description: 'v-html renders raw HTML and bypasses Vue auto-escaping, potential XSS if used with user input',
      cwe: 'CWE-79',
      owasp: 'A03:2021-Injection',
      remediation: 'Sanitize HTML with DOMPurify before using v-html, or use text interpolation {{ }}',
      contextCheck: (_code, _match, filePath) => filePath.endsWith('.vue')
    },

    // Command Injection — require exec/spawn/child_process in context
    {
      type: 'command-injection',
      pattern: /(?:exec|spawn|execSync|spawnSync)\s*\([^)]*\$\{/g,
      severity: 'critical',
      title: 'Potential Command Injection',
      description: 'User input may be passed to shell command',
      cwe: 'CWE-78',
      owasp: 'A03:2021-Injection',
      remediation: 'Validate and sanitize input, use spawn with array args',
      contextCheck: (code, _match, filePath) => {
        // Skip frontend files — they don't have child_process
        if (this.isFrontendFile(filePath)) return false;
        // Require actual exec/spawn/child_process context
        return /(?:exec|spawn|child_process)/.test(code);
      }
    },
    {
      type: 'command-injection',
      pattern: /child_process.*exec\s*\(\s*`/g,
      severity: 'critical',
      title: 'Shell Command with Template',
      description: 'Shell command constructed from template literal',
      cwe: 'CWE-78',
      owasp: 'A03:2021-Injection',
      remediation: 'Use execFile or spawn with argument array'
    },

    // Path Traversal
    {
      type: 'path-traversal',
      pattern: /(?:readFile|writeFile|createReadStream|access|stat|unlink)\s*\([^)]*(?:req\.|params\.|query\.|body\.)/g,
      severity: 'high',
      title: 'Potential Path Traversal',
      description: 'User input may be used in file path without validation',
      cwe: 'CWE-22',
      owasp: 'A01:2021-Broken Access Control',
      remediation: 'Validate path with path.normalize() and check prefix',
      contextCheck: (_code, _match, filePath) => !this.isFrontendFile(filePath)
    },
    {
      type: 'path-traversal',
      pattern: /(?:readFile|writeFile|createReadStream|open|access)\s*\([^)]*\.\.(?:\/|\\)/g,
      severity: 'medium',
      title: 'Directory Traversal in File Operation',
      description: 'File operation contains directory traversal sequence',
      cwe: 'CWE-22',
      owasp: 'A01:2021-Broken Access Control',
      remediation: 'Use path.resolve() and validate against base directory',
    },

    // Insecure Randomness
    {
      type: 'insecure-random',
      pattern: /Math\.random\s*\(\)/g,
      severity: 'medium',
      title: 'Insecure Random Number Generator',
      description: 'Math.random() is not cryptographically secure',
      cwe: 'CWE-330',
      owasp: 'A02:2021-Cryptographic Failures',
      remediation: 'Use crypto.randomBytes() or crypto.randomUUID()',
      contextCheck: (code) => {
        // Only flag when used for security-sensitive purposes
        // Require explicit security keywords, not just generic 'key'
        return /(?:token|secret|password|passwd|pass_|credential|session[_-]?id|api[_-]?key|private[_-]?key|access[_-]?key|nonce|salt|otp|verification[_-]?code)\b/i.test(code);
      }
    },

    // Weak Cryptography
    {
      type: 'weak-crypto',
      pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/g,
      severity: 'medium',
      title: 'Weak Hash Algorithm',
      description: 'MD5 and SHA1 are considered weak for security',
      cwe: 'CWE-328',
      owasp: 'A02:2021-Cryptographic Failures',
      remediation: 'Use SHA-256 or stronger: createHash("sha256")'
    },
    {
      type: 'weak-crypto',
      pattern: /createCipher\s*\(\s*['"](?:des|rc4|rc2)['"]/gi,
      severity: 'high',
      title: 'Weak Encryption Algorithm',
      description: 'DES, RC4, RC2 are deprecated encryption algorithms',
      cwe: 'CWE-327',
      owasp: 'A02:2021-Cryptographic Failures',
      remediation: 'Use AES-256-GCM: createCipheriv("aes-256-gcm", ...)'
    },

    // Open Redirect
    {
      type: 'open-redirect',
      pattern: /(?:redirect|location\.href|window\.location)\s*=?\s*(?:req\.|params\.|query\.)/g,
      severity: 'medium',
      title: 'Potential Open Redirect',
      description: 'User-controlled URL in redirect can lead to phishing',
      cwe: 'CWE-601',
      owasp: 'A01:2021-Broken Access Control',
      remediation: 'Validate redirect URL against whitelist of allowed domains'
    },

    // SSRF — skip frontend files
    {
      type: 'ssrf',
      pattern: /(?:fetch|axios|request|http\.get)\s*\([^)]*(?:req\.|params\.|query\.|body\.)/g,
      severity: 'high',
      title: 'Potential Server-Side Request Forgery',
      description: 'User input used in server-side HTTP request',
      cwe: 'CWE-918',
      owasp: 'A10:2021-SSRF',
      remediation: 'Validate URLs against whitelist, block internal IPs',
      contextCheck: (_code, _match, filePath) => this.isServerSideFile(filePath)
    },

    // Prototype Pollution
    {
      type: 'prototype-pollution',
      pattern: /\[(?:req\.|params\.|query\.|body\.)[^\]]+\]\s*=/g,
      severity: 'high',
      title: 'Potential Prototype Pollution',
      description: 'User-controlled object key assignment',
      cwe: 'CWE-1321',
      owasp: 'A03:2021-Injection',
      remediation: 'Validate keys against whitelist, use Object.create(null)'
    },
    {
      type: 'prototype-pollution',
      pattern: /Object\.assign\s*\(\s*\{\s*\}\s*,\s*(?:req\.|params\.|query\.|body\.)/g,
      severity: 'medium',
      title: 'Object.assign with User Input',
      description: 'Merging user input can lead to prototype pollution',
      cwe: 'CWE-1321',
      owasp: 'A03:2021-Injection',
      remediation: 'Use structured cloning or explicit property copying'
    },

    // Regex DoS
    {
      type: 'regex-dos',
      pattern: /new RegExp\s*\([^)]*(?:req\.|params\.|query\.|body\.)/g,
      severity: 'medium',
      title: 'ReDoS via User Input',
      description: 'User-controlled regex can cause denial of service',
      cwe: 'CWE-1333',
      owasp: 'A03:2021-Injection',
      remediation: 'Avoid user input in regex, use safe-regex library'
    },

    // Sensitive Data Exposure — skip commented-out lines, require auth context
    {
      type: 'sensitive-data-exposure',
      pattern: /console\.log\s*\([^)]*(?:password|secret|credential)/gi,
      severity: 'medium',
      title: 'Sensitive Data in Logs',
      description: 'Sensitive information may be exposed in logs',
      cwe: 'CWE-532',
      owasp: 'A09:2021-Security Logging Failures',
      remediation: 'Remove sensitive data from logs, use masking'
    },
    {
      type: 'sensitive-data-exposure',
      pattern: /console\.log\s*\([^)]*(?:auth)/gi,
      severity: 'low',
      title: 'Auth Reference in Logs',
      description: 'Auth-related data may be exposed in debug logs',
      cwe: 'CWE-532',
      owasp: 'A09:2021-Security Logging Failures',
      remediation: 'Remove auth data from production logs',
      contextCheck: (code) => {
        // Only flag if actual auth values are being logged (not just function names)
        return /(?:password|secret|bearer|jwt|session_?id)\b/i.test(code);
      }
    },
    {
      type: 'sensitive-data-exposure',
      pattern: /console\.log\s*\([^)]*(?:token|key)\b/gi,
      severity: 'low',
      title: 'Possible Sensitive Data in Logs',
      description: 'Token/key reference in logs may expose sensitive data',
      cwe: 'CWE-532',
      owasp: 'A09:2021-Security Logging Failures',
      remediation: 'Verify no actual secrets are logged',
      contextCheck: (code) => {
        // Skip benign contexts where token/key are not security-related
        const benignPatterns = /(?:csrf|pagination|page|next|cursor|refresh|scorm|item|object|data|search|sort|column|restore|lic|license|tarif|division|result|module|app_mod|set_?value|get_?value|save|load|api_?key\s*=\s*process\.env)[\s_-]*(?:token|key)/i;
        if (benignPatterns.test(code)) return false;
        // Skip if 'key' is used as object property key (e.g., key=, key,value)
        if (/\bkey\s*[,=)]/i.test(code) && !/(?:api|secret|private|access|auth)[_-]?key/i.test(code)) return false;
        // Skip if 'token' is used in a counting/balance context (tokens_add, ai_tokens)
        if (/(?:tokens?[_-]?(?:add|left|count|balance|used)|ai[_-]?tokens?|my[_-]?tokens?|check[_-]?(?:my)?[_-]?tokens?)/i.test(code)) return false;
        return true;
      }
    },

    // Missing Security Headers
    {
      type: 'security-misconfiguration',
      pattern: /cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]/g,
      severity: 'medium',
      title: 'Overly Permissive CORS',
      description: 'CORS allows any origin',
      cwe: 'CWE-942',
      owasp: 'A05:2021-Security Misconfiguration',
      remediation: 'Specify allowed origins explicitly'
    },

    // Insecure Deserialization — eval()
    {
      type: 'insecure-deserialization',
      pattern: /eval\s*\(/g,
      severity: 'critical',
      title: 'Use of eval()',
      description: 'eval() can execute arbitrary code',
      cwe: 'CWE-95',
      owasp: 'A08:2021-Software and Data Integrity',
      remediation: 'Avoid eval(), use JSON.parse() or safer alternatives'
    },
    {
      type: 'insecure-deserialization',
      pattern: /new Function\s*\(/g,
      severity: 'high',
      title: 'Dynamic Function Creation',
      description: 'new Function() can execute arbitrary code',
      cwe: 'CWE-95',
      owasp: 'A08:2021-Software and Data Integrity',
      remediation: 'Avoid dynamic code execution'
    }
  ];

  private readonly secretPatterns: SecretPattern[] = [
    // API Keys
    {
      type: 'api-key',
      pattern: /['"](?:api[_-]?key|apikey)\s*['"]\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
      confidence: 'high'
    },
    {
      type: 'api-key',
      pattern: /(?:OPENAI|ANTHROPIC|DEEPSEEK|STRIPE|SENDGRID|TWILIO|GITHUB|GITLAB)[_]?(?:API)?[_]?KEY\s*[:=]\s*['"][^'"]+['"]/gi,
      confidence: 'high'
    },

    // AWS
    {
      type: 'aws-key',
      pattern: /AKIA[0-9A-Z]{16}/g,
      confidence: 'high'
    },
    {
      type: 'aws-key',
      pattern: /aws[_-]?(?:secret|access)[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/gi,
      confidence: 'high'
    },

    // Passwords
    {
      type: 'password',
      pattern: /['"]?(?:password|passwd|pwd)\s*['"]\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      confidence: 'high'
    },
    {
      type: 'password',
      pattern: /(?:DB|DATABASE|MYSQL|POSTGRES|MONGO)[_]?PASSWORD\s*[:=]\s*['"][^'"]+['"]/gi,
      confidence: 'high'
    },

    // Private Keys
    {
      type: 'private-key',
      pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
      confidence: 'high'
    },
    {
      type: 'private-key',
      pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
      confidence: 'high'
    },

    // JWT
    {
      type: 'jwt-secret',
      pattern: /(?:jwt|jws)[_-]?secret\s*[:=]\s*['"][^'"]{10,}['"]/gi,
      confidence: 'high'
    },
    {
      type: 'jwt-secret',
      pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
      confidence: 'medium'
    },

    // Database URLs
    {
      type: 'database-url',
      pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/gi,
      confidence: 'high'
    },

    // OAuth
    {
      type: 'oauth-secret',
      pattern: /(?:client|app)[_-]?secret\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
      confidence: 'high'
    },

    // Generic Secrets
    {
      type: 'generic-secret',
      pattern: /['"]?secret[_-]?(?:key|token)?\s*['"]\s*[:=]\s*['"][^'"]{10,}['"]/gi,
      confidence: 'medium'
    },
    {
      type: 'generic-secret',
      pattern: /['"]?(?:auth|access)[_-]?token\s*['"]\s*[:=]\s*['"][^'"]{20,}['"]/gi,
      confidence: 'medium'
    }
  ];

  /**
   * Анализ безопасности
   */
  async analyze(fileContents: Map<string, string>): Promise<SecurityResult> {
    Logger.progress('Analyzing security vulnerabilities...');

    const vulnerabilities: Vulnerability[] = [];
    const secrets: HardcodedSecret[] = [];
    let idCounter = 0;

    for (const [filePath, content] of fileContents) {
      // Include .vue files in security analysis
      if (!filePath.match(/\.(ts|js|tsx|jsx|vue|py|rb|php|java|go)$/)) continue;

      // Skip vendor/third-party files
      if (this.isVendorFile(filePath)) continue;

      const lines = content.split('\n');
      const isFrontend = this.isFrontendFile(filePath);
      const isConfig = this.isConfigFile(filePath);

      // Проверяем паттерны уязвимостей
      for (const pattern of this.vulnerabilityPatterns) {
        const matches = content.matchAll(pattern.pattern);

        for (const match of matches) {
          const matchIndex = match.index || 0;

          // Skip commented-out code
          if (this.isCommentedOut(content, matchIndex)) continue;

          // Проверяем контекст если нужно
          if (pattern.contextCheck) {
            const contextStart = Math.max(0, matchIndex - 200);
            const contextEnd = Math.min(content.length, matchIndex + 200);
            const context = content.substring(contextStart, contextEnd);
            if (!pattern.contextCheck(context, match, filePath)) continue;
          }

          const line = this.getLineNumber(content, matchIndex);
          const codeLine = lines[line - 1] || '';

          // Adjust severity for frontend files
          let severity = pattern.severity;
          if (isFrontend) {
            // XSS in Vue is lower risk (auto-escaping), v-html is intentional
            if (pattern.type === 'xss' && filePath.endsWith('.vue')) {
              severity = 'medium';
            }
          }
          // eval() in config files is expected (webpack/quasar config)
          if (isConfig && pattern.type === 'insecure-deserialization') {
            severity = 'info';
          }

          vulnerabilities.push({
            id: `SEC-${++idCounter}`,
            type: pattern.type,
            severity,
            title: pattern.title,
            description: pattern.description,
            file: filePath,
            line,
            code: codeLine.trim().substring(0, 100),
            cwe: pattern.cwe,
            owasp: pattern.owasp,
            remediation: pattern.remediation
          });
        }
      }

      // Проверяем секреты
      for (const pattern of this.secretPatterns) {
        const matches = content.matchAll(pattern.pattern);

        for (const match of matches) {
          const line = this.getLineNumber(content, match.index || 0);
          const codeLine = lines[line - 1] || '';

          // Пропускаем если это комментарий или пример
          if (codeLine.trim().startsWith('//') || codeLine.trim().startsWith('#')) continue;
          if (codeLine.includes('example') || codeLine.includes('placeholder')) continue;
          if (codeLine.includes('process.env') || codeLine.includes('getenv')) continue;

          secrets.push({
            type: pattern.type,
            file: filePath,
            line,
            preview: this.maskSecret(match[0]),
            confidence: pattern.confidence
          });
        }
      }
    }

    // Убираем дубликаты
    const uniqueVulns = this.deduplicateVulnerabilities(vulnerabilities);
    const uniqueSecrets = this.deduplicateSecrets(secrets);

    const summary = this.calculateSummary(uniqueVulns, uniqueSecrets);

    Logger.success(`Security analysis complete: ${uniqueVulns.length} vulnerabilities, ${uniqueSecrets.length} secrets`);

    return {
      vulnerabilities: uniqueVulns,
      secrets: uniqueSecrets,
      summary
    };
  }

  /**
   * Получить номер строки по индексу
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Маскировка секрета
   */
  private maskSecret(secret: string): string {
    if (secret.length <= 10) {
      return '*'.repeat(secret.length);
    }
    const visible = 4;
    return secret.substring(0, visible) + '*'.repeat(secret.length - visible * 2) + secret.substring(secret.length - visible);
  }

  /**
   * Удаление дубликатов уязвимостей
   */
  private deduplicateVulnerabilities(vulnerabilities: Vulnerability[]): Vulnerability[] {
    const seen = new Set<string>();
    return vulnerabilities.filter(v => {
      const key = `${v.file}:${v.line}:${v.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Удаление дубликатов секретов
   */
  private deduplicateSecrets(secrets: HardcodedSecret[]): HardcodedSecret[] {
    const seen = new Set<string>();
    return secrets.filter(s => {
      const key = `${s.file}:${s.line}:${s.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Подсчёт статистики
   */
  private calculateSummary(
    vulnerabilities: Vulnerability[],
    secrets: HardcodedSecret[]
  ): SecuritySummary {
    const critical = vulnerabilities.filter(v => v.severity === 'critical').length;
    const high = vulnerabilities.filter(v => v.severity === 'high').length;
    const medium = vulnerabilities.filter(v => v.severity === 'medium').length;
    const low = vulnerabilities.filter(v => v.severity === 'low').length;

    // Risk Score: 0-100 (выше = хуже)
    // Each severity tier has a cap to prevent medium-only findings from dominating
    const criticalScore = Math.min(50, critical * 25);
    const highScore = Math.min(30, high * 10);
    const mediumScore = Math.min(15, medium * 1);
    const lowScore = Math.min(5, low * 0.5);
    const secretsScore =
      Math.min(30, secrets.filter(s => s.confidence === 'high').length * 20) +
      Math.min(10, secrets.filter(s => s.confidence === 'medium').length * 5);

    const riskScore = Math.min(100, Math.round(
      criticalScore + highScore + mediumScore + lowScore + secretsScore
    ));

    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    // Grade primarily driven by critical/high; medium-only caps at C
    if (critical > 0) {
      grade = riskScore > 50 ? 'F' : 'D';
    } else if (high > 0) {
      grade = riskScore > 40 ? 'D' : 'C';
    } else if (riskScore === 0) {
      grade = 'A';
    } else if (riskScore <= 5) {
      grade = 'B';
    } else {
      grade = 'C';  // medium/low only = max C grade
    }

    return {
      totalVulnerabilities: vulnerabilities.length,
      critical,
      high,
      medium,
      low,
      secretsFound: secrets.length,
      riskScore,
      grade
    };
  }
}
