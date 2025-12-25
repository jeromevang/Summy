/**
 * CONTEXT PRISM ("The Eyes")
 * Phase 4.1: Search & Understand
 * 
 * Goal: Generate a "Mental Model" of the codebase BEFORE acting.
 * Input: User Query + RAG
 * Output: 
 *  1. CandidateContext: Raw materials (Files, Tree, RAG Snippets)
 *  2. MentalModel: Structured understanding (Relationships, Constraints)
 */

import fs from 'fs-extra';
import path from 'path';
import { ragClient } from '../../../services/rag-client.js';

export interface CandidateContext {
    fileTree: string;          // Compressed map of relevant directories
    relevantFiles: string[];   // Full paths of files to read
    ragSnippets: string[];    // Context from RAG
    openFiles: string[];       // Currently open in IDE (implicit context)
}

export interface MentalModel {
    summary: string;           // "The user wants to refactor the auth service..."
    affectedComponents: string[]; // ["AuthService", "UserController"]
    constraints: string[];     // ["Do not break existing sessions", "Use bcrypt"]
    requiredCapabilities: string[]; // ["reasoning", "coding"]
    completeness: number;      // 0-100% confidence in understanding
    relevantFiles: string[];   // Mirror from context for convenience
}

export class ContextPrism {

    /**
     * SCAN: The "Search" step
     * Gathers raw context based on the query.
     */
    async scan(
        query: string,
        projectPath: string,
        openFiles: string[] = []
    ): Promise<CandidateContext> {
        console.log(`[ContextPrism] Scanning for: "${query}"`);

        // 1. RAG Lookup (Strategic)
        const ragResults = await ragClient.query(query, { limit: 10 });
        const snippets = ragResults?.results.map(r =>
            `[${path.basename(r.filePath)}:${r.startLine}-${r.endLine}] ${r.snippet}`
        ) || [];

        // 2. Identify Relevant Files from RAG + Open Files
        const relevantFiles = new Set<string>([...openFiles]);
        ragResults?.results.forEach(r => relevantFiles.add(r.filePath));

        // 3. Generate "Project Map" (Tree View)
        // We focus the tree around the relevant files to save tokens
        const fileTree = await this.generateFocusedTree(projectPath, Array.from(relevantFiles));

        return {
            fileTree,
            relevantFiles: Array.from(relevantFiles),
            ragSnippets: snippets,
            openFiles
        };
    }

    /**
     * UNDERSTAND: The "Mental Model" step
     * Synthesizes raw context into structured meaning.
     * NOTE: This is usually called by the Main Model (Reasoning).
     */
    async distill(context: CandidateContext, query: string): Promise<MentalModel> {
        // This method prepares the prompt payload for the "Understanding" LLM call.
        // In a real agent, this would be an internal reasoning step.

        // For now, we return a structural placeholders or use heuristics. 
        // The actual "thinking" happens when we pass this context to the Decision Engine.

        return {
            summary: `Analysis of ${context.relevantFiles.length} files for query: "${query}"`,
            affectedComponents: context.relevantFiles.map(f => path.basename(f, path.extname(f))),
            constraints: ["Maintain backward compatibility"], // Default safe constraint
            requiredCapabilities: this.inferCapabilities(query),
            completeness: context.ragSnippets.length > 0 ? 80 : 40,
            relevantFiles: context.relevantFiles
        };
    }

    // --- Helpers ---

    private inferCapabilities(query: string): string[] {
        const caps: string[] = [];
        const q = query.toLowerCase();
        if (q.includes('fix') || q.includes('bug') || q.includes('error')) caps.push('bug_fixing');
        if (q.includes('create') || q.includes('implement') || q.includes('add')) caps.push('coding');
        if (q.includes('explain') || q.includes('how') || q.includes('what')) caps.push('reasoning');
        return caps.length > 0 ? caps : ['general'];
    }

    /**
     * Generates a directory tree, expanding only folders containing relevant files.
     */
    private async generateFocusedTree(rootPath: string, relevantFiles: string[]): Promise<string> {
        // Heuristic: If detailed tree generation is too expensive, return top-level + relevant
        // simplified implementation for efficiency:

        const treeLines: string[] = [];
        treeLines.push(path.basename(rootPath) + '/');

        // Group files by directory
        const structure: Record<string, string[]> = {};

        for (const file of relevantFiles) {
            const relPath = path.relative(rootPath, file);
            const parts = relPath.split(path.sep);

            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                const parent = currentPath;
                currentPath = currentPath ? path.join(currentPath, part) : part;

                if (!structure[parent]) structure[parent] = [];
                if (!structure[parent].includes(part + '/')) structure[parent].push(part + '/');
            }

            const fileName = parts[parts.length - 1];
            const dir = path.dirname(relPath);
            const key = dir === '.' ? '' : dir;

            if (!structure[key]) structure[key] = [];
            structure[key].push(fileName);
        }

        // Flatten to string (simplified)
        for (const [dir, contents] of Object.entries(structure)) {
            treeLines.push(`  ${dir || './'}`);
            contents.forEach(c => treeLines.push(`    - ${c}`));
        }

        if (treeLines.length === 1) {
            return "(No relevant files found in workspace)";
        }

        return treeLines.join('\n');
    }
}

export const contextPrism = new ContextPrism();
