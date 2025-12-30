import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { RAGConfig, RAGStats, IndexProgress, EmbeddingModel, QueryResult } from '../types';

const API_BASE = 'http://localhost:3001/api/rag';

export const useRAG = () => {
  const [config, setConfig] = useState<RAGConfig | null>(null);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [models, setModels] = useState<EmbeddingModel[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [queryText, setQueryText] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryLatency, setQueryLatency] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const healthRes = await axios.get(`\${API_BASE}/health`);
      setIsConnected(healthRes.data.healthy);
      const modelsRes = await axios.get(`\${API_BASE}/models`);
      setModels(Array.isArray(modelsRes.data) ? modelsRes.data : []);
    } catch (error) {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const ws = new ReconnectingWebSocket('ws://localhost:3003');
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'stats') { setStats(msg.data); if (msg.data.projectPath) setProjectPath(msg.data.projectPath); }
        else if (msg.type === 'config') { setConfig(msg.data); if (msg.data.lmstudio?.model) setSelectedModel(msg.data.lmstudio.model); }
        else if (msg.type === 'indexProgress') setProgress(msg.data);
        else if (msg.type === 'models') setModels(Array.isArray(msg.data) ? msg.data : []);
      } catch {}
    };
    return () => ws.close();
  }, [loadData]);

  const handleStartIndexing = async () => {
    if (!projectPath) return;
    try { await axios.post(`\${API_BASE}/index`, { projectPath }); loadData(); } catch {}
  };

  const handleQuery = async () => {
    if (!queryText.trim()) return;
    setIsQuerying(true);
    try {
      const res = await axios.post(`\${API_BASE}/query`, { query: queryText, limit: 10 });
      setQueryResults(res.data.results || []);
      setQueryLatency(res.data.latency || 0);
    } catch {
      setQueryResults([]);
    } finally { setIsQuerying(false); }
  };

  return { config, stats, progress, models, isConnected, projectPath, setProjectPath, selectedModel, setSelectedModel, queryText, setQueryText, queryResults, isQuerying, queryLatency, handleStartIndexing, handleQuery, loadData };
};
