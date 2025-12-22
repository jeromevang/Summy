/**
 * Model Info Lookup Service
 * Fetches comprehensive model information from HuggingFace, including:
 * - Model card/README content
 * - Benchmark scores
 * - Downloads and likes
 * - GGUF file details
 * - Training information
 * Caches results in SQLite database
 */

import axios from 'axios';
import { db } from './database.js';

// ============================================================
// TYPES
// ============================================================

export interface BenchmarkScores {
  mmlu?: number;
  humaneval?: number;
  gsm8k?: number;
  arc?: number;
  hellaswag?: number;
  truthfulqa?: number;
  winogrande?: number;
  average?: number;
  [key: string]: number | undefined;
}

export interface ModelInfo {
  name: string;
  author?: string;
  description?: string;
  fullDescription?: string;  // Full README content
  parameters?: string;       // "7B", "70B", etc.
  architecture?: string;     // "Llama", "Mistral", "Qwen", etc.
  contextLength?: number;
  license?: string;
  quantization?: string;     // "Q4_K_M", "Q8_0", etc.
  benchmarks?: BenchmarkScores;
  capabilities?: string[];   // ["tool-use", "vision", "coding", etc.]
  trainingData?: string;
  releaseDate?: string;
  source?: 'huggingface' | 'ollama' | 'inference' | 'cache';
  tags?: string[];
  
  // Extended HuggingFace data
  downloads?: number;
  likes?: number;
  gatedAccess?: boolean;
  pipelineTag?: string;      // "text-generation", "image-text-to-text", etc.
  siblings?: GGUFFile[];     // GGUF files available
  languages?: string[];
  datasets?: string[];
  baseModel?: string;        // What model this was fine-tuned from
  huggingFaceUrl?: string;
}

export interface GGUFFile {
  filename: string;
  size?: number;           // bytes
  quantization?: string;   // extracted from filename
}

// ============================================================
// HUGGINGFACE API
// ============================================================

const HUGGINGFACE_API = 'https://huggingface.co/api/models';
const HUGGINGFACE_BASE = 'https://huggingface.co';

async function fetchFromHuggingFace(modelId: string): Promise<ModelInfo | null> {
  const searchTerms = extractSearchTerms(modelId);
  
  for (const term of searchTerms) {
    try {
      // First try direct lookup with full=true for more data
      const directUrl = `${HUGGINGFACE_API}/${encodeURIComponent(term)}`;
      const directRes = await axios.get(directUrl, { 
        timeout: 15000,
        params: { full: true }
      });
      
      if (directRes.data) {
        const info = await parseHuggingFaceModel(directRes.data, term);
        // If we got good data, fetch additional details
        if (info) {
          await enrichWithReadme(info, term);
          await enrichWithGGUFFiles(info, term);
          return info;
        }
      }
    } catch {
      // Try search API
      try {
        const searchUrl = `${HUGGINGFACE_API}?search=${encodeURIComponent(term)}&limit=5&full=true`;
        const searchRes = await axios.get(searchUrl, { timeout: 15000 });
        
        if (searchRes.data && searchRes.data.length > 0) {
          // Find best match
          const match = searchRes.data.find((m: any) => 
            m.modelId?.toLowerCase().includes(term.toLowerCase()) ||
            m.id?.toLowerCase().includes(term.toLowerCase())
          ) || searchRes.data[0];
          
          const info = await parseHuggingFaceModel(match, match.modelId || match.id);
          if (info) {
            await enrichWithReadme(info, match.modelId || match.id);
            await enrichWithGGUFFiles(info, match.modelId || match.id);
            return info;
          }
        }
      } catch {
        continue;
      }
    }
  }
  
  return null;
}

async function parseHuggingFaceModel(data: any, hfModelId: string): Promise<ModelInfo> {
  const tags = data.tags || [];
  const cardData = data.cardData || {};
  const config = data.config || {};
  
  // Extract parameter count
  let parameters: string | undefined;
  const paramMatch = (data.modelId || data.id || '')?.match(/(\d+\.?\d*)[bB]/);
  if (paramMatch) {
    parameters = paramMatch[1] + 'B';
  } else if (data.safetensors?.total) {
    // Estimate from safetensors size
    const billions = data.safetensors.total / 1e9 / 2; // Rough estimate (fp16)
    if (billions >= 1) {
      parameters = `~${billions.toFixed(1)}B`;
    }
  }
  
  // Extract architecture
  let architecture: string | undefined;
  const archTags = ['llama', 'mistral', 'qwen', 'phi', 'gemma', 'mixtral', 'falcon', 'mpt', 'gpt', 'deepseek', 'yi', 'command', 'starcoder', 'codellama'];
  for (const arch of archTags) {
    if (tags.some((t: string) => t.toLowerCase() === arch) || 
        (data.modelId || data.id || '').toLowerCase().includes(arch)) {
      architecture = arch.charAt(0).toUpperCase() + arch.slice(1);
      break;
    }
  }
  
  // Try to get architecture from config
  if (!architecture && config.model_type) {
    architecture = config.model_type.charAt(0).toUpperCase() + config.model_type.slice(1);
  }
  
  // Extract capabilities
  const capabilities: string[] = [];
  if (tags.includes('tool-use') || tags.includes('function-calling')) capabilities.push('tool-use');
  if (tags.includes('vision') || tags.includes('image-text-to-text')) capabilities.push('vision');
  if (tags.includes('code') || tags.includes('coding') || tags.includes('code-generation')) capabilities.push('coding');
  if (tags.includes('chat') || tags.includes('conversational')) capabilities.push('chat');
  if (tags.includes('instruct') || tags.includes('instruction-following')) capabilities.push('instruct');
  if (tags.includes('text-generation')) capabilities.push('text-gen');
  if (tags.includes('math')) capabilities.push('math');
  if (tags.includes('reasoning')) capabilities.push('reasoning');
  
  // Extract context length from config
  let contextLength: number | undefined;
  if (config.max_position_embeddings) {
    contextLength = config.max_position_embeddings;
  } else if (cardData.context_length) {
    contextLength = cardData.context_length;
  }
  
  // Extract benchmark scores from card data
  const benchmarks: BenchmarkScores = {};
  if (cardData.model_results) {
    for (const result of cardData.model_results) {
      const name = result.task?.type?.toLowerCase() || result.dataset?.name?.toLowerCase();
      if (name && result.metrics) {
        for (const metric of result.metrics) {
          if (metric.value !== undefined) {
            benchmarks[name] = metric.value;
          }
        }
      }
    }
  }
  
  // Extract base model
  let baseModel: string | undefined;
  if (cardData.base_model) {
    baseModel = Array.isArray(cardData.base_model) ? cardData.base_model[0] : cardData.base_model;
  }
  
  return {
    name: data.modelId || data.id,
    author: data.author,
    description: cardData.description || data.description || extractFirstParagraph(data.readme),
    parameters,
    architecture,
    contextLength,
    license: cardData.license || data.license,
    capabilities,
    tags: tags.slice(0, 15),
    releaseDate: data.lastModified || data.createdAt,
    downloads: data.downloads,
    likes: data.likes,
    gatedAccess: data.gated === true,
    pipelineTag: data.pipeline_tag,
    languages: cardData.language || cardData.languages,
    datasets: cardData.datasets,
    baseModel,
    benchmarks: Object.keys(benchmarks).length > 0 ? benchmarks : undefined,
    huggingFaceUrl: `${HUGGINGFACE_BASE}/${hfModelId}`,
    source: 'huggingface',
  };
}

// Fetch and parse README for more detailed description
async function enrichWithReadme(info: ModelInfo, hfModelId: string): Promise<void> {
  try {
    const readmeUrl = `${HUGGINGFACE_BASE}/${hfModelId}/raw/main/README.md`;
    const res = await axios.get(readmeUrl, { timeout: 10000 });
    
    if (res.data && typeof res.data === 'string') {
      info.fullDescription = res.data.slice(0, 5000); // Limit to 5K chars
      
      // Extract context length if mentioned in README
      if (!info.contextLength) {
        const ctxMatch = res.data.match(/context\s*(?:length|window|size)?[:\s]*(\d+)[kK]?/i);
        if (ctxMatch) {
          const num = parseInt(ctxMatch[1]);
          info.contextLength = num < 1000 ? num * 1024 : num;
        }
      }
      
      // Try to extract benchmark scores from README tables
      if (!info.benchmarks || Object.keys(info.benchmarks).length === 0) {
        info.benchmarks = extractBenchmarksFromReadme(res.data);
      }
      
      // Extract training data info
      const trainMatch = res.data.match(/(?:trained|fine-?tuned)\s+on[:\s]+([^\n.]+)/i);
      if (trainMatch) {
        info.trainingData = trainMatch[1].trim().slice(0, 200);
      }
    }
  } catch {
    // README fetch failed, continue without it
  }
}

// Extract benchmark scores from README markdown tables
function extractBenchmarksFromReadme(readme: string): BenchmarkScores | undefined {
  const benchmarks: BenchmarkScores = {};
  
  // Common benchmark names to look for
  const benchmarkPatterns = [
    { pattern: /mmlu[:\s]*(\d+\.?\d*)/i, key: 'mmlu' },
    { pattern: /humaneval[:\s]*(\d+\.?\d*)/i, key: 'humaneval' },
    { pattern: /gsm8k[:\s]*(\d+\.?\d*)/i, key: 'gsm8k' },
    { pattern: /arc[:\s]*(\d+\.?\d*)/i, key: 'arc' },
    { pattern: /hellaswag[:\s]*(\d+\.?\d*)/i, key: 'hellaswag' },
    { pattern: /truthfulqa[:\s]*(\d+\.?\d*)/i, key: 'truthfulqa' },
    { pattern: /winogrande[:\s]*(\d+\.?\d*)/i, key: 'winogrande' },
    { pattern: /mt-?bench[:\s]*(\d+\.?\d*)/i, key: 'mtbench' },
    { pattern: /average[:\s]*(\d+\.?\d*)/i, key: 'average' },
  ];
  
  for (const { pattern, key } of benchmarkPatterns) {
    const match = readme.match(pattern);
    if (match) {
      benchmarks[key] = parseFloat(match[1]);
    }
  }
  
  return Object.keys(benchmarks).length > 0 ? benchmarks : undefined;
}

// Fetch GGUF file information
async function enrichWithGGUFFiles(info: ModelInfo, hfModelId: string): Promise<void> {
  try {
    // For GGUF models, the files are usually in a separate repo
    const filesUrl = `${HUGGINGFACE_API}/${encodeURIComponent(hfModelId)}/tree/main`;
    const res = await axios.get(filesUrl, { timeout: 10000 });
    
    if (res.data && Array.isArray(res.data)) {
      const ggufFiles: GGUFFile[] = res.data
        .filter((f: any) => f.path?.endsWith('.gguf'))
        .map((f: any) => ({
          filename: f.path,
          size: f.size,
          quantization: extractQuantFromFilename(f.path),
        }));
      
      if (ggufFiles.length > 0) {
        info.siblings = ggufFiles;
        
        // If no quantization set yet, use the first GGUF file
        if (!info.quantization && ggufFiles[0].quantization) {
          info.quantization = ggufFiles[0].quantization;
        }
      }
    }
  } catch {
    // Files fetch failed, continue without it
  }
}

// Extract quantization from GGUF filename
function extractQuantFromFilename(filename: string): string | undefined {
  const match = filename.match(/[Qq](\d+)_([A-Z_0-9]+)/);
  if (match) {
    return `Q${match[1]}_${match[2]}`;
  }
  // Also check for simpler patterns
  const simpleMatch = filename.match(/[.-]([QqFf]\d+[._]?[A-Z0-9]*)/);
  if (simpleMatch) {
    return simpleMatch[1].toUpperCase();
  }
  return undefined;
}

// Extract first paragraph from readme for description
function extractFirstParagraph(readme?: string): string | undefined {
  if (!readme) return undefined;
  
  // Skip YAML frontmatter
  let content = readme;
  if (content.startsWith('---')) {
    const endFrontmatter = content.indexOf('---', 3);
    if (endFrontmatter > 0) {
      content = content.slice(endFrontmatter + 3);
    }
  }
  
  // Skip headers and find first real paragraph
  const lines = content.split('\n');
  let paragraph = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) continue; // Skip badges
    if (trimmed.startsWith('|')) continue; // Skip tables
    if (trimmed.startsWith('```')) continue;
    
    paragraph = trimmed;
    break;
  }
  
  return paragraph ? paragraph.slice(0, 500) : undefined;
}

// ============================================================
// MODEL ID PARSING
// ============================================================

function extractSearchTerms(modelId: string): string[] {
  const terms: string[] = [];
  
  // Clean up common LM Studio naming patterns
  let cleaned = modelId
    .replace(/lmstudio-community\//i, '')
    .replace(/TheBloke\//i, '')
    .replace(/-GGUF$/i, '')
    .replace(/-gguf$/i, '')
    .replace(/\.gguf$/i, '')
    .replace(/-Q\d+_[A-Z_0-9]+$/i, '')
    .replace(/-f\d+$/i, '');
  
  terms.push(cleaned);
  
  // Try with common GGUF repo patterns
  if (cleaned.includes('/')) {
    const [author, model] = cleaned.split('/');
    terms.push(`${author}/${model}-GGUF`);
    terms.push(model);
  } else {
    // Try to find the base model name
    terms.push(`lmstudio-community/${cleaned}-GGUF`);
    terms.push(`TheBloke/${cleaned}-GGUF`);
    terms.push(cleaned);
  }
  
  // Also try the original
  if (cleaned !== modelId) {
    terms.push(modelId);
  }
  
  return [...new Set(terms)];
}

function inferFromModelId(modelId: string): ModelInfo {
  const info: ModelInfo = {
    name: modelId,
    source: 'inference',
  };
  
  const lowerModelId = modelId.toLowerCase();
  
  // Infer architecture
  if (lowerModelId.includes('llama')) info.architecture = 'Llama';
  else if (lowerModelId.includes('mistral')) info.architecture = 'Mistral';
  else if (lowerModelId.includes('qwen')) info.architecture = 'Qwen';
  else if (lowerModelId.includes('phi')) info.architecture = 'Phi';
  else if (lowerModelId.includes('gemma')) info.architecture = 'Gemma';
  else if (lowerModelId.includes('mixtral')) info.architecture = 'Mixtral';
  else if (lowerModelId.includes('deepseek')) info.architecture = 'DeepSeek';
  else if (lowerModelId.includes('command')) info.architecture = 'Command';
  else if (lowerModelId.includes('yi')) info.architecture = 'Yi';
  else if (lowerModelId.includes('starcoder')) info.architecture = 'StarCoder';
  else if (lowerModelId.includes('codellama')) info.architecture = 'CodeLlama';
  
  // Infer parameter count
  const paramMatch = modelId.match(/(\d+\.?\d*)[bB]/);
  if (paramMatch) {
    info.parameters = paramMatch[1] + 'B';
  }
  
  // Infer quantization
  const quantMatch = modelId.match(/[Qq](\d+)_([A-Z_0-9]+)/);
  if (quantMatch) {
    info.quantization = `Q${quantMatch[1]}_${quantMatch[2]}`;
  }
  
  // Infer capabilities
  const capabilities: string[] = [];
  if (lowerModelId.includes('instruct') || lowerModelId.includes('chat')) {
    capabilities.push('instruct', 'chat');
  }
  if (lowerModelId.includes('code') || lowerModelId.includes('coder')) {
    capabilities.push('coding');
  }
  if (lowerModelId.includes('vision') || lowerModelId.includes('vl')) {
    capabilities.push('vision');
  }
  if (lowerModelId.includes('math')) {
    capabilities.push('math');
  }
  info.capabilities = capabilities;
  
  // Infer author
  const authorMatch = modelId.match(/^([^\/]+)\//);
  if (authorMatch) {
    info.author = authorMatch[1];
  }
  
  return info;
}

// ============================================================
// MAIN LOOKUP FUNCTION
// ============================================================

export async function lookupModelInfo(modelId: string, skipCache = false): Promise<ModelInfo> {
  // Check cache first
  if (!skipCache) {
    const cached = db.getCachedModelInfo(modelId);
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.fetchedAt).getTime();
      if (cacheAge < 7 * 24 * 60 * 60 * 1000) {
        console.log(`[ModelInfoLookup] Using cached info for ${modelId}`);
        return { ...cached.info, source: 'cache' };
      }
    }
  }
  
  console.log(`[ModelInfoLookup] Looking up info for ${modelId}`);
  
  // Try HuggingFace
  const hfInfo = await fetchFromHuggingFace(modelId);
  if (hfInfo) {
    // Merge with inferred info for any missing fields
    const inferred = inferFromModelId(modelId);
    const merged: ModelInfo = {
      ...inferred,
      ...hfInfo,
      quantization: inferred.quantization || hfInfo.quantization,
      capabilities: [...new Set([...(inferred.capabilities || []), ...(hfInfo.capabilities || [])])],
    };
    
    // Cache the result
    db.cacheModelInfo(modelId, merged, 'huggingface');
    
    return merged;
  }
  
  // Fall back to inference from model ID
  const inferred = inferFromModelId(modelId);
  db.cacheModelInfo(modelId, inferred, 'inference');
  
  return inferred;
}

// ============================================================
// BATCH LOOKUP
// ============================================================

export async function lookupMultipleModels(modelIds: string[]): Promise<Map<string, ModelInfo>> {
  const results = new Map<string, ModelInfo>();
  const CONCURRENCY = 3;
  
  for (let i = 0; i < modelIds.length; i += CONCURRENCY) {
    const batch = modelIds.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (id) => {
      try {
        const info = await lookupModelInfo(id);
        results.set(id, info);
      } catch (error) {
        console.error(`[ModelInfoLookup] Failed to lookup ${id}:`, error);
        results.set(id, inferFromModelId(id));
      }
    });
    
    await Promise.all(promises);
  }
  
  return results;
}

export default {
  lookupModelInfo,
  lookupMultipleModels,
  inferFromModelId,
};
