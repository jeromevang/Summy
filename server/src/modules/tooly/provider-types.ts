/**
 * Global provider types for the Summy system
 * Centralizes all provider definitions to avoid hardcoded strings
 */

export type Provider = 'lmstudio' | 'openai' | 'azure' | 'openrouter';

export const PROVIDERS: Record<string, Provider> = {
  LMSTUDIO: 'lmstudio',
  OPENAI: 'openai',
  AZURE: 'azure',
  OPENROUTER: 'openrouter'
} as const;

export const SUPPORTED_PROVIDERS: Provider[] = [
  'lmstudio',
  'openai',
  'azure',
  'openrouter'
];

/**
 * Settings keys for each provider
 */
export const PROVIDER_SETTINGS_KEYS = {
  lmstudio: ['lmstudioUrl'],
  openai: ['openaiApiKey'],
  azure: ['azureResourceName', 'azureApiKey', 'azureDeploymentName', 'azureApiVersion'],
  openrouter: ['openrouterApiKey']
} as const;
