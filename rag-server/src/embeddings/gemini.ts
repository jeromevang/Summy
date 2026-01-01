import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseEmbeddingProvider, EmbeddingModelInfo } from './base.js';

export class GeminiEmbedder extends BaseEmbeddingProvider {
  name = 'gemini';
  dimensions = 768; // text-embedding-004 is 768
  model = 'text-embedding-004';
  isLoaded = false;
  
  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string = '';

  constructor(apiKey?: string) {
    super();
    if (apiKey) {
      this.apiKey = apiKey;
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.isLoaded = true;
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!this.apiKey && !!this.genAI;
  }

  async listModels(): Promise<EmbeddingModelInfo[]> {
    return [
      { id: 'text-embedding-004', name: 'Gemini Text Embedding 004', dimensions: 768 },
      { id: 'embedding-001', name: 'Gemini Embedding 001', dimensions: 768 }
    ];
  }

  async setModel(modelId: string): Promise<void> {
    this.model = modelId;
  }

  async load(): Promise<void> {
    if (!this.apiKey) {
      // Try to load from environment if not provided
      const envKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
      if (envKey) {
        this.apiKey = envKey;
        this.genAI = new GoogleGenerativeAI(envKey);
        this.isLoaded = true;
      } else {
        throw new Error('Gemini API Key not found. Set GOOGLE_GENAI_API_KEY in environment.');
      }
    }
  }

  async unload(): Promise<void> {
    this.isLoaded = false;
    this.genAI = null;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.isLoaded) await this.load();
    if (!this.genAI) throw new Error('Gemini AI not initialized');

    const model = this.genAI.getGenerativeModel({ model: this.model });
    
    // Gemini supports batch embedding
    const results = await Promise.all(
      texts.map(text => model.embedContent(text))
    );

    return results.map(res => Array.from(res.embedding.values));
  }
}

let instance: GeminiEmbedder | null = null;

export function getGeminiEmbedder(apiKey?: string): GeminiEmbedder {
  if (!instance) {
    instance = new GeminiEmbedder(apiKey);
  }
  return instance;
}
