/**
 * CLI UI Utilities - Tables, progress, colors
 */

import chalk from 'chalk';

export function header(text: string): void {
  console.log('');
  console.log(chalk.bold.cyan(`  ${text}`));
  console.log(chalk.gray('  ' + '─'.repeat(text.length + 4)));
}

export function success(text: string): void {
  console.log(chalk.green(`  ✓ ${text}`));
}

export function warning(text: string): void {
  console.log(chalk.yellow(`  ⚠ ${text}`));
}

export function error(text: string): void {
  console.log(chalk.red(`  ✗ ${text}`));
}

export function info(text: string): void {
  console.log(chalk.blue(`  ℹ ${text}`));
}

export function dim(text: string): void {
  console.log(chalk.gray(`  ${text}`));
}

export function table(headers: string[], rows: string[][]): void {
  // Simple table formatting
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      if (row[i] && row[i].length > max) max = row[i].length;
    }
    return Math.min(max + 2, 60);
  });

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  console.log(chalk.bold(`  ${headerLine}`));
  console.log(chalk.gray(`  ${colWidths.map(w => '─'.repeat(w)).join('──')}`));

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join('  ');
    console.log(`  ${line}`);
  }
}

export function severity(level: string): string {
  switch (level) {
    case 'critical': return chalk.bgRed.white(' CRITICAL ');
    case 'high': return chalk.red('HIGH');
    case 'medium': return chalk.yellow('MEDIUM');
    case 'low': return chalk.gray('LOW');
    default: return level;
  }
}

export function badge(text: string, color: 'green' | 'yellow' | 'red' | 'blue' | 'gray'): string {
  const colors = {
    green: chalk.green,
    yellow: chalk.yellow,
    red: chalk.red,
    blue: chalk.blue,
    gray: chalk.gray,
  };
  return colors[color](`[${text}]`);
}
