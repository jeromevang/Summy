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

const router = Router();

// ============================================================
// FILE SYSTEM BROWSER
// ============================================================

// Get system drives (Windows) or root directories
router.get('/browse/roots', async (req: Request, res: Response) => {
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
    
    res.json(validRoots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Browse a directory
router.get('/browse/dir', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query.path as string;
    
    if (!dirPath) {
      return res.status(400).json({ error: 'path is required' });
    }
    
    // Normalize path
    const normalizedPath = path.resolve(dirPath);
    
    // Check if path exists and is a directory
    try {
      const stat = await fs.stat(normalizedPath);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }
    } catch {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    // Read directory contents
    const entries = await fs.readdir(normalizedPath, { withFileTypes: true });
    
    // Filter and sort directories
    const folders = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
        isDirectory: true
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Check if this is a project directory (has common project files)
    const projectIndicators = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py', '.git', 'pom.xml', 'build.gradle'];
    let isProject = false;
    for (const indicator of projectIndicators) {
      try {
        await fs.access(path.join(normalizedPath, indicator));
        isProject = true;
        break;
      } catch {
        // Not found
      }
    }
    
    res.json({
      path: normalizedPath,
      parent: path.dirname(normalizedPath) !== normalizedPath ? path.dirname(normalizedPath) : null,
      folders,
      isProject
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// RAG SERVER PROXY
// ============================================================

// Health check
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthy = await ragClient.healthCheck();
    const status = ragClient.getStatus();
    
    res.json({
      ...status,
      healthy
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get configuration - from database (persisted) with optional RAG server merge
router.get('/config', async (req: Request, res: Response) => {
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
    // Save to database (always persisted)
    const dbSuccess = db.saveRAGConfig(req.body);
    
    if (!dbSuccess) {
      return res.status(500).json({ error: 'Failed to save config to database' });
    }
    
    // Try to update RAG server too (if running)
    try {
      await ragClient.updateConfig(req.body);
    } catch {
      // RAG server not running, that's ok - config is saved in DB
      console.log('[RAG] Config saved to DB, RAG server not running');
    }
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics - pure proxy to RAG server
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await ragClient.getStats();
    if (!stats) {
      return res.status(503).json({ error: 'RAG server not available' });
    }
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List available embedding models
router.get('/models', async (req: Request, res: Response) => {
  let models: any[] = [];
  
  try {
    // Try to get from RAG server first
    const ragModels = await ragClient.listModels();
    if (ragModels && ragModels.length > 0) {
      models = ragModels;
      console.log('[RAG] Got models from RAG server:', models.length);
    }
  } catch (ragError) {
    console.log('[RAG] RAG server not available for models, trying LM Studio directly');
  }
  
  // If RAG server not available or returned empty, try LM Studio directly
  if (models.length === 0) {
    try {
      const lmstudioUrl = process.env.LMSTUDIO_URL || 'http://localhost:1234';
      console.log('[RAG] Querying LM Studio at:', `${lmstudioUrl}/v1/models`);
      
      const response = await fetch(`${lmstudioUrl}/v1/models`);
      
      if (response.ok) {
        const data = await response.json() as { data?: any[] };
        console.log('[RAG] LM Studio returned models:', data.data?.length || 0);
        
        // Known embedding model patterns
        const embeddingPatterns = ['embed', 'bge', 'nomic', 'e5-', 'gte-', 'instructor', 'minilm', 'paraphrase'];
        
        // First, try to find embedding-specific models
        const embeddingModels = (data.data || [])
          .filter((m: any) => {
            const id = (m.id || '').toLowerCase();
            return embeddingPatterns.some(pattern => id.includes(pattern));
          })
          .map((m: any) => ({
            id: m.id,
            name: m.id.split('/').pop() || m.id,
            path: m.id,
            loaded: true
          }));
        
        if (embeddingModels.length > 0) {
          models = embeddingModels;
          console.log('[RAG] Found embedding models:', models.map((m: any) => m.name));
        } else {
          // If no embedding-specific models found, return all models
          // User might want to use a general model
          models = (data.data || []).map((m: any) => ({
            id: m.id,
            name: m.id.split('/').pop() || m.id,
            path: m.id,
            loaded: true,
            isGeneral: true // Flag that this isn't an embedding-specific model
          }));
          console.log('[RAG] No embedding models found, returning all models:', models.length);
        }
      } else {
        console.log('[RAG] LM Studio response not ok:', response.status, response.statusText);
      }
    } catch (lmError: any) {
      console.log('[RAG] Could not fetch models from LM Studio:', lmError.message);
    }
  }
  
  res.json(models);
});

// Start indexing
router.post('/index', async (req: Request, res: Response) => {
  try {
    // Ensure RAG server is running
    const running = await ragClient.ensureRunning();
    if (!running) {
      return res.status(503).json({ error: 'Could not start RAG server' });
    }
    
    // Get saved config with embedding model
    const savedConfig = db.getRAGConfig();
    const embeddingModel = savedConfig?.lmstudio?.model;
    
    if (!embeddingModel) {
      return res.status(400).json({ 
        error: 'No embedding model selected. Please select an embedding model in RAG Settings first.' 
      });
    }
    
    console.log('[RAG] Starting indexing with model:', embeddingModel);
    
    // First update RAG server config with the model
    await ragClient.updateConfig({
      lmstudio: { model: embeddingModel, loadOnDemand: false }
    });
    
    // Then start indexing
    const result = await ragClient.startIndexing(req.body.projectPath);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete index
router.delete('/index', async (req: Request, res: Response) => {
  try {
    const success = await ragClient.clearIndex();
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get indexing status
router.get('/index/status', async (req: Request, res: Response) => {
  try {
    const status = await ragClient.getIndexStatus();
    if (!status) {
      return res.json({ status: 'idle', totalFiles: 0, processedFiles: 0 });
    }
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel indexing
router.post('/index/cancel', async (req: Request, res: Response) => {
  try {
    const success = await ragClient.cancelIndexing();
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Query
router.post('/query', async (req: Request, res: Response) => {
  try {
    // Ensure RAG server is running
    const running = await ragClient.ensureRunning();
    if (!running) {
      return res.status(503).json({ error: 'RAG server not available' });
    }
    
    const { query, limit, fileTypes, paths } = req.body;
    const result = await ragClient.query(query, { limit, fileTypes, paths });
    
    if (!result) {
      return res.status(500).json({ error: 'Query failed' });
    }
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get metrics - pure proxy to RAG server
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await ragClient.getMetrics();
    res.json(metrics || {
      indexingHistory: [],
      queryHistory: [],
      embeddingStats: { totalEmbeddings: 0, avgGenerationTime: 0, modelLoaded: false, modelName: '' }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get visualization data - pure proxy to RAG server
router.get('/visualization', async (req: Request, res: Response) => {
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
    const chunks = await ragClient.getChunks(req.query as any);
    res.json(chunks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single chunk - pure proxy to RAG server
router.get('/chunks/:id', async (req: Request, res: Response) => {
  try {
    const chunk = await ragClient.getChunk(req.params.id);
    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }
    res.json(chunk);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get similar chunks
router.get('/chunks/:id/similar', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 5;
    const similar = await ragClient.getSimilarChunks(req.params.id, limit);
    res.json(similar);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start RAG server
router.post('/start', async (req: Request, res: Response) => {
  try {
    const success = await ragClient.ensureRunning();
    res.json({ success, status: ragClient.getStatus() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop RAG server
router.post('/stop', async (req: Request, res: Response) => {
  try {
    ragClient.stop();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
