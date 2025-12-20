/**
 * Dependency Graph Builder
 * 
 * Builds a graph of file dependencies by analyzing imports/exports.
 * Pure static analysis - no LLM required.
 */

import { DependencyGraph, DependencyNode, DependencyEdge, ImportInfo } from '../config.js';
import path from 'path';

// Singleton graph instance
let graph: DependencyGraph = {
  nodes: new Map(),
  edges: [],
  lastBuilt: ''
};

/**
 * Get the current dependency graph
 */
export function getDependencyGraph(): DependencyGraph {
  return graph;
}

/**
 * Clear the graph
 */
export function clearGraph(): void {
  graph = {
    nodes: new Map(),
    edges: [],
    lastBuilt: ''
  };
}

/**
 * Analyze a file and add it to the graph
 */
export function analyzeFile(
  filePath: string,
  content: string,
  language: string
): { imports: ImportInfo[]; exports: string[] } {
  const imports = extractImports(content, language);
  const exports = extractExports(content, language);
  const fileType = classifyFileType(filePath, content);
  
  // Add/update node
  graph.nodes.set(filePath, {
    filePath,
    imports: imports.map(i => i.from),
    exports,
    fileType
  });
  
  // Build edges (imports)
  for (const imp of imports) {
    if (!imp.isExternal) {
      // Resolve relative import to file path
      const targetPath = resolveImportPath(filePath, imp.from);
      if (targetPath) {
        graph.edges.push({
          from: filePath,
          to: targetPath,
          type: 'imports',
          symbols: imp.names
        });
      }
    }
  }
  
  graph.lastBuilt = new Date().toISOString();
  
  return { imports, exports };
}

/**
 * Remove a file from the graph
 */
export function removeFile(filePath: string): void {
  graph.nodes.delete(filePath);
  graph.edges = graph.edges.filter(e => e.from !== filePath && e.to !== filePath);
}

/**
 * Get files that import a given file
 */
export function getImporters(filePath: string): string[] {
  return graph.edges
    .filter(e => e.to === filePath)
    .map(e => e.from);
}

/**
 * Get files that a given file imports
 */
export function getImports(filePath: string): string[] {
  return graph.edges
    .filter(e => e.from === filePath)
    .map(e => e.to);
}

/**
 * Get all files in a dependency chain (transitive)
 */
export function getDependencyChain(filePath: string, direction: 'up' | 'down' = 'down', maxDepth: number = 5): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  
  function traverse(current: string, depth: number): void {
    if (depth > maxDepth || visited.has(current)) return;
    visited.add(current);
    result.push(current);
    
    const next = direction === 'down' ? getImports(current) : getImporters(current);
    for (const file of next) {
      traverse(file, depth + 1);
    }
  }
  
  traverse(filePath, 0);
  return result.filter(f => f !== filePath);  // Exclude the starting file
}

/**
 * Find related files (files that share imports or are in same directory)
 */
export function findRelatedFiles(filePath: string, limit: number = 5): string[] {
  const related = new Set<string>();
  
  // Files in same directory
  const dir = path.dirname(filePath);
  for (const [file] of graph.nodes) {
    if (path.dirname(file) === dir && file !== filePath) {
      related.add(file);
    }
  }
  
  // Files that import same dependencies
  const myImports = new Set(getImports(filePath));
  for (const [file] of graph.nodes) {
    if (file === filePath) continue;
    const theirImports = getImports(file);
    const overlap = theirImports.filter(i => myImports.has(i));
    if (overlap.length > 0) {
      related.add(file);
    }
  }
  
  // Direct importers and imports
  getImporters(filePath).forEach(f => related.add(f));
  getImports(filePath).forEach(f => related.add(f));
  
  return Array.from(related).slice(0, limit);
}

/**
 * Get graph statistics
 */
export function getGraphStats(): {
  nodeCount: number;
  edgeCount: number;
  fileTypes: Record<string, number>;
  mostImported: { file: string; count: number }[];
} {
  const fileTypes: Record<string, number> = {};
  const importCounts: Map<string, number> = new Map();
  
  for (const [, node] of graph.nodes) {
    fileTypes[node.fileType] = (fileTypes[node.fileType] || 0) + 1;
  }
  
  for (const edge of graph.edges) {
    importCounts.set(edge.to, (importCounts.get(edge.to) || 0) + 1);
  }
  
  const mostImported = Array.from(importCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));
  
  return {
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    fileTypes,
    mostImported
  };
}

// === Import/Export extraction ===

function extractImports(content: string, language: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // TypeScript/JavaScript imports
    if (language === 'typescript' || language === 'javascript' || language === 'tsx' || language === 'jsx') {
      // import { x, y } from 'module'
      const namedMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
      if (namedMatch) {
        imports.push({
          from: namedMatch[2],
          names: namedMatch[1].split(',').map(n => n.trim().split(' as ')[0].trim()),
          isExternal: !namedMatch[2].startsWith('.') && !namedMatch[2].startsWith('/')
        });
        continue;
      }
      
      // import x from 'module'
      const defaultMatch = trimmed.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
      if (defaultMatch) {
        imports.push({
          from: defaultMatch[2],
          names: [defaultMatch[1]],
          isExternal: !defaultMatch[2].startsWith('.') && !defaultMatch[2].startsWith('/')
        });
        continue;
      }
      
      // import * as x from 'module'
      const namespaceMatch = trimmed.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
      if (namespaceMatch) {
        imports.push({
          from: namespaceMatch[2],
          names: [`* as ${namespaceMatch[1]}`],
          isExternal: !namespaceMatch[2].startsWith('.') && !namespaceMatch[2].startsWith('/')
        });
        continue;
      }
      
      // require('module')
      const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        imports.push({
          from: requireMatch[1],
          names: ['*'],
          isExternal: !requireMatch[1].startsWith('.') && !requireMatch[1].startsWith('/')
        });
      }
    }
    
    // Python imports
    if (language === 'python') {
      // from module import x, y
      const fromMatch = trimmed.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
      if (fromMatch) {
        imports.push({
          from: fromMatch[1],
          names: fromMatch[2].split(',').map(n => n.trim().split(' as ')[0].trim()),
          isExternal: !fromMatch[1].startsWith('.')
        });
        continue;
      }
      
      // import module
      const importMatch = trimmed.match(/^import\s+([\w.]+)/);
      if (importMatch) {
        imports.push({
          from: importMatch[1],
          names: [importMatch[1].split('.').pop() || importMatch[1]],
          isExternal: true  // Assume external for simple imports
        });
      }
    }
  }
  
  return imports;
}

function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // TypeScript/JavaScript exports
    if (language === 'typescript' || language === 'javascript' || language === 'tsx' || language === 'jsx') {
      // export function/class/const/let/var name
      const directMatch = trimmed.match(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/);
      if (directMatch) {
        exports.push(directMatch[1]);
        continue;
      }
      
      // export { x, y }
      const namedMatch = trimmed.match(/^export\s+\{([^}]+)\}/);
      if (namedMatch) {
        const names = namedMatch[1].split(',').map(n => n.trim().split(' as ').pop()?.trim() || n.trim());
        exports.push(...names);
        continue;
      }
      
      // export default
      const defaultMatch = trimmed.match(/^export\s+default\s+(?:function|class)?\s*(\w+)?/);
      if (defaultMatch) {
        exports.push(defaultMatch[1] || 'default');
        continue;
      }
      
      // export interface/type
      const typeMatch = trimmed.match(/^export\s+(?:interface|type)\s+(\w+)/);
      if (typeMatch) {
        exports.push(typeMatch[1]);
      }
    }
    
    // Python: look for __all__ or top-level definitions
    if (language === 'python') {
      // __all__ = ['x', 'y']
      const allMatch = trimmed.match(/__all__\s*=\s*\[([^\]]+)\]/);
      if (allMatch) {
        const names = allMatch[1].match(/['"](\w+)['"]/g);
        if (names) {
          exports.push(...names.map(n => n.replace(/['"]/g, '')));
        }
      }
    }
  }
  
  return exports;
}

function classifyFileType(filePath: string, content: string): DependencyNode['fileType'] {
  const lower = filePath.toLowerCase();
  
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__')) {
    return 'test';
  }
  if (lower.includes('/routes/') || lower.includes('/api/')) {
    return 'route';
  }
  if (lower.includes('/services/') || lower.includes('/service/')) {
    return 'service';
  }
  if (lower.includes('/components/') || lower.includes('/component/')) {
    return 'component';
  }
  if (lower.includes('/utils/') || lower.includes('/util/') || lower.includes('/helpers/')) {
    return 'util';
  }
  if (lower.includes('/config') || lower.includes('.config.')) {
    return 'config';
  }
  
  // Check content for clues
  if (content.includes('express.Router') || content.includes('app.get') || content.includes('app.post')) {
    return 'route';
  }
  if (content.includes('class') && content.includes('Service')) {
    return 'service';
  }
  if (content.includes('React') || content.includes('useState') || content.includes('useEffect')) {
    return 'component';
  }
  
  return 'unknown';
}

function resolveImportPath(fromFile: string, importPath: string): string | null {
  if (!importPath.startsWith('.')) {
    return null;  // External module
  }
  
  const fromDir = path.dirname(fromFile);
  let resolved = path.join(fromDir, importPath).replace(/\\/g, '/');
  
  // Try common extensions if not specified
  if (!path.extname(resolved)) {
    // Just return the base path - actual resolution would need file system access
    resolved = resolved + '.ts';  // Assume TypeScript
  }
  
  return resolved;
}

/**
 * Serialize graph for storage
 */
export function serializeGraph(): string {
  return JSON.stringify({
    nodes: Array.from(graph.nodes.entries()),
    edges: graph.edges,
    lastBuilt: graph.lastBuilt
  });
}

/**
 * Load graph from serialized data
 */
export function loadGraph(data: string): void {
  try {
    const parsed = JSON.parse(data);
    graph = {
      nodes: new Map(parsed.nodes),
      edges: parsed.edges,
      lastBuilt: parsed.lastBuilt
    };
    console.log(`[GraphBuilder] Loaded graph with ${graph.nodes.size} nodes, ${graph.edges.length} edges`);
  } catch (error) {
    console.error('[GraphBuilder] Failed to load graph:', error);
  }
}

