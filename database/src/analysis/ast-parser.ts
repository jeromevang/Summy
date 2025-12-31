import { Project, SyntaxKind, Node, FunctionDeclaration, ClassDeclaration, InterfaceDeclaration, TypeAliasDeclaration, VariableStatement } from 'ts-morph';

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

export class ASTParser {
  private project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      skipLoadingLibFiles: true,
      compilerOptions: {
        allowJs: true,
        jsx: 1 // preserve
      }
    });
  }

  /**
   * AST-based parsing using ts-morph
   */
  parseFile(filePath: string, content: string): SemanticUnit[] {
    // Create a source file in the virtual project
    // We use a random suffix to avoid collisions if called in parallel on same path
    const uniquePath = `${filePath}_${Date.now()}.ts${filePath.endsWith('x') ? 'x' : ''}`;
    const sourceFile = this.project.createSourceFile(uniquePath, content);
    
    const units: SemanticUnit[] = [];

    try {
      // 1. Functions
      sourceFile.getFunctions().forEach(func => {
        units.push(this.processFunction(func));
      });

      // 2. Classes
      sourceFile.getClasses().forEach(cls => {
        units.push(this.processClass(cls));
      });

      // 3. Interfaces
      sourceFile.getInterfaces().forEach(intf => {
        units.push(this.processInterface(intf));
      });

      // 4. Type Aliases
      sourceFile.getTypeAliases().forEach(typeAlias => {
        units.push(this.processTypeAlias(typeAlias));
      });

      // 5. Variables (const/let/var) - handling arrow functions (Components/Hooks)
      sourceFile.getVariableStatements().forEach(stmt => {
        stmt.getDeclarations().forEach(decl => {
          units.push(this.processVariable(decl, stmt));
        });
      });

    } finally {
      // Clean up to save memory
      this.project.removeSourceFile(sourceFile);
    }

    // Sort by line number
    return units.sort((a, b) => a.startLine - b.startLine);
  }

  private processFunction(func: FunctionDeclaration): SemanticUnit {
    const name = func.getName() || 'anonymous';
    const isAsync = func.isAsync();
    const isExported = func.isExported();
    const startLine = func.getStartLineNumber();
    const endLine = func.getEndLineNumber();
    const content = func.getText();
    
    // Get doc comments
    const docComment = func.getJsDocs().map(doc => doc.getInnerText()).join('\n');
    
    // Get signature (heuristic: just the first line or up to the body)
    const signature = content.split('{')[0].trim();

    return {
      id: `${name}_${startLine}`,
      name,
      type: 'function',
      content,
      startLine,
      endLine,
      dependencies: [], // Analyzing body for calls would go here
      isExported,
      isAsync,
      signature,
      docComment: docComment || undefined
    };
  }

  private processClass(cls: ClassDeclaration): SemanticUnit {
    const name = cls.getName() || 'anonymous';
    const isExported = cls.isExported();
    const startLine = cls.getStartLineNumber();
    const endLine = cls.getEndLineNumber();
    const content = cls.getText();
    const docComment = cls.getJsDocs().map(doc => doc.getInnerText()).join('\n');
    const signature = `class ${name}`;

    return {
      id: `${name}_${startLine}`,
      name,
      type: 'class',
      content,
      startLine,
      endLine,
      dependencies: [],
      isExported,
      isAsync: false,
      signature,
      docComment: docComment || undefined
    };
  }

  private processInterface(intf: InterfaceDeclaration): SemanticUnit {
    const name = intf.getName();
    const isExported = intf.isExported();
    const startLine = intf.getStartLineNumber();
    const endLine = intf.getEndLineNumber();
    const content = intf.getText();
    const docComment = intf.getJsDocs().map(doc => doc.getInnerText()).join('\n');
    const signature = `interface ${name}`;

    return {
      id: `${name}_${startLine}`,
      name,
      type: 'interface',
      content,
      startLine,
      endLine,
      dependencies: [],
      isExported,
      isAsync: false,
      signature,
      docComment: docComment || undefined
    };
  }

  private processTypeAlias(typeAlias: TypeAliasDeclaration): SemanticUnit {
    const name = typeAlias.getName();
    const isExported = typeAlias.isExported();
    const startLine = typeAlias.getStartLineNumber();
    const endLine = typeAlias.getEndLineNumber();
    const content = typeAlias.getText();
    const docComment = typeAlias.getJsDocs().map(doc => doc.getInnerText()).join('\n');
    const signature = `type ${name}`;

    return {
      id: `${name}_${startLine}`,
      name,
      type: 'interface', // Treat type aliases as interfaces for broad categorization
      content,
      startLine,
      endLine,
      dependencies: [],
      isExported,
      isAsync: false,
      signature,
      docComment: docComment || undefined
    };
  }

  private processVariable(decl: any, stmt: VariableStatement): SemanticUnit {
    const name = decl.getName();
    const isExported = stmt.isExported();
    const startLine = stmt.getStartLineNumber(); // Use statement for line numbers
    const endLine = stmt.getEndLineNumber();
    const content = stmt.getText(); // Capture full statement
    const docComment = stmt.getJsDocs().map(doc => doc.getInnerText()).join('\n');

    let type: SemanticUnit['type'] = 'variable';
    let isAsync = false;

    // Detect if it's an arrow function or component
    const initializer = decl.getInitializer();
    if (initializer && Node.isArrowFunction(initializer)) {
      isAsync = initializer.isAsync();
      
      // Heuristic for React Components: PascalCase name + arrow function
      if (/^[A-Z]/.test(name)) {
        type = 'component';
      } else if (name.startsWith('use')) {
        type = 'hook';
      } else {
        type = 'function';
      }
    }

    // Heuristic for simple constants that look like components (e.g. React.memo(...))
    if (type === 'variable' && /^[A-Z]/.test(name)) {
        // Could be a HOC or component
        type = 'component'; 
    }

    return {
      id: `${name}_${startLine}`,
      name,
      type,
      content,
      startLine,
      endLine,
      dependencies: [],
      isExported,
      isAsync,
      signature: `const ${name}`,
      docComment: docComment || undefined
    };
  }
}