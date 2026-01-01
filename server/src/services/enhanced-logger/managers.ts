import fs from 'fs-extra';
import path from 'path';
import { format } from 'date-fns';
import { LogEntry, LogStats, LogLevel } from './types.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LogRotationManager {
  private logDir: string = path.join(__dirname, '../../../../logs');
  private maxFileSize: number = 50 * 1024 * 1024;
  private currentLogFile: string;
  private currentFileSize: number = 0;

  constructor() {
    this.currentLogFile = this.getCurrentLogFileName();
  }

  private getCurrentLogFileName(): string {
    return path.join(this.logDir, `summy-${format(new Date(), 'yyyy-MM-dd')}.log`);
  }

  async rotateLog(): Promise<void> {
    if (this.currentFileSize >= this.maxFileSize) {
      this.currentLogFile = this.getCurrentLogFileName();
      this.currentFileSize = 0;
    }
  }

  async ensureLogDirectory(): Promise<void> { await fs.ensureDir(this.logDir); }
  async getLogFileSize(): Promise<number> { try { return (await fs.stat(this.currentLogFile)).size; } catch { return 0; } }
  async updateFileSize(size: number): Promise<void> { this.currentFileSize = size; }
  getLogFilePath(): string { return this.currentLogFile; }
}

export class LogAggregator {
  private buffer: LogEntry[] = [];
  private maxBufferSize: number = 100;

  addEntry(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= this.maxBufferSize) this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = [...this.buffer];
    this.buffer = [];
    try {
      const logManager = await LogFileManager.getInstance();
      await logManager.writeBatch(entries);
    } catch {}
  }
}

export class LogFileManager {
  private static instance: LogFileManager;
  private rotationManager: LogRotationManager;
  private aggregator: LogAggregator;

  private constructor() {
    this.rotationManager = new LogRotationManager();
    this.aggregator = new LogAggregator();
  }

  static async getInstance(): Promise<LogFileManager> {
    if (!LogFileManager.instance) {
      LogFileManager.instance = new LogFileManager();
      await LogFileManager.instance.rotationManager.ensureLogDirectory();
    }
    return LogFileManager.instance;
  }

  async write(entry: LogEntry): Promise<void> {
    await this.rotationManager.rotateLog();
    this.aggregator.addEntry(entry);
  }

  async writeBatch(entries: LogEntry[]): Promise<void> {
    const logPath = this.rotationManager.getLogFilePath();
    const logContent = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(logPath, logContent);
    this.rotationManager.updateFileSize(await this.rotationManager.getLogFileSize());
  }

  async getStats(): Promise<LogStats> {
    const stats: LogStats = { total: 0, byLevel: { 0:0, 1:0, 2:0, 3:0, 4:0 } as any, byType: {} as any, byModule: {}, byComponent: {}, errors: 0, warnings: 0, recentErrors: [] };
    try {
      const content = await fs.readFile(this.rotationManager.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      for (const line of lines) {
        if (!line) continue;
        const entry = JSON.parse(line) as LogEntry;
        stats.total++;
        stats.byLevel[entry.level]++;
        if (entry.level === LogLevel.ERROR) stats.errors++;
      }
    } catch {}
    return stats;
  }
}
