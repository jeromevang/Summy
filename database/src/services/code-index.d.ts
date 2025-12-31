export declare class CodeIndexService {
    private getConnection;
    /**
     * Search for symbols across the codebase
     */
    searchSymbols(query: string, type?: string): Promise<unknown[]>;
    getChunk(id: string): Promise<unknown>;
    getFileChunks(filePath: string): Promise<unknown[]>;
    /**
     * Get upstream dependencies (who calls me?)
     */
    getCallers(chunkId: string): Promise<unknown[]>;
    /**
     * Get downstream dependencies (who do I call?)
     */
    getCallees(chunkId: string): Promise<unknown[]>;
}
export declare const codeIndexService: CodeIndexService;
//# sourceMappingURL=code-index.d.ts.map