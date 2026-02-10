import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class Logger {
  // Default to WARN in production, INFO/DEBUG only when DEBUG env var is set
  private static level: LogLevel = process.env.DEBUG ? LogLevel.DEBUG : LogLevel.WARN;

  static setLevel(level: LogLevel) {
    this.level = level;
  }

  static debug(message: string, data?: unknown) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${message}`), data || '');
    }
  }

  static info(message: string, data?: unknown) {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.blue(`[INFO] ${message}`), data || '');
    }
  }

  static warn(message: string, data?: unknown) {
    if (this.level <= LogLevel.WARN) {
      console.warn(chalk.yellow(`[WARN] ${message}`), data || '');
    }
  }

  static error(message: string, error?: unknown) {
    if (this.level <= LogLevel.ERROR) {
      console.error(chalk.red(`[ERROR] ${message}`), error || '');
    }
  }

  static success(message: string) {
    console.log(chalk.green(`✓ ${message}`));
  }

  static progress(message: string) {
    console.log(chalk.cyan(`⟳ ${message}`));
  }
}
