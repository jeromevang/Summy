export interface SemanticUnit {
    id: string;
    name: string;
    type: 'function' | 'class' | 'interface' | 'variable' | 'component' | 'hook' | 'block';
    content: string;
    startLine: number;
    endLine: number;
    dependencies: string[];
    isExported: boolean;
    isAsync: boolean;
    signature?: string;
    docComment?: string;
}
export declare class ASTParser {
    private project;
    constructor();
    /**
     * AST-based parsing using ts-morph
     */
    parseFile(filePath: string, content: string): SemanticUnit[];
    private processFunction;
    private processClass;
    private processInterface;
    private processTypeAlias;
    private processVariable;
}
//# sourceMappingURL=ast-parser.d.ts.map