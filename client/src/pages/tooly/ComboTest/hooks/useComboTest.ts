import { useState, useEffect, useCallback } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { Model, ComboScore, ComboTestProgress, ContextSizeResult } from '../types';

export const useComboTest = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [availableProviders, setAvailableProviders] = useState<{[key: string]: boolean}>({});
  const [selectedMainModels, setSelectedMainModels] = useState<Set<string>>(new Set());
  const [selectedExecutorModels, setSelectedExecutorModels] = useState<Set<string>>(new Set());
  
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ComboTestProgress | null>(null);
  const [results, setResults] = useState<ComboScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedCombo, setSelectedCombo] = useState<{ main: string; executor: string } | null>(null);
  const [isTestingContext, setIsTestingContext] = useState(false);
  const [contextResults, setContextResults] = useState<ContextSizeResult[]>([]);
  
  const [excludedMainModels, setExcludedMainModels] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        if (message.type === 'combo_test_progress') {
          setProgress(message.data);
          if (message.data.status === 'completed') setIsRunning(false);
        }
        if (message.type === 'combo_test_result') {
          setResults(message.data.allResults || []);
          if (message.data.isComplete) { setIsRunning(false); setProgress(null); }
        }
        if (message.type === 'combo_test_main_excluded') {
          setExcludedMainModels(prev => new Set([...prev, message.data.mainModelId]));
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  const fetchSavedResults = async () => {
    try {
      const response = await fetch('/api/tooly/combo-test/results');
      if (!response.ok) return;
      const data = await response.json();
      if (data.results?.length > 0) {
        const uiResults = data.results.map((r: any) => ({
          mainModelId: r.mainModelId,
          executorModelId: r.executorModelId,
          totalTests: r.passedCount + r.failedCount,
          passedTests: r.passedCount,
          categoryScores: r.categoryScores || [],
          tierScores: [
            { tier: 'simple', score: r.tierScores?.simple || 0, categories: r.tierScores?.simpleCategories || [] },
            { tier: 'medium', score: r.tierScores?.medium || 0, categories: r.tierScores?.mediumCategories || [] },
            { tier: 'complex', score: r.tierScores?.complex || 0, categories: r.tierScores?.complexCategories || [] },
          ],
          mainScore: r.mainScore || 0,
          executorScore: r.executorScore || 0,
          avgLatencyMs: r.avgLatencyMs || 0,
          overallScore: r.overallScore,
          testResults: r.testResults || [],
          testedAt: r.testedAt,
          mainExcluded: r.mainExcluded,
        }));
        setResults(uiResults);
      }
    } catch {}
  };

  const fetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const response = await fetch('/api/tooly/models?provider=all');
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const sortedModels = (data.models || []).sort((a: Model, b: Model) => {
        const providerOrder = { lmstudio: 1, openai: 2, openrouter: 3, azure: 4 };
        const orderA = providerOrder[a.provider as keyof typeof providerOrder] || 99;
        const orderB = providerOrder[b.provider as keyof typeof providerOrder] || 99;
        return orderA !== orderB ? orderA - orderB : a.displayName.localeCompare(b.displayName);
      });
      setModels(sortedModels);
      setAvailableProviders(data.providers);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchSavedResults();
  }, []);

  const runAllCombos = async () => {
    if (!selectedMainModels.size || !selectedExecutorModels.size) {
      setError('Please select at least one Main and one Executor model');
      return;
    }
    setIsRunning(true); setError(null); setResults([]); setProgress(null); setExcludedMainModels(new Set());
    try {
      const res = await fetch('/api/tooly/combo-test/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainModels: Array.from(selectedMainModels), executorModels: Array.from(selectedExecutorModels) }),
      });
      if (!res.ok) throw new Error('Failed to start');
    } catch (err: any) {
      setError(err.message); setIsRunning(false);
    }
  };

  const testContextSizes = async (contextSizes: number[]) => {
    if (!selectedCombo) return;
    setIsTestingContext(true); setContextResults([]);
    try {
      const res = await fetch('/api/tooly/combo-test/context-sizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainModelId: selectedCombo.main, executorModelId: selectedCombo.executor, contextSizes }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setContextResults(data.results || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTestingContext(false);
    }
  };

  return {
    models, isLoadingModels, availableProviders, selectedMainModels, setSelectedMainModels,
    selectedExecutorModels, setSelectedExecutorModels, isRunning, progress, results, setResults, error, setError,
    selectedCombo, setSelectedCombo, isTestingContext, contextResults, excludedMainModels,
    runAllCombos, testContextSizes, fetchModels
  };
};
