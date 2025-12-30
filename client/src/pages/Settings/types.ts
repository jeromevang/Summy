export interface ServerSettings {
  provider: 'openai' | 'azure' | 'lmstudio' | 'openrouter';
  openaiModel: string;
  azureResourceName: string;
  azureDeploymentName: string;
  azureApiKey: string;
  azureApiVersion: string;
  lmstudioUrl: string;
  lmstudioModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  defaultCompressionMode: 0 | 1 | 2 | 3;
  defaultKeepRecent: number;
  modules?: {
    summy?: { enabled: boolean };
    tooly?: { enabled: boolean };
  };
}
