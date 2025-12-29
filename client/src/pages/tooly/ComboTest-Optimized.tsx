/**
 * Performance Optimized Combo Testing Page
 * Optimized with memoization, virtualization, and efficient state management
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { FixedSizeList as List } from 'react-window';

// Tooltip component with memoization
const Tooltip: React.FC<{ children: React.ReactNode; content: string }> = memo(({ children, content }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div className="absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
});

// Model Card Component - memoized
const ModelCard: React.FC<{
  model: Model;
  isSelected: boolean;
  onToggle: (modelId: string) => void;
  role: 'main' | 'executor';
}> = memo(({ model, isSelected, onToggle, role }) => (
  <div
    className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
      isSelected 
        ? 'border-blue-500 bg-blue-50 shadow-md' 
        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
    }`}
    onClick={() => onToggle(model.id)}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="font-medium text-sm">{model.displayName || model.id}</div>
        <div className="text-xs text-gray-500 mt-1">
          {model.sizeBytes && `${(model.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`}
          {model.quantization && ` • ${model.quantization}`}
        </div>
      </div>
      <div className="ml-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(model.id)}
          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
        />
      </div>
    </div>
    {model.score && (
      <div className="mt-2 text-xs text-gray-600">
        Score: {model.score.toFixed(2)}
      </div>
    )}
  </div>
));

// Result Row Component - memoized
const ResultRow: React.FC<{
  index: number;
  style: React.CSSProperties;
  data: ComboScore[];
  onDetailsClick: (result: ComboScore) => void;
  onContextTestClick: (result: ComboScore) => void;
}> = memo(({ index, style, data, onDetailsClick, onContextTestClick }) => {
  const result = data[index];
  
  return (
    <div style={style} className="p-2 border-b hover:bg-gray-50">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-3 text-sm font-medium">{result.mainModelId}</div>
        <div className="col-span-3 text-sm font-medium">{result.executorModelId}</div>
        <div className="col-span-2 text-center">
          <span className={`px-2 py-1 rounded text-xs ${
            result.overallScore >= 80 ? 'bg-green-100 text-green-800' :
            result.overallScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {result.overallScore.toFixed(1)}%
          </span>
        </div>
        <div className="col-span-2 text-center text-sm">{result.totalTests}</div>
        <div className="col-span-2 text-center">
          <button
            onClick={() => onDetailsClick(result)}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 mr-1"
          >
            Details
          </button>
          <button
            onClick={() => onContextTestClick(result)}
            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
          >
            Context
          </button>
        </div>
      </div>
    </div>
  );
});

// Progress Bar Component - memoized
const ProgressBar: React.FC<{ progress: ComboTestProgress }> = memo(({ progress }) => {
  const totalTests = progress.totalTests;
  const completedTests = progress.completedTests;
  const percentage = totalTests > 0 ? (completedTests / totalTests) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Progress: {completedTests}/{totalTests} tests</span>
        <span>{percentage.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-600">
        Current: {progress.currentTest?.mainModelId} + {progress.currentTest?.executorModelId}
      </div>
    </div>
  );
});

// ============================================================
// TYPES
// ============================================================

type TestCategory = 
  | 'suppress' | 'single_tool' | 'tool_select' | 'param_extract'
  | 'clarify' | 'multi_tool' | 'reasoning' | 'refusal';

type DifficultyTier = 'simple' | 'medium' | 'complex';

interface Model {
  id: string;
  displayName?: string;
  role?: 'main' | 'executor' | 'both';
  score?: number;
  sizeBytes?: number;
  quantization?: string;
}

interface ComboTestProgress {
  totalTests: number;
  completedTests: number;
  currentTest: { mainModelId: string; executorModelId: string } | null;
  status: 'running' | 'completed' | 'failed';
}

interface ComboScore {
  mainModelId: string;
  executorModelId: string;
  overallScore: number;
  mainScore: number;
  executorScore: number;
  tierScores: { tier: DifficultyTier; score: number; categories: never[]; }[];
  categoryScores: { category: TestCategory; score: number; }[];
  testResults: { id: string; name: string; prompt: string; expectedResponse: string; category: TestCategory; difficulty: DifficultyTier; tools: never[]; expectedToolCall?: undefined; }[];
  avgLatencyMs: number;
  passedCount: number;
  failedCount: number;
  mainExcluded: boolean;
  testedAt: string;
}

interface ContextSizeResult {
  mainModelId: string;
  executorModelId: string;
  contextSize: number;
  score: number;
  latencyMs: number;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

const ComboTest: React.FC = () => {
  const navigate = useNavigate();
  const [ws, setWs] = useState<ReconnectingWebSocket | null>(null);

  // State with optimized updates
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
  const [vramFilteredCount, setVramFilteredCount] = useState<number>(0);

  // Memoized calculations
  const filteredModels = useMemo(() => {
    return models.filter(model => {
      const hasRole = !model.role || model.role === 'both' || 
                     (model.role === 'main' && selectedMainModels.has(model.id)) ||
                     (model.role === 'executor' && selectedExecutorModels.has(model.id));
      return hasRole;
    });
  }, [models, selectedMainModels, selectedExecutorModels]);

  const mainModels = useMemo(() => {
    return filteredModels.filter(m => !m.role || m.role === 'both' || m.role === 'main');
  }, [filteredModels]);

  const executorModels = useMemo(() => {
    return filteredModels.filter(m => !m.role || m.role === 'both' || m.role === 'executor');
  }, [filteredModels]);

  const totalCombinations = useMemo(() => {
    return selectedMainModels.size * selectedExecutorModels.size;
  }, [selectedMainModels, selectedExecutorModels]);

  const canStartTest = useMemo(() => {
    return selectedMainModels.size > 0 && selectedExecutorModels.size > 0 && !isRunning;
  }, [selectedMainModels, selectedExecutorModels, isRunning]);

  // WebSocket handlers with memoization
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'combo_test_progress':
          setProgress(data.payload);
          break;
        case 'combo_test_result':
          setResults(prev => {
            const existingIndex = prev.findIndex(r => 
              r.mainModelId === data.payload.mainModelId && 
              r.executorModelId === data.payload.executorModelId
            );
            
            if (existingIndex >= 0) {
              const newResults = [...prev];
              newResults[existingIndex] = data.payload;
              return newResults;
            }
            
            return [...prev, data.payload];
          });
          break;
        case 'combo_test_main_excluded':
          setExcludedMainModels(prev => new Set([...prev, data.payload.mainModelId]));
          break;
        case 'combo_test_error':
          setError(data.payload.message);
          setIsRunning(false);
          break;
        case 'combo_test_completed':
          setIsRunning(false);
          setProgress(null);
          break;
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  }, []);

  // Event handlers with memoization
  const handleModelToggle = useCallback((modelId: string, role: 'main' | 'executor') => {
    if (role === 'main') {
      setSelectedMainModels(prev => {
        const newSet = new Set(prev);
        if (newSet.has(modelId)) {
          newSet.delete(modelId);
        } else {
          newSet.add(modelId);
        }
        return newSet;
      });
    } else {
      setSelectedExecutorModels(prev => {
        const newSet = new Set(prev);
        if (newSet.has(modelId)) {
          newSet.delete(modelId);
        } else {
          newSet.add(modelId);
        }
        return newSet;
      });
    }
  }, []);

  const handleStartTest = useCallback(async () => {
    if (!canStartTest) return;

    setIsRunning(true);
    setError(null);
    setProgress(null);
    setResults([]);
    setExcludedMainModels(new Set());

    try {
      const response = await fetch('/api/tooly/combo-test/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainModels: Array.from(selectedMainModels),
          executorModels: Array.from(selectedExecutorModels)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start combo test');
      }
    } catch (err) {
      setError(err.message);
      setIsRunning(false);
    }
  }, [canStartTest, selectedMainModels, selectedExecutorModels]);

  const handleStopTest = useCallback(async () => {
    try {
      await fetch('/api/tooly/combo-test/stop', { method: 'POST' });
      setIsRunning(false);
      setProgress(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleDetailsClick = useCallback((result: ComboScore) => {
    setSelectedCombo({ main: result.mainModelId, executor: result.executorModelId });
  }, []);

  const handleContextTestClick = useCallback(async (result: ComboScore) => {
    setIsTestingContext(true);
    setContextResults([]);
    
    try {
      const response = await fetch('/api/tooly/combo-test/context-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainModelId: result.mainModelId,
          executorModelId: result.executorModelId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setContextResults(data.results || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsTestingContext(false);
    }
  }, []);

  // Effects
  useEffect(() => {
    const wsUrl = `ws://localhost:3001/ws`;
    const websocket = new ReconnectingWebSocket(wsUrl, [], {
      maxRetries: 10,
      connectionTimeout: 5000,
    });

    websocket.addEventListener('message', handleWebSocketMessage);
    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, [handleWebSocketMessage]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/api/tooly/models');
        const data = await response.json();
        setModels(data.models || []);
        setAvailableProviders(data.providers || {});
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchModels();
  }, []);

  // Render functions
  const renderModelSelection = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Main Models</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {mainModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                isSelected={selectedMainModels.has(model.id)}
                onToggle={(id) => handleModelToggle(id, 'main')}
                role="main"
              />
            ))}
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-2">Executor Models</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {executorModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                isSelected={selectedExecutorModels.has(model.id)}
                onToggle={(id) => handleModelToggle(id, 'executor')}
                role="executor"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Selected: {selectedMainModels.size} main × {selectedExecutorModels.size} executor = {totalCombinations} combinations
        </div>
        <div className="space-x-2">
          <button
            onClick={handleStartTest}
            disabled={!canStartTest}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Combo Test
          </button>
          {isRunning && (
            <button
              onClick={handleStopTest}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Stop Test
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderResults = () => (
    <div className="space-y-4">
      {progress && <ProgressBar progress={progress} />}
      
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Test Results</h3>
        </div>
        <div className="p-4">
          {results.length > 0 ? (
            <List
              height={400}
              itemCount={results.length}
              itemSize={60}
              itemData={results}
              onDetailsClick={handleDetailsClick}
              onContextTestClick={handleContextTestClick}
            >
              {ResultRow}
            </List>
          ) : (
            <div className="text-center text-gray-500 py-8">
              No results yet. Start a test to see results here.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Combo Testing</h1>
        <button
          onClick={() => navigate('/tooly')}
          className="px-4 py-2 text-blue-600 hover:text-blue-800"
        >
          ← Back to Tooly
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {renderModelSelection()}
      {renderResults()}
    </div>
  );
};

export default ComboTest;
