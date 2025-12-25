import { v4 as uuidv4 } from 'uuid';
import { DBBase } from './db-base.js';

export class DBConfig extends DBBase {
    // ============================================================
    // RAG CONFIG (Still needed for UI settings sync)
    // ============================================================

    public getRAGConfig(): {
        lmstudio: { model: string | null; loadOnDemand: boolean; };
        storage: { dataPath: string | null; };
        indexing: { chunkSize: number; chunkOverlap: number; includePatterns: string[]; excludePatterns: string[]; };
        watcher: { enabled: boolean; debounceMs: number; };
        project: { path: string | null; autoDetect: boolean; };
    } | null {
        const row = this.get(`SELECT * FROM rag_config WHERE id = 'active'`);

        if (!row) {
            return {
                lmstudio: { model: null, loadOnDemand: true },
                storage: { dataPath: null },
                indexing: {
                    chunkSize: 1500,
                    chunkOverlap: 200,
                    includePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go', '**/*.rs', '**/*.java', '**/*.cpp', '**/*.c', '**/*.h', '**/*.cs', '**/*.rb', '**/*.php', '**/*.swift', '**/*.kt'],
                    excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/vendor/**', '**/__pycache__/**', '**/target/**']
                },
                watcher: { enabled: true, debounceMs: 1000 },
                project: { path: null, autoDetect: true }
            };
        }

        return {
            lmstudio: {
                model: row.lmstudio_model,
                loadOnDemand: !!row.lmstudio_load_on_demand
            },
            storage: {
                dataPath: row.storage_data_path
            },
            indexing: {
                chunkSize: row.indexing_chunk_size || 1500,
                chunkOverlap: row.indexing_chunk_overlap || 200,
                includePatterns: JSON.parse(row.indexing_include_patterns || '[]'),
                excludePatterns: JSON.parse(row.indexing_exclude_patterns || '[]')
            },
            watcher: {
                enabled: !!row.watcher_enabled,
                debounceMs: row.watcher_debounce_ms || 1000
            },
            project: {
                path: row.project_path,
                autoDetect: !!row.project_auto_detect
            }
        };
    }

    public saveRAGConfig(config: {
        lmstudio?: { model?: string | null; loadOnDemand?: boolean };
        storage?: { dataPath?: string | null };
        indexing?: { chunkSize?: number; chunkOverlap?: number; includePatterns?: string[]; excludePatterns?: string[] };
        watcher?: { enabled?: boolean; debounceMs?: number };
        project?: { path?: string | null; autoDetect?: boolean };
    }): boolean {
        try {
            const current = this.getRAGConfig();
            if (!current) return false;

            const merged = {
                lmstudio: { ...current.lmstudio, ...config.lmstudio },
                storage: { ...current.storage, ...config.storage },
                indexing: { ...current.indexing, ...config.indexing },
                watcher: { ...current.watcher, ...config.watcher },
                project: { ...current.project, ...config.project }
            };

            const exists = this.get(`SELECT 1 FROM rag_config WHERE id = 'active'`);

            if (exists) {
                this.run(`
          UPDATE rag_config SET
            lmstudio_model = ?,
            lmstudio_load_on_demand = ?,
            storage_data_path = ?,
            indexing_chunk_size = ?,
            indexing_chunk_overlap = ?,
            indexing_include_patterns = ?,
            indexing_exclude_patterns = ?,
            watcher_enabled = ?,
            watcher_debounce_ms = ?,
            project_path = ?,
            project_auto_detect = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = 'active'
        `, [
                    merged.lmstudio.model,
                    merged.lmstudio.loadOnDemand ? 1 : 0,
                    merged.storage.dataPath,
                    merged.indexing.chunkSize,
                    merged.indexing.chunkOverlap,
                    JSON.stringify(merged.indexing.includePatterns),
                    JSON.stringify(merged.indexing.excludePatterns),
                    merged.watcher.enabled ? 1 : 0,
                    merged.watcher.debounceMs,
                    merged.project.path,
                    merged.project.autoDetect ? 1 : 0
                ]);
            } else {
                this.run(`
          INSERT INTO rag_config (
            id, lmstudio_model, lmstudio_load_on_demand, storage_data_path,
            indexing_chunk_size, indexing_chunk_overlap, indexing_include_patterns, indexing_exclude_patterns,
            watcher_enabled, watcher_debounce_ms, project_path, project_auto_detect
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                    'active',
                    merged.lmstudio.model,
                    merged.lmstudio.loadOnDemand ? 1 : 0,
                    merged.storage.dataPath,
                    merged.indexing.chunkSize,
                    merged.indexing.chunkOverlap,
                    JSON.stringify(merged.indexing.includePatterns),
                    JSON.stringify(merged.indexing.excludePatterns),
                    merged.watcher.enabled ? 1 : 0,
                    merged.watcher.debounceMs,
                    merged.project.path,
                    merged.project.autoDetect ? 1 : 0
                ]);
            }
            return true;
        } catch (error) {
            console.error('[DB] Failed to save RAG config:', error);
            return false;
        }
    }

    // ============================================================
    // CUSTOM TESTS CRUD
    // ============================================================

    public createCustomTest(test: {
        id?: string;
        name: string;
        category: string;
        prompt: string;
        expectedTool?: string;
        expectedBehavior?: string;
        difficulty?: string;
        variants?: any[];
    }): string {
        const id = test.id || uuidv4();
        const now = new Date().toISOString();

        this.run(`
      INSERT INTO custom_tests (id, name, category, prompt, expected_tool, expected_behavior, difficulty, variants, is_builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `, [
            id,
            test.name,
            test.category,
            test.prompt,
            test.expectedTool || null,
            test.expectedBehavior || null,
            test.difficulty || 'medium',
            test.variants ? JSON.stringify(test.variants) : null,
            now,
            now
        ]);

        return id;
    }

    public getCustomTests(): any[] {
        const rows = this.query('SELECT * FROM custom_tests ORDER BY category, name');

        return rows.map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            prompt: row.prompt,
            expectedTool: row.expected_tool,
            expectedBehavior: row.expected_behavior,
            difficulty: row.difficulty,
            variants: row.variants ? JSON.parse(row.variants) : [],
            isBuiltin: row.is_builtin === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    public getCustomTest(id: string): any | null {
        const row = this.get('SELECT * FROM custom_tests WHERE id = ?', [id]);
        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            category: row.category,
            prompt: row.prompt,
            expectedTool: row.expected_tool,
            expectedBehavior: row.expected_behavior,
            difficulty: row.difficulty,
            variants: row.variants ? JSON.parse(row.variants) : [],
            isBuiltin: row.is_builtin === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    public updateCustomTest(id: string, updates: {
        name?: string;
        category?: string;
        prompt?: string;
        expectedTool?: string;
        expectedBehavior?: string;
        difficulty?: string;
        variants?: any[];
    }): boolean {
        const test = this.getCustomTest(id);
        if (!test || test.isBuiltin) return false;

        const now = new Date().toISOString();
        const result = this.run(`
      UPDATE custom_tests SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        prompt = COALESCE(?, prompt),
        expected_tool = COALESCE(?, expected_tool),
        expected_behavior = COALESCE(?, expected_behavior),
        difficulty = COALESCE(?, difficulty),
        variants = COALESCE(?, variants),
        updated_at = ?
      WHERE id = ? AND is_builtin = 0
    `, [
            updates.name || null,
            updates.category || null,
            updates.prompt || null,
            updates.expectedTool || null,
            updates.expectedBehavior || null,
            updates.difficulty || null,
            updates.variants ? JSON.stringify(updates.variants) : null,
            now,
            id
        ]);

        return result.changes > 0;
    }

    public deleteCustomTest(id: string): boolean {
        const result = this.run('DELETE FROM custom_tests WHERE id = ? AND is_builtin = 0', [id]);
        return result.changes > 0;
    }

    // ============================================================
    // MODEL INFO CACHE
    // ============================================================

    public cacheModelInfo(modelId: string, info: any, source: string): void {
        this.run(`
      INSERT OR REPLACE INTO model_info (model_id, info, fetched_at, source)
      VALUES (?, ?, ?, ?)
    `, [modelId, JSON.stringify(info), new Date().toISOString(), source]);
    }

    public getCachedModelInfo(modelId: string): any | null {
        const row = this.get('SELECT * FROM model_info WHERE model_id = ?', [modelId]);
        if (!row) return null;

        return {
            modelId: row.model_id,
            info: JSON.parse(row.info),
            fetchedAt: row.fetched_at,
            source: row.source,
        };
    }

    // ============================================================
    // GROUND TRUTH (Phase 8)
    // ============================================================

    public saveGroundTruth(testId: string, result: any): void {
        this.run(`
      INSERT OR REPLACE INTO ground_truth (test_id, success, tool_calls, explanation, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
            testId,
            result.success ? 1 : 0,
            JSON.stringify(result.toolCalls || []),
            result.explanation || null
        ]);
    }

    public getGroundTruth(testId: string): any | null {
        const row = this.get('SELECT * FROM ground_truth WHERE test_id = ?', [testId]);
        if (!row) return null;
        return {
            testId: row.test_id,
            success: row.success === 1,
            toolCalls: JSON.parse(row.tool_calls || '[]'),
            explanation: row.explanation
        };
    }

    public clearAllRAGData(): boolean {
        try {
            this.run("DELETE FROM rag_config");
            this.run("DELETE FROM test_history");
            this.run("DELETE FROM ground_truth");
            return true;
        } catch (error) {
            console.error('[DB] Failed to clear RAG data:', error);
            return false;
        }
    }
}
