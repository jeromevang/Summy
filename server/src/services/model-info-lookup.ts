/**
 * Model Info Lookup Service
 * Fetches model information from HuggingFace, Ollama registry, or web search
 * Caches results in SQLite database
 */

import axios from 'axios';
import { db } from './database.js';

// ============================================================
// TYPES
// ============================================================

export interface ModelInfo {
  name: string;
  author?: string;
  description?: string;
  parameters?: string;        // "7B", "70B", etc.
  architecture?: string;      // "Llama", "Mistral", "Qwen", etc.
  contextLength?: number;
  license?: string;
  quantization?: string;      // "Q4_K_M", "Q8_0", etc.
  benchmarks?: Record<string, number>;
  capabilities?: string[];    // ["tool-use", "vision", "coding", etc.]
  trainingData?: string;
  releaseDate?: string;
  source?: 'huggingface' | 'ollama' | 'inference' | 'cache';
  tags?: string[];
}

// ============================================================
// HUGGINGFACE API
// ============================================================

const HUGGINGFACE_API = 'https://huggingface.co/api/models';

async function fetchFromHuggingFace(modelId: string): Promise<ModelInfo | null> {
  try {
    // Try to find the model on HuggingFace
    // Model IDs from LM Studio are often like "author/model-name" or just "model-name"
    const searchTerms = extractSearchTerms(modelId);
    
    for (const term of searchTerms) {
      try {
        // First try direct lookup
        const directUrl = `${HUGGINGFACE_API}/${encodeURIComponent(term)}`;
        const directRes = await axios.get(directUrl, { timeout: 10000 });
        
        if (directRes.data) {
          return parseHuggingFaceModel(directRes.data);
        }
      } catch {
        // Try search API
        try {
          const searchUrl = `${HUGGINGFACE_API}?search=${encodeURIComponent(term)}&limit=3`;
          const searchRes = await axios.get(searchUrl, { timeout: 10000 });
          
          if (searchRes.data && searchRes.data.length > 0) {
            // Find best match
            const match = searchRes.data.find((m: any) => 
              m.modelId?.toLowerCase().includes(term.toLowerCase()) ||
              m.id?.toLowerCase().includes(term.toLowerCase())
            ) || searchRes.data[0];
            
            return parseHuggingFaceModel(match);
          }
        } catch {
          continue;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.log(`[ModelInfoLookup] HuggingFace lookup failed for ${modelId}`);
    return null;
  }
}

function parseHuggingFaceModel(data: any): ModelInfo {
  const tags = data.tags || [];
  const cardData = data.cardData || {};
  
  // Extract parameter count from model ID or tags
  let parameters: string | undefined;
  const paramMatch = data.modelId?.match(/(\d+\.?\d*)[bB]/);
  if (paramMatch) {
    parameters = paramMatch[1] + 'B';
  }
  
  // Extract architecture from tags
  let architecture: string | undefined;
  const archTags = ['llama', 'mistral', 'qwen', 'phi', 'gemma', 'mixtral', 'falcon', 'mpt', 'gpt'];
  for (const arch of archTags) {
    if (tags.some((t: string) => t.toLowerCase().includes(arch)) || 
        data.modelId?.toLowerCase().includes(arch)) {
      architecture = arch.charAt(0).toUpperCase() + arch.slice(1);
      break;
    }
  }
  
  // Extract capabilities
  const capabilities: string[] = [];
  if (tags.includes('tool-use') || tags.includes('function-calling')) capabilities.push('tool-use');
  if (tags.includes('vision') || tags.includes('image-text-to-text')) capabilities.push('vision');
  if (tags.includes('code') || tags.includes('coding')) capabilities.push('coding');
  if (tags.includes('chat') || tags.includes('conversational')) capabilities.push('chat');
  if (tags.includes('instruct') || tags.includes('instruction')) capabilities.push('instruct');
  
  return {
    name: data.modelId || data.id,
    author: data.author,
    description: cardData.description || data.description,
    parameters,
    architecture,
    license: cardData.license || data.license,
    capabilities,
    tags: tags.slice(0, 10),
    releaseDate: data.lastModified || data.createdAt,
    source: 'huggingface',
  };
}

// ============================================================
// MODEL ID PARSING
// ============================================================

function extractSearchTerms(modelId: string): string[] {
  const terms: string[] = [];
  
  // Clean up common LM Studio naming patterns
  // e.g., "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF" -> "Meta-Llama-3-8B-Instruct"
  let cleaned = modelId
    .replace(/lmstudio-community\//i, '')
    .replace(/TheBloke\//i, '')
    .replace(/-GGUF$/i, '')
    .replace(/-gguf$/i, '')
    .replace(/\.gguf$/i, '')
    .replace(/-Q\d+_[A-Z_]+$/i, '')  // Remove quantization suffix
    .replace(/-f\d+$/i, '');  // Remove float precision suffix
  
  terms.push(cleaned);
  
  // Also try the original
  if (cleaned !== modelId) {
    terms.push(modelId);
  }
  
  // Try extracting base model name
  const parts = cleaned.split('/');
  if (parts.length > 1) {
    terms.push(parts[parts.length - 1]);
    terms.push(parts.join('/'));
  }
  
  return [...new Set(terms)]; // Remove duplicates
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
  
  // Infer parameter count
  const paramMatch = modelId.match(/(\d+\.?\d*)[bB]/);
  if (paramMatch) {
    info.parameters = paramMatch[1] + 'B';
  }
  
  // Infer quantization
  const quantMatch = modelId.match(/[Qq](\d+)_([A-Z_]+)/);
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
      // Check if cache is less than 7 days old
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
    const merged = {
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
  
  // Cache inferred info with shorter TTL (1 day instead of 7)
  db.cacheModelInfo(modelId, inferred, 'inference');
  
  return inferred;
}

// ============================================================
// BATCH LOOKUP
// ============================================================

export async function lookupMultipleModels(modelIds: string[]): Promise<Map<string, ModelInfo>> {
  const results = new Map<string, ModelInfo>();
  
  // Process in parallel with concurrency limit
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

// Export singleton functions
export default {
  lookupModelInfo,
  lookupMultipleModels,
  inferFromModelId,
};

