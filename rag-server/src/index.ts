/**
 * RAG Server Entry Point
 */

import { RAGServer } from './server/RAGServer.js';

const server = new RAGServer();
const port = parseInt(process.env.PORT || '3002');

server.start(port).catch(err => {
  console.error('[RAG Server] Failed to start:', err);
  process.exit(1);
});

export * from './server/index.js';