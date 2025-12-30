import React, { useState } from 'react';
import { FailurePatternCard } from './components/FailurePatternCard';
import ProstheticReview from './components/ProstheticReview';
import { SummaryPanel } from './Controller/components';
import { useController } from './Controller/hooks/useController';

const Tooltip: React.FC<{ children: React.ReactNode; content: string }> = ({ children, content }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>{children}</div>
      {show && (
        <div className="absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

export default function Controller() {
  const {
    patterns, failures, alerts, observerStatus, summary, analysis, analyzing, loading, error, setError,
    selectedPattern, setSelectedPattern, showProstheticReview, setShowProstheticReview,
    comboProsthetics, comboTeachingResults, comboResults, teachingCombos,
    toggleObserver, runAnalysis, runComboTeaching, loadData
  } = useController();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-900/30 border-red-500/50';
      case 'high': return 'text-orange-400 bg-orange-900/30 border-orange-500/50';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30 border-yellow-500/50';
      default: return 'text-blue-400 bg-blue-900/30 border-blue-500/50';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'tool': return '🔧'; case 'rag': return '🔍'; case 'reasoning': return '🧠';
      case 'intent': return '💭'; case 'browser': return '🌐'; case 'combo_pairing': return '🤝';
      default: return '❓';
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">🎮 Controller <span className="text-sm font-normal text-gray-400 ml-2">Self-Improving Monitor</span></h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full \${observerStatus?.running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-gray-400">Observer</span>
            <button onClick={toggleObserver} className={`px-3 py-1 rounded text-xs font-medium \${observerStatus?.running ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
              {observerStatus?.running ? 'Stop' : 'Start'}
            </button>
          </div>
          <button onClick={runAnalysis} disabled={analyzing} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium disabled:opacity-50">
            {analyzing ? 'Analyzing...' : 'Analyze Failures'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-300">⚠️ {error} <button onClick={() => setError(null)} className="ml-2">×</button></div>}

      <SummaryPanel unresolvedFailures={summary?.unresolvedFailures || 0} criticalPatterns={summary?.criticalPatterns || 0} modelsAffected={summary?.modelsAffected || 0} patternsTracked={patterns.length} />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-lg font-semibold mb-4">📋 Failure Patterns</h2>
          <div className="space-y-2">
            {patterns.map(p => <FailurePatternCard key={p.id} pattern={p} isSelected={selectedPattern === p.id} onSelect={setSelectedPattern} onAnalyze={() => { setSelectedPattern(p.id); runAnalysis(); }} />)}
          </div>
        </div>

        <div className="col-span-1 bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-lg font-semibold mb-4">🔥 Recent Failures</h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {failures.slice(0, 20).map(f => (
              <div key={f.id} className="p-3 rounded-lg border border-gray-700 text-sm">
                <div className="flex justify-between mb-1"><span>{getCategoryIcon(f.category)} {f.errorType}</span><span className="text-xs text-gray-500">{new Date(f.timestamp).toLocaleTimeString()}</span></div>
                <div className="text-xs text-purple-400 mb-1">{f.modelId.split('/').pop()}</div>
                <p className="text-gray-400 text-xs truncate">{f.error}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-1 space-y-4">
          <div className="bg-gray-900 rounded-lg border border-blue-500/50 p-4">
            <h2 className="text-lg font-semibold mb-4">🤝 Combo Learning</h2>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {comboResults.slice(0, 5).map(c => (
                <div key={c.id} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                  <div className="text-xs truncate flex-1"><span className="text-blue-400">{c.mainModelId.split('/').pop()}</span> ↔ {c.executorModelId.split('/').pop()}</div>
                  <button onClick={() => runComboTeaching(c.mainModelId, c.executorModelId)} disabled={teachingCombos} className="ml-2 px-2 py-1 bg-purple-600 rounded text-xs">Teach</button>
                </div>
              ))}
            </div>
          </div>

          {analysis && (
            <div className="bg-gray-900 rounded-lg border border-purple-500/50 p-4">
              <h2 className="text-lg font-semibold mb-2">🔬 Analysis</h2>
              <p className="text-sm text-gray-300 mb-2"><strong>Diagnosis:</strong> {analysis.diagnosis}</p>
              <div className="flex items-center gap-2 text-xs text-purple-400 mb-4">
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full"><div className="h-full bg-purple-500 rounded-full" style={{ width: `\${analysis.confidence}%` }} /></div>
                {analysis.confidence}% confidence
              </div>
              <button onClick={() => setShowProstheticReview(true)} className="w-full py-2 bg-purple-600 rounded text-sm font-medium">Review & Apply</button>
            </div>
          )}

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <h2 className="text-lg font-semibold mb-4">🔔 Recent Alerts</h2>
            <div className="space-y-2">
              {alerts.length ? alerts.map(a => <div key={a.id} className={`p-2 rounded border text-sm \${getSeverityColor(a.severity)}`}><strong>{a.patternName}</strong>: {a.message}</div>) : <div className="text-gray-500 text-center text-sm">No alerts yet</div>}
            </div>
          </div>
        </div>
      </div>

      {showProstheticReview && analysis && (
        <ProstheticReview
          analysis={{ ...analysis, affectedPatterns: patterns.map(p => p.name).slice(0, 5) }}
          onApprove={async (modelId, modifications) => {
            const res = await fetch('http://localhost:3001/api/tooly/controller/apply-prosthetic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId, prosthetic: { ...analysis.suggestedProsthetic, ...modifications }, testFirst: true }) });
            if (res.ok) { setShowProstheticReview(false); loadData(); alert('Applied!'); }
          }}
          onReject={() => setShowProstheticReview(false)}
          onClose={() => setShowProstheticReview(false)}
        />
      )}
    </div>
  );
}