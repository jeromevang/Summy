export class FileProcessor {
  static mapChunkTypeToSymbolType(chunkType: string): 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable' | 'constant' | 'property' | 'module' {
    const typeMap: Record<string, any> = {
      'function': 'function', 'arrow_function': 'function', 'method': 'method', 'method_definition': 'method',
      'class': 'class', 'class_declaration': 'class', 'interface': 'interface', 'interface_declaration': 'interface',
      'type_alias': 'type', 'type': 'type', 'const': 'constant', 'let': 'variable', 'var': 'variable', 'variable': 'variable'
    };
    return typeMap[chunkType] || 'module';
  }
}
