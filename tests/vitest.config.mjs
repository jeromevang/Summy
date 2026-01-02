/**
 * Vitest Configuration for Functional Tests
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for slow API calls
    hookTimeout: 30000,
    teardownTimeout: 10000,
    include: [
      './functional/**/*.test.{mjs,js}',
      './integration/**/*.test.{mjs,js}'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/fixtures/**'
    ],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'server/src/**/*.{js,ts}',
        'mcp-server/src/**/*.{js,ts}',
        'rag-server/src/**/*.{js,ts}',
        'client/src/**/*.{js,ts,jsx,tsx}'
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.{js,ts}',
        '**/node_modules/**',
        '**/dist/**'
      ]
    },
    sequence: {
      hooks: 'list'
    }
  },
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, '../server/src'),
      '@mcp': path.resolve(__dirname, '../mcp-server/src'),
      '@rag': path.resolve(__dirname, '../rag-server/src'),
      '@client': path.resolve(__dirname, '../client/src')
    }
  }
});
