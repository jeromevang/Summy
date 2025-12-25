/**
 * Agent Search
 * Unified search interface for the Decision Engine
 * Consolidates RAG lookup, symbol search, schema discovery, and API surface scanning
 */

import type { SearchContext } from './decision-engine.js';

// ============================================================
// TYPES
// ============================================================

export interface SearchOptions {
    includeRag?: boolean;
    includeSymbols?: boolean;
    includeSchemas?: boolean;
    includeApi?: boolean;
    maxResults?: number;
    projectPath?: string;
}

export interface SymbolInfo {
    name: string;
    type: 'function' | 'class' | 'interface' | 'variable' | 'type';
    file: string;
    line?: number;
    signature?: string;
}

export interface SchemaInfo {
    name: string;
    type: 'interface' | 'type' | 'schema';
    properties: { name: string; type: string; required: boolean }[];
    source: string;
}

export interface ApiSurface {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    handler: string;
    file: string;
}

// ============================================================
// AGENT SEARCH CLASS
// ============================================================

export class AgentSearch {
    private ragClient: any = null;
    private initialized = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const { ragClient } = await import('../../../services/rag-client.js');
            this.ragClient = ragClient;
        } catch (e) {
            console.log('[AgentSearch] RAG client not available');
        }

        this.initialized = true;
    }

    // ============================================================
    // RAG LOOKUP
    // ============================================================

    async searchRag(query: string, maxResults: number = 5): Promise<string[]> {
        if (!this.ragClient) {
            await this.initialize();
        }

        if (!this.ragClient) return [];

        try {
            const results = await this.ragClient.query(query, maxResults);
            return results.map((r: any) => r.content || r.text || '');
        } catch (e) {
            console.error('[AgentSearch] RAG query failed:', e);
            return [];
        }
    }

    // ============================================================
    // SYMBOL SEARCH
    // ============================================================

    async searchSymbols(query: string, projectPath?: string): Promise<SymbolInfo[]> {
        const symbols: SymbolInfo[] = [];

        // Extract potential symbol names from query
        const symbolPatterns = query.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
        const functionPatterns = query.match(/\b[a-z][a-zA-Z0-9]*(?=\()/g) || [];

        // Look for these in RAG results
        const ragResults = await this.searchRag(
            `function class interface ${symbolPatterns.join(' ')} ${functionPatterns.join(' ')}`,
            10
        );

        for (const result of ragResults) {
            // Extract class definitions
            const classMatches = result.matchAll(/class\s+(\w+)(?:\s+extends\s+(\w+))?/g);
            for (const match of classMatches) {
                symbols.push({
                    name: match[1],
                    type: 'class',
                    file: 'unknown',
                    signature: match[0]
                });
            }

            // Extract function definitions
            const funcMatches = result.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g);
            for (const match of funcMatches) {
                symbols.push({
                    name: match[1],
                    type: 'function',
                    file: 'unknown',
                    signature: match[0]
                });
            }

            // Extract interface definitions
            const interfaceMatches = result.matchAll(/interface\s+(\w+)/g);
            for (const match of interfaceMatches) {
                symbols.push({
                    name: match[1],
                    type: 'interface',
                    file: 'unknown'
                });
            }
        }

        return symbols;
    }

    // ============================================================
    // SCHEMA DISCOVERY
    // ============================================================

    async discoverSchemas(query: string): Promise<SchemaInfo[]> {
        const schemas: SchemaInfo[] = [];

        const ragResults = await this.searchRag(`interface type schema ${query}`, 5);

        for (const result of ragResults) {
            // Extract interface with properties
            const interfaceMatch = result.match(/interface\s+(\w+)\s*\{([^}]+)\}/);
            if (interfaceMatch) {
                const name = interfaceMatch[1];
                const body = interfaceMatch[2];

                const properties: SchemaInfo['properties'] = [];
                const propMatches = body.matchAll(/(\w+)(\?)?:\s*([^;]+);?/g);

                for (const prop of propMatches) {
                    properties.push({
                        name: prop[1],
                        type: prop[3].trim(),
                        required: !prop[2]
                    });
                }

                schemas.push({
                    name,
                    type: 'interface',
                    properties,
                    source: result.slice(0, 100)
                });
            }
        }

        return schemas;
    }

    // ============================================================
    // API SURFACE SCANNING
    // ============================================================

    async scanApiSurface(projectPath?: string): Promise<ApiSurface[]> {
        const apis: ApiSurface[] = [];

        // Search for route definitions
        const ragResults = await this.searchRag('router.get router.post router.put router.delete app.get app.post', 10);

        for (const result of ragResults) {
            // Extract Express route definitions
            const routeMatches = result.matchAll(/router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi);

            for (const match of routeMatches) {
                apis.push({
                    endpoint: match[2],
                    method: match[1].toUpperCase() as ApiSurface['method'],
                    handler: 'inline',
                    file: 'unknown'
                });
            }
        }

        return apis;
    }

    // ============================================================
    // UNIFIED SEARCH
    // ============================================================

    async search(query: string, options: SearchOptions = {}): Promise<SearchContext> {
        await this.initialize();

        const context: SearchContext = {
            ragResults: [],
            symbols: [],
            schemas: [],
            apiSurfaces: [],
            relevantFiles: []
        };

        // Parallel search operations
        const promises: Promise<void>[] = [];

        if (options.includeRag !== false) {
            promises.push(
                this.searchRag(query, options.maxResults || 5).then(results => {
                    context.ragResults = results;
                })
            );
        }

        if (options.includeSymbols) {
            promises.push(
                this.searchSymbols(query, options.projectPath).then(symbols => {
                    context.symbols = symbols.map(s => `${s.type}:${s.name}`);
                })
            );
        }

        if (options.includeSchemas) {
            promises.push(
                this.discoverSchemas(query).then(schemas => {
                    context.schemas = schemas;
                })
            );
        }

        if (options.includeApi) {
            promises.push(
                this.scanApiSurface(options.projectPath).then(apis => {
                    context.apiSurfaces = apis.map(a => `${a.method} ${a.endpoint}`);
                })
            );
        }

        // Extract file references from query
        const filePatterns = query.match(/[a-zA-Z0-9_\-]+\.(ts|js|tsx|jsx|py|json|md)/g) || [];
        context.relevantFiles = filePatterns;

        await Promise.all(promises);

        return context;
    }
}

// Export singleton instance
export const agentSearch = new AgentSearch();
export default agentSearch;
