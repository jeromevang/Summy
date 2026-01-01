/**
 * RAG API Routes
 * 
 * Proxies requests to the RAG server and provides local endpoints
 * for RAG-related functionality.
 */

import { Router, Request, Response } from 'express';
import { ragClient } from '../services/rag-client.js';
import { db } from '../services/database.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const router: Router = Router();

// ============================================================
// FILE SYSTEM BROWSER
// ============================================================

// Get system drives (Windows) or root directories
router.get('/browse/roots', async (_req: Request, res: Response) => {
  try {
    const platform = os.platform();
    const roots: { path: string; name: string; type: 'drive' | 'folder' }[] = [];
    
    if (platform === 'win32') {
      // Windows: List available drives
      const { execSync } = await import('child_process');
      try {
        const result = execSync('wmic logicaldisk get name', { encoding: 'utf-8' });
        const lines = result.split('\n').filter(line => /^[A-Z]:/.test(line.trim()));
        for (const line of lines) {
          const drive = line.trim();
          if (drive) {
            roots.push({ path: drive + '\\', name: drive, type: 'drive' });
          }
        }
      } catch {
        // Fallback to common drives
        for (const letter of ['C', 'D', 'E', 'F']) {
          try {
            await fs.access(`${letter}:\\`);
            roots.push({ path: `${letter}:\\`, name: `${letter}:`, type: 'drive' });
          } catch {
            // Drive doesn't exist
          }
        }
      }
    } else {
      // Unix-like: Start from root and home
      roots.push({ path: '/', name: '/', type: 'folder' });
      roots.push({ path: os.homedir(), name: '~', type: 'folder' });
    }
    
    // Add common locations
    const home = os.homedir();
    roots.push({ path: path.join(home, 'Documents'), name: 'Documents', type: 'folder' });
    roots.push({ path: path.join(home, 'Projects'), name: 'Projects', type: 'folder' });
    roots.push({ path: path.join(home, 'Desktop'), name: 'Desktop', type: 'folder' });
    
    // Filter out non-existent paths
    const validRoots = [];
    for (const root of roots) {
      try {
        await fs.access(root.path);
        validRoots.push(root);
      } catch {
        // Path doesn't exist
      }
    }
    
    return res.json(validRoots);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Browse a directory
router.get('/browse/dir', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query['path'] as string;
    if (!dirPath) {
      return res.status(400).json({ error: 'path is required' });
    }
    const normalizedPath = path.resolve(dirPath);
    const stat = await fs.stat(normalizedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }
    const entries = await fs.readdir(normalizedPath, { withFileTypes: true });
    const folders = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
        isDirectory: true
      }));
    return res.json({ path: normalizedPath, folders });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================
// RAG SERVER PROXY
// ============================================================

// Health check
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const healthy = await ragClient.healthCheck();
    const status = { server: ragClient.getStatus() };
    return res.json({ ...status, healthy });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get configuration - from database (persisted) with optional RAG server merge
router.get('/config', async (_req: Request, res: Response) => {
  try {
    // Always get from database first (this is the persisted source of truth)
    const dbConfig = db.getRAGConfig();
    
    // Try to get from RAG server to merge runtime state
    let ragConfig = null;
    try {
      ragConfig = await ragClient.getConfig();
    } catch {
      // RAG server not running, that's ok
    }
    
    // Merge: database config is base, RAG server adds runtime info
    const config = {
      ...dbConfig,
      ...(ragConfig ? { runtime: ragConfig } : {})
    };
    
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update configuration - save to database (persisted) and optionally to RAG server
router.put('/config', async (req: Request, res: Response) => {
  try {
    db.saveRAGConfig(req.body); // Removed truthiness check on void type
    await ragClient.updateConfig(req.body);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get statistics - pure proxy to RAG server
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await ragClient.getMetrics();
    return res.json(stats);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// List available embedding models
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = await ragClient.listModels(); // Ensure listModels exists in RAGClient
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start indexing
router.post('/index', async (req: Request, res: Response) => {
  try {
    const result = await ragClient.startIndexing(req.body.projectPath); // Ensure startIndexing exists
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete index
router.delete('/index', async (_req: Request, res: Response) => {
  try {
    const success = await ragClient.clearIndex();
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get indexing status
router.get('/index/status', async (_req: Request, res: Response) => {
  try {
    const status = await ragClient.getIndexStatus(); // Ensure getIndexStatus exists
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel indexing
router.post('/index/cancel', async (_req: Request, res: Response) => {
  try {
    const success = await ragClient.cancelIndexing(); // Ensure cancelIndexing exists
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Query
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, limit, fileTypes, paths } = req.body;
    const result = await ragClient.query(query, { limit, fileTypes, paths });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get metrics - pure proxy to RAG server
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = await ragClient.getMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get visualization data - pure proxy to RAG server
router.get('/visualization', async (_req: Request, res: Response) => {
  try {
    const visualization = await ragClient.getVisualization();
    res.json(visualization);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get chunks with pagination - pure proxy to RAG server
router.get('/chunks', async (req: Request, res: Response) => {
  try {
    const chunks = await ragClient.getChunks(req.query); // Ensure getChunks exists
    res.json(chunks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single chunk - pure proxy to RAG server
router.get('/chunks/:id', async (req: Request, res: Response) => {
  try {
    const chunkId = req.params.id || '';
    const chunk = await ragClient.getChunk(chunkId);
    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }
    return res.json(chunk);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get similar chunks
router.get('/chunks/:id/similar', async (req: Request, res: Response) => {
  try {
    const chunkId = req.params.id || '';
    const limit = req.query.limit ? Number(req.query.limit) : 5;
    const similar = await ragClient.getSimilarChunks(chunkId, limit);
    return res.json(similar);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Start RAG server
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const success = await ragClient.ensureRunning();
    res.json({ success, status: ragClient.getStatus() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop RAG server
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    ragClient.stop();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
