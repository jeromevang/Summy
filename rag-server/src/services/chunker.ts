/**
 * Code-Aware Chunker using Tree-sitter AST
 * 
 * Parses source code into semantic chunks (functions, classes, methods)
 * instead of naive line-based splitting.
 * 
 * Features:
 * - AST-based parsing for semantic boundaries
 * - Preserves imports and context
 * - Handles large functions by recursive splitting
 * - Metadata enrichment (symbol names, types, signatures)
 */

import Parser from 'tree-sitter';
import { CodeChunk } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

// Language grammars (dynamically imported)
let TypeScript: any = null;
let JavaScript: any = null;
let Python: any = null;

// Try to load grammars
async function loadGrammars(): Promise<void> {
  try {
    TypeScript = (await import('tree-sitter-typescript')).default?.typescript || (await import('tree-sitter-typescript')).typescript;
  } catch (e) {
    console.warn('[Chunker] tree-sitter-typescript not available');
  }
  
  try {
    JavaScript = (await import('tree-sitter-javascript')).default || await import('tree-sitter-javascript');
  } catch (e) {
    console.warn('[Chunker] tree-sitter-javascript not available');
  }
  
  try {
    Python = (await import('tree-sitter-python')).default || await import('tree-sitter-python');
  } catch (e) {
    console.warn('[Chunker] tree-sitter-python not available');
  }
}

// Initialize grammars on first use
let grammarsLoaded = false;

// Language to grammar mapping
function getLanguageGrammar(language: string): any {
  switch (language) {
    case 'typescript':
    case 'tsx':
      return TypeScript;
    case 'javascript':
    case 'jsx':
      return JavaScript;
    case 'python':
      return Python;
    default:
      return null;
  }
}

// File extension to language mapping
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'rb': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'vue': 'vue',
    'svelte': 'svelte'
  };
  return langMap[ext] || 'text';
}

// Node types that represent semantic units we want to chunk
const SEMANTIC_NODE_TYPES: Record<string, string[]> = {
  typescript: [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'arrow_function',
    'export_statement'
  ],
  javascript: [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'arrow_function',
    'export_statement'
  ],
  python: [
    'function_definition',
    'class_definition',
    'decorated_definition'
  ]
};

// Get symbol type from node type
function getSymbolType(nodeType: string): CodeChunk['type'] {
  if (nodeType.includes('function') || nodeType.includes('method') || nodeType === 'arrow_function') {
    return 'function';
  }
  if (nodeType.includes('class')) {
    return 'class';
  }
  if (nodeType.includes('interface') || nodeType.includes('type_alias')) {
    return 'module';
  }
  return 'block';
}

// Extract symbol name from AST node
function getSymbolName(node: Parser.SyntaxNode, sourceCode: string): string {
  // Try to find identifier child
  const identifierTypes = ['identifier', 'property_identifier', 'type_identifier'];
  
  for (const child of node.children) {
    if (identifierTypes.includes(child.type)) {
      return sourceCode.slice(child.startIndex, child.endIndex);
    }
  }
  
  // For arrow functions assigned to variables
  if (node.parent?.type === 'variable_declarator') {
    const nameNode = node.parent.childForFieldName('name');
    if (nameNode) {
      return sourceCode.slice(nameNode.startIndex, nameNode.endIndex);
    }
  }
  
  return 'anonymous';
}

// Extract function/method signature
function getSignature(node: Parser.SyntaxNode, sourceCode: string): string {
  // Get first line or up to opening brace
  const text = sourceCode.slice(node.startIndex, node.endIndex);
  const braceIndex = text.indexOf('{');
  if (braceIndex > 0) {
    return text.slice(0, braceIndex).trim();
  }
  // For Python-style (colon)
  const colonIndex = text.indexOf(':');
  if (colonIndex > 0 && colonIndex < 200) {
    return text.slice(0, colonIndex + 1).trim();
  }
  // Just return first line
  return text.split('\n')[0].trim();
}

// Count tokens (rough estimate based on whitespace and symbols)
function estimateTokens(text: string): number {
  // Rough approximation: ~4 chars per token on average for code
  return Math.ceil(text.length / 4);
}

// Extract imports from file
function extractImports(sourceCode: string, language: string): string[] {
  const imports: string[] = [];
  const lines = sourceCode.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // TypeScript/JavaScript imports
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
      imports.push(trimmed);
    }
    // Python imports
    else if (language === 'python' && (trimmed.startsWith('import ') || trimmed.startsWith('from '))) {
      imports.push(trimmed);
    }
    // Stop after imports section (heuristic)
    else if (imports.length > 0 && !trimmed.startsWith('import') && !trimmed.startsWith('from') && !trimmed.startsWith('//') && !trimmed.startsWith('#') && trimmed.length > 0) {
      break;
    }
  }
  
  return imports;
}

export interface ChunkerOptions {
  maxChunkTokens?: number;
  minChunkTokens?: number;
  includeImports?: boolean;
}

export class Chunker {
  private parser: Parser;
  private options: Required<ChunkerOptions>;
  
  constructor(options: ChunkerOptions = {}) {
    this.parser = new Parser();
    this.options = {
      maxChunkTokens: options.maxChunkTokens || 1500,
      minChunkTokens: options.minChunkTokens || 50,
      includeImports: options.includeImports !== false
    };
  }
  
  /**
   * Initialize the chunker (load grammars)
   */
  async initialize(): Promise<void> {
    if (!grammarsLoaded) {
      await loadGrammars();
      grammarsLoaded = true;
    }
  }
  
  /**
   * Chunk a source file into semantic units
   */
  async chunkFile(filePath: string, sourceCode: string): Promise<CodeChunk[]> {
    await this.initialize();
    
    const language = detectLanguage(filePath);
    const grammar = getLanguageGrammar(language);
    
    // If no grammar available, fall back to simple chunking
    if (!grammar) {
      return this.fallbackChunk(filePath, sourceCode, language);
    }
    
    try {
      this.parser.setLanguage(grammar);
      const tree = this.parser.parse(sourceCode);
      
      const chunks: CodeChunk[] = [];
      const imports = this.options.includeImports ? extractImports(sourceCode, language) : [];
      
      // Get semantic node types for this language
      const semanticTypes = SEMANTIC_NODE_TYPES[language] || SEMANTIC_NODE_TYPES.javascript;
      
      // Walk the tree and extract chunks
      this.walkTree(tree.rootNode, sourceCode, filePath, language, semanticTypes, imports, chunks);
      
      // If no semantic chunks found, create a module-level chunk
      if (chunks.length === 0) {
        chunks.push(this.createModuleChunk(filePath, sourceCode, language, imports));
      }
      
      return chunks;
      
    } catch (error) {
      console.warn(`[Chunker] AST parsing failed for ${filePath}, using fallback:`, error);
      return this.fallbackChunk(filePath, sourceCode, language);
    }
  }
  
  /**
   * Walk the AST tree and extract semantic chunks
   */
  private walkTree(
    node: Parser.SyntaxNode,
    sourceCode: string,
    filePath: string,
    language: string,
    semanticTypes: string[],
    imports: string[],
    chunks: CodeChunk[]
  ): void {
    // Check if this node is a semantic unit
    if (semanticTypes.includes(node.type)) {
      const chunk = this.nodeToChunk(node, sourceCode, filePath, language, imports);
      
      // If chunk is too large, try to split it
      if (chunk.tokens > this.options.maxChunkTokens) {
        const subChunks = this.splitLargeChunk(node, sourceCode, filePath, language, imports);
        chunks.push(...subChunks);
      } else if (chunk.tokens >= this.options.minChunkTokens) {
        chunks.push(chunk);
      }
      
      // Don't recurse into semantic nodes (they're already chunked)
      return;
    }
    
    // Recurse into children
    for (const child of node.children) {
      this.walkTree(child, sourceCode, filePath, language, semanticTypes, imports, chunks);
    }
  }
  
  /**
   * Convert an AST node to a chunk
   */
  private nodeToChunk(
    node: Parser.SyntaxNode,
    sourceCode: string,
    filePath: string,
    language: string,
    imports: string[]
  ): CodeChunk {
    const content = sourceCode.slice(node.startIndex, node.endIndex);
    const symbolName = getSymbolName(node, sourceCode);
    const symbolType = getSymbolType(node.type);
    const signature = getSignature(node, sourceCode);
    
    return {
      id: uuidv4(),
      content,
      type: symbolType,
      name: symbolName,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language,
      imports,
      signature,
      tokens: estimateTokens(content)
    };
  }
  
  /**
   * Split a large chunk into smaller pieces
   */
  private splitLargeChunk(
    node: Parser.SyntaxNode,
    sourceCode: string,
    filePath: string,
    language: string,
    imports: string[]
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    
    // For classes, split by methods
    if (node.type.includes('class')) {
      for (const child of node.children) {
        if (child.type.includes('method') || child.type.includes('function')) {
          const chunk = this.nodeToChunk(child, sourceCode, filePath, language, imports);
          chunk.name = `${getSymbolName(node, sourceCode)}.${chunk.name}`;
          chunk.type = 'method';
          
          if (chunk.tokens >= this.options.minChunkTokens) {
            chunks.push(chunk);
          }
        }
      }
      
      // If we got method chunks, we're done
      if (chunks.length > 0) {
        return chunks;
      }
    }
    
    // Fall back to block-based splitting
    const content = sourceCode.slice(node.startIndex, node.endIndex);
    const lines = content.split('\n');
    const linesPerChunk = Math.ceil(lines.length / Math.ceil(estimateTokens(content) / this.options.maxChunkTokens));
    
    for (let i = 0; i < lines.length; i += linesPerChunk) {
      const chunkLines = lines.slice(i, i + linesPerChunk);
      const chunkContent = chunkLines.join('\n');
      
      if (estimateTokens(chunkContent) >= this.options.minChunkTokens) {
        chunks.push({
          id: uuidv4(),
          content: chunkContent,
          type: 'block',
          name: `${getSymbolName(node, sourceCode)}_part${Math.floor(i / linesPerChunk) + 1}`,
          filePath,
          startLine: node.startPosition.row + 1 + i,
          endLine: node.startPosition.row + 1 + i + chunkLines.length,
          language,
          imports,
          tokens: estimateTokens(chunkContent)
        });
      }
    }
    
    return chunks;
  }
  
  /**
   * Create a module-level chunk for the entire file
   */
  private createModuleChunk(
    filePath: string,
    sourceCode: string,
    language: string,
    imports: string[]
  ): CodeChunk {
    const lines = sourceCode.split('\n');
    
    return {
      id: uuidv4(),
      content: sourceCode,
      type: 'module',
      name: filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'module',
      filePath,
      startLine: 1,
      endLine: lines.length,
      language,
      imports,
      tokens: estimateTokens(sourceCode)
    };
  }
  
  /**
   * Fallback chunking when AST parsing is not available
   * Uses simple heuristics based on blank lines and indentation
   */
  private fallbackChunk(
    filePath: string,
    sourceCode: string,
    language: string
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = sourceCode.split('\n');
    const imports = extractImports(sourceCode, language);
    
    // Simple approach: chunk by double newlines or significant indentation changes
    let currentChunk: string[] = [];
    let chunkStartLine = 1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);
      
      // Check for chunk boundary
      const isDoubleNewline = line.trim() === '' && lines[i - 1]?.trim() === '';
      const chunkTokens = estimateTokens(currentChunk.join('\n'));
      
      if (isDoubleNewline && chunkTokens >= this.options.minChunkTokens) {
        // End current chunk
        chunks.push({
          id: uuidv4(),
          content: currentChunk.join('\n').trim(),
          type: 'block',
          name: `block_${chunks.length + 1}`,
          filePath,
          startLine: chunkStartLine,
          endLine: i + 1,
          language,
          imports,
          tokens: chunkTokens
        });
        
        currentChunk = [];
        chunkStartLine = i + 2;
      }
      // Force split if too large
      else if (chunkTokens > this.options.maxChunkTokens) {
        chunks.push({
          id: uuidv4(),
          content: currentChunk.join('\n').trim(),
          type: 'block',
          name: `block_${chunks.length + 1}`,
          filePath,
          startLine: chunkStartLine,
          endLine: i + 1,
          language,
          imports,
          tokens: chunkTokens
        });
        
        currentChunk = [];
        chunkStartLine = i + 2;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      const content = currentChunk.join('\n').trim();
      if (estimateTokens(content) >= this.options.minChunkTokens) {
        chunks.push({
          id: uuidv4(),
          content,
          type: 'block',
          name: `block_${chunks.length + 1}`,
          filePath,
          startLine: chunkStartLine,
          endLine: lines.length,
          language,
          imports,
          tokens: estimateTokens(content)
        });
      }
    }
    
    // If no chunks created, return the whole file as one chunk
    if (chunks.length === 0) {
      chunks.push(this.createModuleChunk(filePath, sourceCode, language, imports));
    }
    
    return chunks;
  }
}

// Export singleton instance
let chunkerInstance: Chunker | null = null;

export function getChunker(options?: ChunkerOptions): Chunker {
  if (!chunkerInstance) {
    chunkerInstance = new Chunker(options);
  }
  return chunkerInstance;
}
