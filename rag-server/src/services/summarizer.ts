/**
 * Summarizer Service
 * 
 * Generates LLM summaries for code chunks and files.
 * Uses LM Studio's chat API for summary generation.
 */

import { LMStudioClient } from '@lmstudio/sdk';
import { CodeChunk, EnrichedChunk, FileSummary, ImportInfo } from '../config.js';

// Singleton client and state
let client: LMStudioClient | null = null;
let chatModel: any = null;
let currentModelId: string = '';
let configuredModelId: string = '';  // Stored for lazy loading

function getClient(): LMStudioClient {
  if (!client) {
    client = new LMStudioClient();
  }
  return client;
}

/**
 * Configure the summarizer with a chat model (does NOT load the model yet)
 * Model will be loaded on-demand when actually needed
 */
export async function initializeSummarizer(modelId: string): Promise<boolean> {
  if (!modelId) {
    console.warn('[Summarizer] No chat model specified');
    return false;
  }
  
  // Just store the model ID for lazy loading
  configuredModelId = modelId;
  console.log(`[Summarizer] Configured for model: ${modelId} (will load on demand)`);
  return true;
}

/**
 * Ensure the chat model is loaded (lazy loading)
 */
async function ensureModelLoaded(): Promise<boolean> {
  if (chatModel && currentModelId === configuredModelId) {
    return true;
  }
  
  if (!configuredModelId) {
    return false;
  }
  
  try {
    const c = getClient();
    
    console.log(`[Summarizer] Loading chat model on demand: ${configuredModelId}`);
    chatModel = await c.llm.model(configuredModelId);
    currentModelId = configuredModelId;
    console.log(`[Summarizer] Chat model ready: ${configuredModelId}`);
    return true;
  } catch (error) {
    console.error('[Summarizer] Failed to load chat model:', error);
    return false;
  }
}

/**
 * Check if summarizer is configured (not necessarily loaded)
 */
export function isSummarizerReady(): boolean {
  return !!configuredModelId;
}

/**
 * Check if summarizer model is actually loaded
 */
export function isSummarizerLoaded(): boolean {
  return chatModel !== null;
}

/**
 * Generate a summary for a single code chunk
 */
export async function summarizeChunk(chunk: CodeChunk): Promise<EnrichedChunk> {
  // Load model on demand
  const loaded = await ensureModelLoaded();
  if (!loaded) {
    return { ...chunk };
  }
  
  try {
    const prompt = buildChunkSummaryPrompt(chunk);
    
    const response = await chatModel.respond([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 150,
      temperature: 0.3,  // Low temp for consistent summaries
    });
    
    const summaryText = response.content.trim();
    const { summary, purpose } = parseSummaryResponse(summaryText);
    
    return {
      ...chunk,
      summary,
      purpose
    };
  } catch (error) {
    console.error(`[Summarizer] Failed to summarize chunk ${chunk.name}:`, error);
    return { ...chunk };
  }
}

/**
 * Generate summaries for multiple chunks (batched)
 */
export async function summarizeChunks(
  chunks: CodeChunk[],
  onProgress?: (completed: number, total: number) => void
): Promise<EnrichedChunk[]> {
  const results: EnrichedChunk[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const enriched = await summarizeChunk(chunks[i]);
    results.push(enriched);
    
    if (onProgress) {
      onProgress(i + 1, chunks.length);
    }
  }
  
  return results;
}

/**
 * Generate a file-level summary from chunk summaries
 */
export async function summarizeFile(
  filePath: string,
  chunks: EnrichedChunk[],
  imports: ImportInfo[]
): Promise<FileSummary> {
  const chunkSummaries = chunks
    .filter(c => c.summary)
    .map(c => `- ${c.type} ${c.name}: ${c.summary}`)
    .join('\n');
  
  const importList = imports
    .map(i => `${i.from}: ${i.names.join(', ')}`)
    .join('\n');
  
  const exports = chunks
    .filter(c => c.type === 'function' || c.type === 'class')
    .map(c => c.name);
  
  // Load model on demand
  const loaded = await ensureModelLoaded();
  if (!loaded) {
    return {
      filePath,
      summary: `Contains ${chunks.length} code chunks`,
      responsibility: 'unknown',
      exports,
      imports,
      chunkIds: chunks.map(c => c.id),
      chunkCount: chunks.length,
      lastUpdated: new Date().toISOString()
    };
  }
  
  try {
    const prompt = buildFileSummaryPrompt(filePath, chunkSummaries, importList, exports);
    
    const response = await chatModel.respond([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 200,
      temperature: 0.3,
    });
    
    const { summary, responsibility } = parseFileSummaryResponse(response.content.trim());
    
    return {
      filePath,
      summary,
      responsibility,
      exports,
      imports,
      chunkIds: chunks.map(c => c.id),
      chunkCount: chunks.length,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[Summarizer] Failed to summarize file ${filePath}:`, error);
    return {
      filePath,
      summary: `Contains ${chunks.length} code chunks`,
      responsibility: 'unknown',
      exports,
      imports,
      chunkIds: chunks.map(c => c.id),
      chunkCount: chunks.length,
      lastUpdated: new Date().toISOString()
    };
  }
}

// === Prompt builders ===

function buildChunkSummaryPrompt(chunk: CodeChunk): string {
  return `Summarize this ${chunk.type} in ONE sentence. Focus on: what it does, inputs, outputs.

\`\`\`${chunk.language}
${chunk.content.slice(0, 2000)}
\`\`\`

Respond in this format:
SUMMARY: <one sentence description>
PURPOSE: <one word category: authentication, validation, database, routing, ui, util, config, test, other>`;
}

function buildFileSummaryPrompt(
  filePath: string,
  chunkSummaries: string,
  importList: string,
  exports: string[]
): string {
  return `Summarize this code file based on its contents.

File: ${filePath}

Functions/Classes:
${chunkSummaries || '(none extracted)'}

Imports:
${importList || '(none)'}

Exports: ${exports.join(', ') || '(none)'}

Respond in this format:
SUMMARY: <2-3 sentence description of what this file does>
RESPONSIBILITY: <one word: authentication, api, database, routing, ui, util, config, test, service, component, other>`;
}

// === Response parsers ===

function parseSummaryResponse(text: string): { summary: string; purpose: string } {
  const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?:\n|PURPOSE:|$)/is);
  const purposeMatch = text.match(/PURPOSE:\s*(\w+)/i);
  
  return {
    summary: summaryMatch?.[1]?.trim() || text.split('\n')[0].trim(),
    purpose: purposeMatch?.[1]?.toLowerCase() || 'other'
  };
}

function parseFileSummaryResponse(text: string): { summary: string; responsibility: string } {
  const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?:\n|RESPONSIBILITY:|$)/is);
  const responsibilityMatch = text.match(/RESPONSIBILITY:\s*(\w+)/i);
  
  return {
    summary: summaryMatch?.[1]?.trim() || text.split('\n')[0].trim(),
    responsibility: responsibilityMatch?.[1]?.toLowerCase() || 'unknown'
  };
}

/**
 * Build contextual content for embedding (metadata + code)
 */
export function buildContextualContent(chunk: CodeChunk): string {
  const parts: string[] = [];
  
  parts.push(`File: ${chunk.filePath}`);
  parts.push(`Type: ${chunk.type}`);
  parts.push(`Name: ${chunk.name}`);
  
  if (chunk.signature) {
    parts.push(`Signature: ${chunk.signature}`);
  }
  
  if (chunk.imports?.length) {
    parts.push(`Imports: ${chunk.imports.slice(0, 5).join(', ')}`);
  }
  
  parts.push('');  // Empty line before code
  parts.push(chunk.content);
  
  return parts.join('\n');
}

/**
 * Generate hypothetical code for HyDE
 */
export async function generateHypotheticalCode(query: string): Promise<string | null> {
  const loaded = await ensureModelLoaded();
  if (!loaded) {
    return null;
  }
  
  try {
    const prompt = `Write a short code example that would answer this query. Only output code, no explanation.

Query: "${query}"

\`\`\``;
    
    const response = await chatModel.respond([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 300,
      temperature: 0.5,
    });
    
    // Extract code from response
    const code = response.content.trim();
    return code.replace(/^```\w*\n?/, '').replace(/```$/, '').trim();
  } catch (error) {
    console.error('[Summarizer] HyDE generation failed:', error);
    return null;
  }
}

/**
 * Expand query with related terms
 */
export async function expandQuery(query: string): Promise<string[]> {
  const loaded = await ensureModelLoaded();
  if (!loaded) {
    return [query];
  }
  
  try {
    const prompt = `List 5 related programming terms/synonyms for this query. Output only the terms, one per line.

Query: "${query}"`;
    
    const response = await chatModel.respond([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 100,
      temperature: 0.7,
    });
    
    const terms = response.content
      .split('\n')
      .map((t: string) => t.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((t: string) => t.length > 0 && t.length < 50);
    
    return [query, ...terms.slice(0, 5)];
  } catch (error) {
    console.error('[Summarizer] Query expansion failed:', error);
    return [query];
  }
}

