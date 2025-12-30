import { useState, useEffect, useCallback } from 'react';
import { 
  FailureEntry, 
  FailureAlert, 
  ComboProsthetic, 
  ComboResult, 
  ComboTeachingResult, 
  ControllerAnalysis, 
  ObserverStatus, 
  DashboardSummary 
} from '../types';
import { FailurePattern } from '../components/FailurePatternCard';

const API_BASE = 'http://localhost:3001/api/tooly';

export const useController = () => {
  const [patterns, setPatterns] = useState<FailurePattern[]>([]);
  const [failures, setFailures] = useState<FailureEntry[]>([]);
  const [alerts, setAlerts] = useState<FailureAlert[]>([]);
  const [observerStatus, setObserverStatus] = useState<ObserverStatus | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analysis, setAnalysis] = useState<ControllerAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [showProstheticReview, setShowProstheticReview] = useState(false);
  const [comboProsthetics, setComboProsthetics] = useState<ComboProsthetic[]>([]);
  const [comboTeachingResults, setComboTeachingResults] = useState<ComboTeachingResult[]>([]);
  const [comboResults, setComboResults] = useState<ComboResult[]>([]);
  const [teachingCombos, setTeachingCombos] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, patternsRes, failuresRes, comboProstheticsRes, comboTeachingRes, comboResultsRes] = await Promise.all([
        fetch(`\${API_BASE}/controller/status`),
        fetch(`\${API_BASE}/failures/patterns`),
        fetch(`\${API_BASE}/failures?resolved=false&limit=50`),
        fetch(`\${API_BASE}/prosthetics?type=combo`),
        fetch(`\${API_BASE}/controller/combo-teaching-results`),
        fetch(`\${API_BASE}/combo-test/results?limit=20`)
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setObserverStatus(data.observer);
        setSummary(data.summary);
        setAlerts(data.summary?.recentAlerts || []);
      }
      if (patternsRes.ok) setPatterns((await patternsRes.json()).patterns || []);
      if (failuresRes.ok) setFailures((await failuresRes.json()).failures || []);
      if (comboProstheticsRes.ok) setComboProsthetics((await comboProstheticsRes.json()).prosthetics || []);
      if (comboTeachingRes.ok) setComboTeachingResults((await comboTeachingRes.json()).results || []);
      if (comboResultsRes.ok) setComboResults((await comboResultsRes.json()).results || []);

      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const toggleObserver = async () => {
    try {
      const endpoint = observerStatus?.running ? 'stop' : 'start';
      const res = await fetch(`\${API_BASE}/controller/\${endpoint}`, { method: 'POST' });
      if (res.ok) setObserverStatus((await res.json()).status);
    } catch (err: any) { setError(err.message); }
  };

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      setAnalysis(null);
      const res = await fetch(`\${API_BASE}/controller/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) setAnalysis(data.analysis);
        else if (data.rawResponse) setError('Analysis returned unparsed response');
      } else setError('Analysis failed');
    } catch (err: any) { setError(err.message); } finally { setAnalyzing(false); }
  };

  const runComboTeaching = async (mainModelId: string, executorModelId: string) => {
    try {
      setTeachingCombos(true);
      const res = await fetch(`\${API_BASE}/controller/run-combo-teaching`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mainModelId, executorModelId, maxAttempts: 4, targetScore: 70 }) });
      if (res.ok) {
        const data = await res.json();
        alert(`Combo teaching \${data.result.success ? 'successful' : 'failed'}! Final score: \${data.result.finalScore}%`);
        loadData();
      } else setError('Failed to run combo teaching');
    } catch (err: any) { setError(err.message); } finally { setTeachingCombos(false); }
  };

  return {
    patterns, failures, alerts, observerStatus, summary, analysis, analyzing, loading, error, setError,
    selectedPattern, setSelectedPattern, showProstheticReview, setShowProstheticReview,
    comboProsthetics, comboTeachingResults, comboResults, teachingCombos,
    toggleObserver, runAnalysis, runComboTeaching, loadData
  };
};
