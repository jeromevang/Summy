/**
 * Prosthetic Store
 * 
 * Persists prosthetic prompts that compensate for model weaknesses.
 * These prompts are auto-applied when the model is loaded for use.
 * 
 * Storage: server/data/prosthetic-prompts.json
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

export interface ProstheticVersion {
  version: number;
  prompt: string;
  createdAt: string;
  scoreImprovement: number;
  testedAgainst: string[]; // Test IDs
}

export interface ProstheticEntry {
  modelId: string;
  prompt: string;
  level: 1 | 2 | 3 | 4;
  probesFixed: string[];
  categoryImprovements: {
    tool?: number;
    rag?: number;
    reasoning?: number;
    intent?: number;
    browser?: number;
  };
  createdAt: string;
  updatedAt: string;
  successfulRuns: number;
  verified: boolean;
  // NEW: Version tracking
  currentVersion: number;
  versions: ProstheticVersion[];
  // NEW: Task-type targeting
  targetTaskTypes?: string[]; // ['rag_heavy', 'tool_heavy', 'reasoning']
  contextSizeRange?: [number, number]; // [minTokens, maxTokens]
  // NEW: Distillation source
  learnedFromModel?: string;
}

interface ProstheticStoreData {
  version: number;
  entries: Record<string, ProstheticEntry>;
  lastUpdated: string;
}

// ============================================================
// PROSTHETIC STORE CLASS
// ============================================================

class ProstheticStore {
  private storagePath: string;
  private data: ProstheticStoreData;

  constructor() {
    this.storagePath = path.join(__dirname, '../../../../../data/prosthetic-prompts.json');
    this.data = this.load();
  }

  /**
   * Load store from disk
   */
  private load(): ProstheticStoreData {
    try {
      if (fs.existsSync(this.storagePath)) {
        return fs.readJsonSync(this.storagePath);
      }
    } catch (error) {
      console.error('[ProstheticStore] Error loading store:', error);
    }
    
    // Return default empty store
    return {
      version: 1,
      entries: {},
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Save store to disk
   */
  private save(): void {
    try {
      fs.ensureDirSync(path.dirname(this.storagePath));
      this.data.lastUpdated = new Date().toISOString();
      fs.writeJsonSync(this.storagePath, this.data, { spaces: 2 });
    } catch (error) {
      console.error('[ProstheticStore] Error saving store:', error);
    }
  }

  /**
   * Get prosthetic prompt for a model
   */
  getPrompt(modelId: string): ProstheticEntry | null {
    return this.data.entries[modelId] || null;
  }

  /**
   * Save prosthetic prompt for a model
   */
  savePrompt(entry: Omit<ProstheticEntry, 'createdAt' | 'updatedAt' | 'successfulRuns' | 'verified' | 'currentVersion' | 'versions'>): void {
    const existingEntry = this.data.entries[entry.modelId];
    const now = new Date().toISOString();

    // Handle versioning
    const currentVersion = (existingEntry?.currentVersion || 0) + 1;
    const newVersion: ProstheticVersion = {
      version: currentVersion,
      prompt: entry.prompt,
      createdAt: now,
      scoreImprovement: 0,
      testedAgainst: entry.probesFixed || []
    };

    const versions = existingEntry?.versions || [];
    versions.push(newVersion);

    this.data.entries[entry.modelId] = {
      ...entry,
      createdAt: existingEntry?.createdAt || now,
      updatedAt: now,
      successfulRuns: existingEntry?.successfulRuns || 0,
      verified: false,
      currentVersion,
      versions,
      targetTaskTypes: entry.targetTaskTypes || [],
      contextSizeRange: entry.contextSizeRange,
      learnedFromModel: entry.learnedFromModel
    };

    this.save();
    console.log(`[ProstheticStore] Saved prosthetic for ${entry.modelId} (Level ${entry.level}, Version ${currentVersion})`);
  }

  /**
   * Update existing prosthetic prompt
   */
  updatePrompt(modelId: string, updates: Partial<ProstheticEntry>): void {
    const existing = this.data.entries[modelId];
    if (!existing) {
      console.warn(`[ProstheticStore] No existing entry for ${modelId}`);
      return;
    }

    this.data.entries[modelId] = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.save();
  }

  /**
   * Increment successful runs count
   */
  incrementSuccess(modelId: string): void {
    const entry = this.data.entries[modelId];
    if (entry) {
      entry.successfulRuns += 1;
      entry.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Mark prosthetic as verified (passed re-test)
   */
  markVerified(modelId: string): void {
    const entry = this.data.entries[modelId];
    if (entry) {
      entry.verified = true;
      entry.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Delete prosthetic for a model
   */
  deletePrompt(modelId: string): boolean {
    if (this.data.entries[modelId]) {
      delete this.data.entries[modelId];
      this.save();
      console.log(`[ProstheticStore] Deleted prosthetic for ${modelId}`);
      return true;
    }
    return false;
  }

  /**
   * List all prosthetic entries
   */
  listPrompts(): ProstheticEntry[] {
    return Object.values(this.data.entries);
  }

  /**
   * Get all model IDs with prosthetics
   */
  getModelIds(): string[] {
    return Object.keys(this.data.entries);
  }

  /**
   * Check if a model has a prosthetic
   */
  hasProsthetic(modelId: string): boolean {
    return modelId in this.data.entries;
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalEntries: number;
    verifiedCount: number;
    levelDistribution: Record<number, number>;
    avgSuccessfulRuns: number;
  } {
    const entries = Object.values(this.data.entries);
    const levelDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    
    for (const entry of entries) {
      levelDistribution[entry.level] = (levelDistribution[entry.level] || 0) + 1;
    }

    const totalRuns = entries.reduce((sum, e) => sum + e.successfulRuns, 0);

    return {
      totalEntries: entries.length,
      verifiedCount: entries.filter(e => e.verified).length,
      levelDistribution,
      avgSuccessfulRuns: entries.length > 0 ? totalRuns / entries.length : 0
    };
  }

  /**
   * Export all data (for backup)
   */
  export(): ProstheticStoreData {
    return { ...this.data };
  }

  /**
   * Import data (from backup)
   */
  import(data: ProstheticStoreData): void {
    this.data = data;
    this.save();
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

export const prostheticStore = new ProstheticStore();

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Build the prosthetic prompt text for a model based on its failures
 */
export function buildProstheticPrompt(
  failedTests: Array<{ id: string; category: string; details: string }>,
  level: 1 | 2 | 3 | 4
): string {
  const lines: string[] = [];

  // Header based on level
  if (level >= 2) {
    lines.push('## CRITICAL BEHAVIOR REQUIREMENTS');
    lines.push('');
  }

  // Group failures by category
  const byCategory: Record<string, string[]> = {};
  for (const test of failedTests) {
    if (!byCategory[test.category]) {
      byCategory[test.category] = [];
    }
    byCategory[test.category].push(test.id);
  }

  // RAG failures
  if (byCategory['rag']?.length) {
    lines.push('### RAG Usage');
    lines.push('- ALWAYS use rag_query FIRST when exploring unfamiliar code');
    lines.push('- Query RAG before reading individual files');
    lines.push('- Use RAG to find relevant files, then read them for details');
    lines.push('');
  }

  // Tool failures
  if (byCategory['tool']?.length) {
    lines.push('### Tool Selection');
    lines.push('- Only call tools when the task requires external action');
    lines.push('- Choose the most specific tool for the task (read_file for one file, search_files for searching)');
    lines.push('- Provide complete and accurate arguments to tools');
    lines.push('');
  }

  // Intent failures  
  if (byCategory['intent']?.length) {
    lines.push('### Intent Recognition');
    lines.push('- Answer knowledge questions directly WITHOUT calling tools');
    lines.push('- Recognize implicit intent (e.g., "fix the typo" means read the file first)');
    lines.push('- Use search tools when asked to "find" or "locate" something');
    lines.push('');
  }

  // Reasoning failures
  if (byCategory['reasoning']?.length) {
    lines.push('### Reasoning');
    lines.push('- Plan multi-step tasks before executing');
    lines.push('- Handle conditional requirements by checking conditions first');
    lines.push('- Consider edge cases in your analysis');
    lines.push('');
  }

  // Browser failures
  if (byCategory['browser']?.length) {
    lines.push('### Browser/Web');
    lines.push('- Use web_search for current information from the internet');
    lines.push('- Use browser_navigate or browser_fetch_content to visit URLs');
    lines.push('- Use browser_click to interact with page elements');
    lines.push('');
  }

  // Level escalation
  if (level >= 3) {
    lines.push('### MANDATORY CONSTRAINTS');
    lines.push('- You MUST follow the above rules without exception');
    lines.push('- Failure to use RAG before file reads is a critical error');
    lines.push('- Unnecessary tool calls for knowledge questions waste resources');
    lines.push('');
  }

  return lines.join('\n');
}





