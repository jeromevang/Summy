import { QueryAnalysis } from './types.js';

export function analyzeQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  let queryType: QueryAnalysis['queryType'] = 'explanation';
  if (lowerQuery.includes('read') || lowerQuery.includes('write')) queryType = 'file_operation';
  else if (lowerQuery.includes('git')) queryType = 'git_operation';
  else if (lowerQuery.includes('find') || lowerQuery.includes('search') || lowerQuery.includes('how')) queryType = 'code_question';
  
  return {
    queryType,
    complexity: query.length > 200 ? 'complex' : 'simple',
    requiresRag: queryType === 'code_question',
    requiresHistory: lowerQuery.includes('before'),
    estimatedResponseTokens: 500
  };
}
