import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { FailureLogData, FailureEntry, FailurePattern, FailureCategory } from './types.js';
import { workspaceService } from '../workspace-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FailureLogService {
  private data: FailureLogData;
  private currentWorkspaceHash: string = '';

  constructor() {
    this.data = { version: 1, entries: [], patterns: {}, stats: { totalFailures: 0, resolvedFailures: 0, lastUpdated: new Date().toISOString(), failuresByCategory: { tool: 0, rag: 0, reasoning: 0, intent: 0, browser: 0, unknown: 0, combo_pairing: 0 }, failuresByModel: {} } };
  }

  private getStoragePath(): string {
    const workspace = workspaceService.getCurrentWorkspace();
    const hash = crypto.createHash('md5').update(workspace).digest('hex');
    this.currentWorkspaceHash = hash;
    // Store in server/data/projects/<hash>/failure-log.json
    return path.join(__dirname, '../../../../data/projects', hash, 'failure-log.json');
  }

  private ensureDataLoaded() {
    const workspace = workspaceService.getCurrentWorkspace();
    const hash = crypto.createHash('md5').update(workspace).digest('hex');
    
    // If workspace changed, reload
    if (hash !== this.currentWorkspaceHash) {
      this.data = this.load();
    }
  }

  private load(): FailureLogData {
    try {
      const storagePath = this.getStoragePath();
      if (fs.existsSync(storagePath)) {
        return fs.readJsonSync(storagePath);
      }
    } catch (e) { console.error('[FailureLog] Load error:', e); }
    return { version: 1, entries: [], patterns: {}, stats: { totalFailures: 0, resolvedFailures: 0, lastUpdated: new Date().toISOString(), failuresByCategory: { tool: 0, rag: 0, reasoning: 0, intent: 0, browser: 0, unknown: 0, combo_pairing: 0 }, failuresByModel: {} } };
  }

  private save(): void {
    try {
      const storagePath = this.getStoragePath();
      fs.ensureDirSync(path.dirname(storagePath));
      this.data.stats.lastUpdated = new Date().toISOString();
      fs.writeJsonSync(storagePath, this.data, { spaces: 2 });
    } catch (e) { console.error('[FailureLog] Save error:', e); }
  }

  logFailure(params: any): FailureEntry {
    this.ensureDataLoaded();
    const id = `fail_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const errorType = this.classifyError(params.error);
    const entry: FailureEntry = {
      id, timestamp: new Date().toISOString(), 
      modelId: params.modelId,
      executorModelId: params.executorModelId,
      category: params.category, tool: params.tool, error: params.error, errorType,
      context: { query: params.query, queryHash: crypto.createHash('md5').update(params.query).digest('hex').substring(0, 8), conversationLength: params.conversationLength || 1 },
      resolved: false
    };
    entry.pattern = this.detectPattern(entry);
    if (entry.pattern) this.updatePattern(entry);
    this.data.entries.push(entry);
    this.data.stats.totalFailures++;
    this.data.stats.failuresByCategory[params.category as FailureCategory]++;
    this.save();
    return entry;
  }

  private classifyError(error: string): string {
    const e = error.toLowerCase();
    if (e.includes('timeout')) return 'timeout';
    if (e.includes('tool') && e.includes('not')) return 'tool_not_called';
    return 'unknown';
  }

  private detectPattern(entry: FailureEntry): string | undefined {
    if (entry.category === 'rag' && entry.errorType === 'rag_not_used') return 'RAG_NOT_USED_BEFORE_READ';
    return undefined;
  }

  private updatePattern(entry: FailureEntry): void {
    const pid = entry.pattern!;
    if (!this.data.patterns[pid]) {
      this.data.patterns[pid] = { id: pid, name: pid, description: '', category: entry.category, count: 0, firstSeen: entry.timestamp, lastSeen: entry.timestamp, examples: [], severity: 'medium' };
    }
    this.data.patterns[pid].count++;
    this.data.patterns[pid].lastSeen = entry.timestamp;
  }

  getFailures(options?: any) { 
    this.ensureDataLoaded();
    return this.data.entries; 
  }
  
  getStats() { 
    this.ensureDataLoaded();
    return this.data.stats; 
  }
  
  getAnalysisSummary() { 
    this.ensureDataLoaded();
    return { unresolvedPatterns: Object.values(this.data.patterns), recentFailures: this.data.entries.slice(-20), modelSummary: [] }; 
  }
  
  markResolved(ids: string[], pid: string) { return 0; }
  clearForModel(mid: string) { return 0; }
  clearOld(days: number) { return 0; }
}

export const failureLog = new FailureLogService();