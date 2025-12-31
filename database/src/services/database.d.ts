import Database from 'better-sqlite3';
export declare class CodeIndexDatabase {
    private db;
    constructor();
    private configureDatabase;
    getConnection(): Database.Database;
    close(): void;
}
export declare const db: CodeIndexDatabase;
//# sourceMappingURL=database.d.ts.map