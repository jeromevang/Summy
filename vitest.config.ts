import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,js}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/client/**'], // Exclude client for now as it needs jsdom
  },
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, './server/src'),
      '@mcp': path.resolve(__dirname, './mcp-server/src'),
      '@rag': path.resolve(__dirname, './rag-server/src'),
    },
  },
});
