/**
 * Environment Variable Validation
 * Improvement #12
 */

import { cleanEnv, str, port, url, bool } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: port({ default: 3001 }),
  RAG_SERVER_URL: url({ default: 'http://localhost:3002' }),
  WS_PORT: port({ default: 3001 }),

  // API Keys (optional in development)
  OPENAI_API_KEY: str({ default: '' }),
  ANTHROPIC_API_KEY: str({ default: '' }),
  GOOGLE_API_KEY: str({ default: '' }),

  // Database
  DATABASE_PATH: str({ default: './data/summy.db' }),

  // Logging
  LOG_LEVEL: str({ choices: ['error', 'warn', 'info', 'debug'], default: 'info' }),

  // Security
  ENABLE_SAFE_MODE: bool({ default: true }),
  MASTER_ENCRYPTION_KEY: str({ default: 'dev-key-change-in-production' }),

  // Features
  ENABLE_METRICS: bool({ default: false }),
  ENABLE_SENTRY: bool({ default: false }),
  SENTRY_DSN: str({ default: '' })
});
