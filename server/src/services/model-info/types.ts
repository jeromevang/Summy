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

export interface GGUFFile {
  filename: string;
  size?: number;
  quantization?: string;
}

export interface ModelInfo {
  name: string;
  author?: string;
  description?: string;
  fullDescription?: string;
  parameters?: string;
  architecture?: string;
  contextLength?: number;
  license?: string;
  quantization?: string;
  benchmarks?: BenchmarkScores;
  capabilities?: string[];
  trainingData?: string;
  releaseDate?: string;
  source?: 'huggingface' | 'ollama' | 'inference' | 'cache';
  tags?: string[];
  downloads?: number;
  likes?: number;
  siblings?: GGUFFile[];
  huggingFaceUrl?: string;
}
