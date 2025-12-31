export interface SplitOptions {
    minLines?: number;
    groupByType?: boolean;
    createBarrel?: boolean;
    dryRun?: boolean;
}
export declare class FileSplitter {
    private parser;
    constructor();
    splitFile(filePath: string, outputDir: string, options?: SplitOptions): Promise<void>;
    private generateFileContent;
    private updateIndex;
}
//# sourceMappingURL=file-splitter.d.ts.map