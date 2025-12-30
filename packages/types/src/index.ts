export interface Session {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    model: string;
    provider: string;
    messages: any[];
    compression?: any;
}

export interface ModelConfig {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    maxTokens: number;
    capabilities: string[];
}