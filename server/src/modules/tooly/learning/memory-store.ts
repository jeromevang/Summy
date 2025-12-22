/**
 * Memory Store
 * Long-term memory CRUD operations for global, project, and pattern memories
 */

import { db } from '../../../services/database.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// TYPES
// ============================================================

export interface GlobalMemory {
  key: string;
  value: string;
  confidence: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemory {
  id: string;
  projectPath: string;
  key: string;
  value: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface PatternMemory {
  id: string;
  patternType: string;
  trigger: string;
  action: string;
  successRate: number;
  occurrenceCount: number;
  lastUsed: string;
}

export interface LearningInteraction {
  id: string;
  modelId: string;
  userRequest: string;
  modelResponse: string;
  userFeedback: string | null;
  correction: string | null;
  extractedPattern: string | null;
  timestamp: string;
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

/**
 * Initialize memory tables if they don't exist
 */
export function initMemoryTables(): void {
  // Global preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_global (
      key TEXT PRIMARY KEY,
      value TEXT,
      confidence REAL DEFAULT 1.0,
      source TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // Project-specific knowledge
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_project (
      id TEXT PRIMARY KEY,
      project_path TEXT,
      key TEXT,
      value TEXT,
      importance TEXT DEFAULT 'medium',
      created_at TEXT,
      UNIQUE(project_path, key)
    )
  `);

  // Learned patterns
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT,
      trigger TEXT,
      action TEXT,
      success_rate REAL DEFAULT 1.0,
      occurrence_count INTEGER DEFAULT 1,
      last_used TEXT
    )
  `);

  // Interaction history for learning
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_interactions (
      id TEXT PRIMARY KEY,
      model_id TEXT,
      user_request TEXT,
      model_response TEXT,
      user_feedback TEXT,
      correction TEXT,
      extracted_pattern TEXT,
      timestamp TEXT
    )
  `);
}

// ============================================================
// GLOBAL MEMORY OPERATIONS
// ============================================================

export class GlobalMemoryStore {
  /**
   * Get a global memory value
   */
  get(key: string): GlobalMemory | null {
    const row = db.prepare(`
      SELECT key, value, confidence, source, created_at, updated_at 
      FROM memory_global WHERE key = ?
    `).get(key) as any;
    
    if (!row) return null;
    
    return {
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  
  /**
   * Set a global memory value
   */
  set(key: string, value: string, source: string = 'system', confidence: number = 1.0): void {
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO memory_global (key, value, confidence, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET 
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).run(key, value, confidence, source, now, now);
  }
  
  /**
   * Delete a global memory value
   */
  delete(key: string): boolean {
    const result = db.prepare(`DELETE FROM memory_global WHERE key = ?`).run(key);
    return result.changes > 0;
  }
  
  /**
   * List all global memories
   */
  list(): GlobalMemory[] {
    const rows = db.prepare(`
      SELECT key, value, confidence, source, created_at, updated_at 
      FROM memory_global ORDER BY updated_at DESC
    `).all() as any[];
    
    return rows.map(row => ({
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  
  /**
   * Search global memories by key or value
   */
  search(query: string): GlobalMemory[] {
    const rows = db.prepare(`
      SELECT key, value, confidence, source, created_at, updated_at 
      FROM memory_global 
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY confidence DESC
    `).all(`%${query}%`, `%${query}%`) as any[];
    
    return rows.map(row => ({
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}

// ============================================================
// PROJECT MEMORY OPERATIONS
// ============================================================

export class ProjectMemoryStore {
  /**
   * Get project memories
   */
  getForProject(projectPath: string): ProjectMemory[] {
    const rows = db.prepare(`
      SELECT id, project_path, key, value, importance, created_at 
      FROM memory_project WHERE project_path = ?
      ORDER BY created_at DESC
    `).all(projectPath) as any[];
    
    return rows.map(row => ({
      id: row.id,
      projectPath: row.project_path,
      key: row.key,
      value: row.value,
      importance: row.importance,
      createdAt: row.created_at
    }));
  }
  
  /**
   * Set a project memory
   */
  set(projectPath: string, key: string, value: string, importance: ProjectMemory['importance'] = 'medium'): string {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO memory_project (id, project_path, key, value, importance, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_path, key) DO UPDATE SET 
        value = excluded.value,
        importance = excluded.importance
    `).run(id, projectPath, key, value, importance, now);
    
    return id;
  }
  
  /**
   * Delete a project memory
   */
  delete(id: string): boolean {
    const result = db.prepare(`DELETE FROM memory_project WHERE id = ?`).run(id);
    return result.changes > 0;
  }
  
  /**
   * Get high-importance memories for a project
   */
  getImportant(projectPath: string): ProjectMemory[] {
    const rows = db.prepare(`
      SELECT id, project_path, key, value, importance, created_at 
      FROM memory_project 
      WHERE project_path = ? AND importance IN ('high', 'critical')
      ORDER BY 
        CASE importance 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
        END,
        created_at DESC
    `).all(projectPath) as any[];
    
    return rows.map(row => ({
      id: row.id,
      projectPath: row.project_path,
      key: row.key,
      value: row.value,
      importance: row.importance,
      createdAt: row.created_at
    }));
  }
}

// ============================================================
// PATTERN MEMORY OPERATIONS
// ============================================================

export class PatternMemoryStore {
  /**
   * Store a learned pattern
   */
  store(pattern: Omit<PatternMemory, 'id'>): string {
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO memory_patterns (id, pattern_type, trigger, action, success_rate, occurrence_count, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, pattern.patternType, pattern.trigger, pattern.action, 
           pattern.successRate, pattern.occurrenceCount, pattern.lastUsed);
    
    return id;
  }
  
  /**
   * Get a pattern by ID
   */
  get(id: string): PatternMemory | null {
    const row = db.prepare(`
      SELECT id, pattern_type, trigger, action, success_rate, occurrence_count, last_used 
      FROM memory_patterns WHERE id = ?
    `).get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      patternType: row.pattern_type,
      trigger: row.trigger,
      action: row.action,
      successRate: row.success_rate,
      occurrenceCount: row.occurrence_count,
      lastUsed: row.last_used
    };
  }
  
  /**
   * Update pattern success rate
   */
  updateSuccess(id: string, success: boolean): void {
    const pattern = this.get(id);
    if (!pattern) return;
    
    const newCount = pattern.occurrenceCount + 1;
    const newRate = success 
      ? (pattern.successRate * pattern.occurrenceCount + 1) / newCount
      : (pattern.successRate * pattern.occurrenceCount) / newCount;
    
    db.prepare(`
      UPDATE memory_patterns 
      SET success_rate = ?, occurrence_count = ?, last_used = ?
      WHERE id = ?
    `).run(newRate, newCount, new Date().toISOString(), id);
  }
  
  /**
   * Find patterns matching a trigger
   */
  findByTrigger(trigger: string): PatternMemory[] {
    const rows = db.prepare(`
      SELECT id, pattern_type, trigger, action, success_rate, occurrence_count, last_used 
      FROM memory_patterns 
      WHERE trigger LIKE ?
      ORDER BY success_rate DESC, occurrence_count DESC
    `).all(`%${trigger}%`) as any[];
    
    return rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type,
      trigger: row.trigger,
      action: row.action,
      successRate: row.success_rate,
      occurrenceCount: row.occurrence_count,
      lastUsed: row.last_used
    }));
  }
  
  /**
   * Get top patterns by success rate
   */
  getTopPatterns(limit: number = 10): PatternMemory[] {
    const rows = db.prepare(`
      SELECT id, pattern_type, trigger, action, success_rate, occurrence_count, last_used 
      FROM memory_patterns 
      ORDER BY success_rate DESC, occurrence_count DESC
      LIMIT ?
    `).all(limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type,
      trigger: row.trigger,
      action: row.action,
      successRate: row.success_rate,
      occurrenceCount: row.occurrence_count,
      lastUsed: row.last_used
    }));
  }
  
  /**
   * Delete stale patterns
   */
  deleteStale(maxAgeDays: number = 30, minSuccessRate: number = 0.5): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    
    const result = db.prepare(`
      DELETE FROM memory_patterns 
      WHERE last_used < ? AND success_rate < ?
    `).run(cutoff.toISOString(), minSuccessRate);
    
    return result.changes;
  }
}

// ============================================================
// INTERACTION STORE
// ============================================================

export class InteractionStore {
  /**
   * Store an interaction for learning
   */
  store(interaction: Omit<LearningInteraction, 'id'>): string {
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO learning_interactions 
      (id, model_id, user_request, model_response, user_feedback, correction, extracted_pattern, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, 
      interaction.modelId, 
      interaction.userRequest, 
      interaction.modelResponse,
      interaction.userFeedback,
      interaction.correction,
      interaction.extractedPattern,
      interaction.timestamp
    );
    
    return id;
  }
  
  /**
   * Get interactions for a model
   */
  getForModel(modelId: string, limit: number = 100): LearningInteraction[] {
    const rows = db.prepare(`
      SELECT id, model_id, user_request, model_response, user_feedback, correction, extracted_pattern, timestamp
      FROM learning_interactions 
      WHERE model_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(modelId, limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      modelId: row.model_id,
      userRequest: row.user_request,
      modelResponse: row.model_response,
      userFeedback: row.user_feedback,
      correction: row.correction,
      extractedPattern: row.extracted_pattern,
      timestamp: row.timestamp
    }));
  }
  
  /**
   * Get interactions with corrections (for learning)
   */
  getCorrections(limit: number = 50): LearningInteraction[] {
    const rows = db.prepare(`
      SELECT id, model_id, user_request, model_response, user_feedback, correction, extracted_pattern, timestamp
      FROM learning_interactions 
      WHERE correction IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      modelId: row.model_id,
      userRequest: row.user_request,
      modelResponse: row.model_response,
      userFeedback: row.user_feedback,
      correction: row.correction,
      extractedPattern: row.extracted_pattern,
      timestamp: row.timestamp
    }));
  }
}

// ============================================================
// EXPORTS
// ============================================================

export const globalMemory = new GlobalMemoryStore();
export const projectMemory = new ProjectMemoryStore();
export const patternMemory = new PatternMemoryStore();
export const interactionStore = new InteractionStore();

// Initialize tables on import
try {
  initMemoryTables();
} catch (e) {
  console.warn('[MemoryStore] Could not initialize tables:', e);
}

export default {
  global: globalMemory,
  project: projectMemory,
  pattern: patternMemory,
  interactions: interactionStore,
  initMemoryTables
};

