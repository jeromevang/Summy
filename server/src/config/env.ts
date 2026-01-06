/**
 * Environment Variable Validation
 * Improvement #12
 */

function getEnvString(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (!val) return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

export const env = {
  NODE_ENV: getEnvString('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  PORT: getEnvNumber('PORT', 3001),
  RAG_SERVER_URL: getEnvString('RAG_SERVER_URL', 'http://localhost:3002'),
  WS_PORT: getEnvNumber('WS_PORT', 3001),

  // API Keys (optional in development)
  OPENAI_API_KEY: getEnvString('OPENAI_API_KEY', ''),
  ANTHROPIC_API_KEY: getEnvString('ANTHROPIC_API_KEY', ''),
  GOOGLE_API_KEY: getEnvString('GOOGLE_API_KEY', ''),

  // Database
  DATABASE_PATH: getEnvString('DATABASE_PATH', './data/summy.db'),

  // Logging
  LOG_LEVEL: getEnvString('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',

  // Security
  ENABLE_SAFE_MODE: getEnvBool('ENABLE_SAFE_MODE', true),
  MASTER_ENCRYPTION_KEY: getEnvString('MASTER_ENCRYPTION_KEY', 'dev-key-change-in-production'),

  // Features
  ENABLE_METRICS: getEnvBool('ENABLE_METRICS', false),
  ENABLE_SENTRY: getEnvBool('ENABLE_SENTRY', false),
  SENTRY_DSN: getEnvString('SENTRY_DSN', '')
};
