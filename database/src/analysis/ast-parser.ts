import path from 'path';

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
  /**
   * Heuristic-based parsing for JS/TS/React patterns
   */
  parseFile(filePath: string, content: string): SemanticUnit[] {
    const lines = content.split('\n');
    const units: SemanticUnit[] = [];
    
    let currentUnit: Partial<SemanticUnit> | null = null;
    let braceDepth = 0;
    let inComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('/*')) inComment = true;
      if (inComment) {
        if (trimmed.includes('*/')) inComment = false;
        continue;
      }
      if (trimmed.startsWith('//')) continue;

      // Detect start of a potential unit (Top-level)
      if (braceDepth === 0) {
        const unitMatch = this.detectUnitStart(line);
        if (unitMatch) {
          if (currentUnit) {
            this.finalizeUnit(currentUnit as SemanticUnit, i, units);
          }
          currentUnit = {
            name: unitMatch.name,
            type: unitMatch.type,
            startLine: i + 1,
            isExported: unitMatch.isExported,
            isAsync: unitMatch.isAsync,
            signature: line.trim(),
            content: line + '\n'
          };
        } else if (currentUnit) {
          currentUnit.content += line + '\n';
        }
      } else if (currentUnit) {
        currentUnit.content += line + '\n';
      }

      // Track braces
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // If we just closed the unit
      if (braceDepth === 0 && currentUnit && !this.detectUnitStart(line)) {
        this.finalizeUnit(currentUnit as SemanticUnit, i + 1, units);
        currentUnit = null;
      }
    }

    return units;
  }

  private detectUnitStart(line: string): { name: string; type: SemanticUnit['type']; isExported: boolean; isAsync: boolean } | null {
    const trimmed = line.trim();
    
    // 1. React Components (const Name = () => ...)
    const componentMatch = trimmed.match(/^(export\s+)?const\s+([A-Z]\w+)\s*[:=]\s*(React\.FC|(\([^)]*\)\s*=>))/);
    if (componentMatch) return { name: componentMatch[2], type: 'component', isExported: !!componentMatch[1], isAsync: false };

    // 2. Classes
    const classMatch = trimmed.match(/^(export\s+)?class\s+([A-Z]\w+)/);
    if (classMatch) return { name: classMatch[2], type: 'class', isExported: !!classMatch[1], isAsync: false };

    // 3. Functions
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
    if (funcMatch) return { name: funcMatch[3], type: 'function', isExported: !!funcMatch[1], isAsync: !!funcMatch[2] };

    // 4. Interfaces/Types
    const typeMatch = trimmed.match(/^(export\s+)?(interface|type)\s+([A-Z]\w+)/);
    if (typeMatch) return { name: typeMatch[3], type: 'interface', isExported: !!typeMatch[1], isAsync: false };

    // 5. Hooks
    const hookMatch = trimmed.match(/^(export\s+)?const\s+(use\w+)/);
    if (hookMatch) return { name: hookMatch[2], type: 'hook', isExported: !!hookMatch[1], isAsync: false };

    // 6. Generic Variables/Constants
    const varMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)/);
    if (varMatch) return { name: varMatch[3], type: 'variable', isExported: !!varMatch[1], isAsync: false };

    return null;
  }

  private finalizeUnit(unit: SemanticUnit, endLine: number, units: SemanticUnit[]): void {
    unit.endLine = endLine;
    unit.id = `${unit.name}_${unit.startLine}`;
    unit.dependencies = []; // Heuristic dependency extraction could be added here
    units.push(unit);
  }
}

