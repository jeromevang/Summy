import { useState, useEffect, useCallback } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { ModelProfile, SystemMetrics, TestProgress, PreflightError, TabId } from '../types';

export const useModelProfile = (decodedModelId: string) => {
  const [profile, setProfile] = useState<ModelProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [testProgress, setTestProgress] = useState<TestProgress>({ isRunning: false });
  const [metricsHistory, setMetricsHistory] = useState<SystemMetrics[]>([]);
  const [preflightError, setPreflightError] = useState<PreflightError | null>(null);
  const [baselineComparison, setBaselineComparison] = useState<any>(null);
  const [isRefreshingBaseline, setIsRefreshingBaseline] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!decodedModelId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/tooly/models/\${encodeURIComponent(decodedModelId)}`);
      if (!res.ok) throw new Error('Failed to fetch model');
      const data = await res.json();
      setProfile(data.profile || data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [decodedModelId]);

  const fetchBaselineComparison = useCallback(async () => {
    if (!decodedModelId) return;
    try {
      const res = await fetch(`http://localhost:3001/api/tooly/baseline/compare/\${encodeURIComponent(decodedModelId)}`);
      if (res.ok) setBaselineComparison(await res.json());
      else setBaselineComparison(null);
    } catch {
      setBaselineComparison(null);
    }
  }, [decodedModelId]);

  useEffect(() => {
    fetchProfile();
    fetchBaselineComparison();
  }, [fetchProfile, fetchBaselineComparison, decodedModelId]);

  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://\${window.location.hostname}:3001/ws`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const payload = msg.payload || msg.data;
        if (msg.type === 'system_metrics') {
          setSystemMetrics(payload);
          setMetricsHistory(prev => [...prev.slice(-60), payload]);
        } else if (msg.type === 'test_progress' && payload?.modelId === decodedModelId) {
          const progress = payload.progress || { current: payload.current, total: payload.total };
          setTestProgress({ isRunning: payload.status !== 'completed' && payload.status !== 'cancelled', currentTest: payload.currentTest, currentCategory: payload.category || payload.currentCategory, progress, status: payload.status });
          if (payload.status === 'completed') fetchProfile();
        } else if (msg.type === 'test_complete' && payload?.modelId === decodedModelId) {
          setTestProgress({ isRunning: false });
          fetchProfile();
        }
      } catch {}
    };
    return () => ws.close();
  }, [decodedModelId, fetchProfile]);

  return { profile, loading, error, setError, activeTab, setActiveTab, systemMetrics, testProgress, metricsHistory, preflightError, setPreflightError, baselineComparison, isRefreshingBaseline, setIsRefreshingBaseline, fetchProfile, fetchBaselineComparison };
};
