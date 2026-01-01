import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ProstheticEntry, 
  ProstheticStats, 
  Model, 
  DistillationResult,
  Tab 
} from '../types';

export const useProsthetics = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('library');
  const [prosthetics, setProsthetics] = useState<ProstheticEntry[]>([]);
  const [stats, setStats] = useState<ProstheticStats>({
    totalEntries: 0, verifiedCount: 0,
    levelDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
    avgSuccessfulRuns: 0
  });
  const [models, setModels] = useState<Model[]>([]);
  const [distillCapabilities, setDistillCapabilities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ProstheticEntry | null>(null);

  const fetchProsthetics = useCallback(async () => {
    try {
      const res = await fetch('/api/tooly/prosthetics');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProsthetics(data.prosthetics || []);
      if (data.stats) setStats(data.stats);
    } catch (err: any) { setError(err.message); }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/tooly/models?provider=lmstudio');
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      setModels(data.models || []);
    } catch (err: any) { setError(err.message); }
  }, []);

  const fetchDistillCapabilities = useCallback(async () => {
    try {
      const res = await fetch('/api/tooly/distillation/capabilities');
      if (res.ok) setDistillCapabilities((await res.json()).capabilities || []);
    } catch {}
  }, []);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchProsthetics(), fetchModels(), fetchDistillCapabilities()]).finally(() => setIsLoading(false));
  }, [fetchProsthetics, fetchModels, fetchDistillCapabilities]);

  const handleSaveProsthetic = async (modelId: string, prompt: string, level: number) => {
    try {
      const res = await fetch(`/api/tooly/prosthetics/${encodeURIComponent(modelId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, level }) });
      if (!res.ok) throw new Error('Failed to save');
      await fetchProsthetics();
      const updated = prosthetics.find(p => p.modelId === modelId);
      if (updated) setSelectedEntry({ ...updated, prompt, level: level as any });
    } catch (err: any) { setError(err.message); }
  };

  const handleRunDistillation = async (teacher: string, student: string, cap: string): Promise<DistillationResult | null> => {
    try {
      const res = await fetch('/api/tooly/distillation/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherModelId: teacher, studentModelId: student, capability: cap }) });
      if (!res.ok) throw new Error('Distillation failed');
      const result = await res.json();
      await fetchProsthetics();
      return result;
    } catch (err: any) { setError(err.message); return null; }
  };

  return {
    tab, setTab, prosthetics, stats, models, distillCapabilities, isLoading, error, setError,
    selectedEntry, setSelectedEntry, fetchProsthetics, handleSaveProsthetic, handleRunDistillation
  };
};
