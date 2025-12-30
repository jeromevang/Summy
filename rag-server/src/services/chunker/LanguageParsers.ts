export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript', 'tsx': 'tsx', 'js': 'javascript', 'jsx': 'jsx', 'py': 'python'
  };
  return langMap[ext] || 'text';
}

export const SEMANTIC_NODE_TYPES: Record<string, string[]> = {
  typescript: ['function_declaration', 'method_definition', 'class_declaration'],
  javascript: ['function_declaration', 'method_definition', 'class_declaration'],
  python: ['function_definition', 'class_definition']
};
