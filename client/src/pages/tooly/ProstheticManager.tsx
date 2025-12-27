/**
 * Prosthetic Manager
 * 
 * UI for viewing, editing, and managing prosthetic prompts.
 * Also includes the knowledge distillation interface for learning from strong models.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ============================================================
// TYPES
// ============================================================

interface ProstheticVersion {
  version: number;
  prompt: string;
  createdAt: string;
  scoreImprovement: number;
  testedAgainst: string[];
}

interface ProstheticEntry {
  modelId: string;
  prompt: string;
  level: 1 | 2 | 3 | 4;
  probesFixed: string[];
  categoryImprovements: {
    tool?: number;
    rag?: number;
    reasoning?: number;
    intent?: number;
    browser?: number;
  };
  createdAt: string;
  updatedAt: string;
  successfulRuns: number;
  verified: boolean;
  currentVersion: number;
  versions: ProstheticVersion[];
  targetTaskTypes?: string[];
  learnedFromModel?: string;
}

interface ProstheticStats {
  totalEntries: number;
  verifiedCount: number;
  levelDistribution: Record<number, number>;
  avgSuccessfulRuns: number;
}

interface DistillationResult {
  success: boolean;
  teacherModelId: string;
  studentModelId: string;
  capability: string;
  teacherScore: number;
  studentScoreBefore: number;
  studentScoreAfter: number;
  prostheticGenerated: string | null;
  patterns: Array<{ name: string; description: string }>;
  message: string;
}

interface Model {
  id: string;
  displayName?: string;
}

type Tab = 'library' | 'editor' | 'distill';

// ============================================================
// PROSTHETIC LIBRARY TAB
// ============================================================

const ProstheticLibrary: React.FC<{
  prosthetics: ProstheticEntry[];
  stats: ProstheticStats;
  onSelect: (entry: ProstheticEntry) => void;
  onDelete: (modelId: string) => void;
  isLoading: boolean;
}> = ({ prosthetics, stats, onSelect, onDelete, isLoading }) => {
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');

  const filteredProsthetics = prosthetics.filter(p => {
    if (filter === 'verified' && !p.verified) return false;
    if (filter === 'unverified' && p.verified) return false;
    if (levelFilter !== 'all' && p.level !== levelFilter) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin text-4xl">⚙️</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="text-3xl font-bold text-cyan-400">{stats.totalEntries}</div>
          <div className="text-sm text-gray-400">Total Prosthetics</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-green-500/30">
          <div className="text-3xl font-bold text-green-400">{stats.verifiedCount}</div>
          <div className="text-sm text-gray-400">Verified</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="text-3xl font-bold text-purple-400">
            {stats.avgSuccessfulRuns.toFixed(1)}
          </div>
          <div className="text-sm text-gray-400">Avg Success Runs</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(level => (
              <div key={level} className="text-center">
                <div className="text-lg font-bold text-yellow-400">
                  {stats.levelDistribution[level] || 0}
                </div>
                <div className="text-xs text-gray-500">L{level}</div>
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-400 mt-1">By Level</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex gap-2">
          {(['all', 'verified', 'unverified'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                filter === f
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 text-sm text-white"
        >
          <option value="all">All Levels</option>
          <option value={1}>Level 1 - Hints</option>
          <option value={2}>Level 2 - Requirements</option>
          <option value={3}>Level 3 - Mandatory</option>
          <option value={4}>Level 4 - Hard Rules</option>
        </select>
      </div>

      {/* Prosthetic List */}
      {filteredProsthetics.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-4">🧪</div>
          <p>No prosthetics found matching filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProsthetics.map((entry) => (
            <div
              key={entry.modelId}
              className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 hover:border-cyan-500/50 transition-colors cursor-pointer"
              onClick={() => onSelect(entry)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{entry.modelId}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      entry.level === 1 ? 'bg-green-500/20 text-green-400' :
                      entry.level === 2 ? 'bg-yellow-500/20 text-yellow-400' :
                      entry.level === 3 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      Level {entry.level}
                    </span>
                    {entry.verified && (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                        ✓ Verified
                      </span>
                    )}
                    {entry.learnedFromModel && (
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                        📚 From {entry.learnedFromModel}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {entry.probesFixed.length} probes fixed • 
                    v{entry.currentVersion} • 
                    {entry.successfulRuns} successful runs
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(entry.modelId);
                    }}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete prosthetic"
                  >
                    🗑️
                  </button>
                  <span className="text-gray-400">→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// PROSTHETIC EDITOR TAB
// ============================================================

const ProstheticEditor: React.FC<{
  entry: ProstheticEntry | null;
  onSave: (modelId: string, prompt: string, level: number) => void;
  onTest: (modelId: string) => void;
  onBack: () => void;
}> = ({ entry, onSave, onTest, onBack }) => {
  const [prompt, setPrompt] = useState(entry?.prompt || '');
  const [level, setLevel] = useState<number>(entry?.level || 1);
  const [selectedVersion, setSelectedVersion] = useState<number>(entry?.currentVersion || 1);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setPrompt(entry.prompt);
      setLevel(entry.level);
      setSelectedVersion(entry.currentVersion);
    }
  }, [entry]);

  const handleVersionChange = (version: number) => {
    setSelectedVersion(version);
    const v = entry?.versions.find(v => v.version === version);
    if (v) {
      setPrompt(v.prompt);
    }
  };

  const handleSave = async () => {
    if (!entry) return;
    setIsSaving(true);
    await onSave(entry.modelId, prompt, level);
    setIsSaving(false);
  };

  if (!entry) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-4">📝</div>
        <p>Select a prosthetic from the library to edit</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
        >
          ← Back to Library
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        ← Back to Library
      </button>

      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{entry.modelId}</h3>
          <div className="flex items-center gap-3">
            {entry.verified && (
              <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">
                ✓ Verified
              </span>
            )}
            <select
              value={selectedVersion}
              onChange={(e) => handleVersionChange(Number(e.target.value))}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm"
            >
              {entry.versions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} - {new Date(v.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Level Selector */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Prosthetic Level</label>
          <div className="flex gap-2">
            {[
              { level: 1, label: 'Hints', desc: 'Soft suggestions' },
              { level: 2, label: 'Requirements', desc: 'Clear expectations' },
              { level: 3, label: 'Mandatory', desc: 'MUST/NEVER constraints' },
              { level: 4, label: 'Hard Rules', desc: 'With examples' },
            ].map(({ level: l, label, desc }) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 p-3 rounded-lg border transition-all ${
                  level === l
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className={`font-medium ${level === l ? 'text-cyan-400' : 'text-gray-300'}`}>
                  {label}
                </div>
                <div className="text-xs text-gray-500">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Editor */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Prosthetic Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg p-4 font-mono text-sm text-white resize-none focus:outline-none focus:border-cyan-500"
            placeholder="Enter prosthetic prompt..."
          />
          <div className="text-xs text-gray-500 mt-1">
            {prompt.length} characters • ~{Math.ceil(prompt.length / 4)} tokens
          </div>
        </div>

        {/* Category Improvements */}
        {entry.categoryImprovements && Object.keys(entry.categoryImprovements).some(k => (entry.categoryImprovements as any)[k] > 0) && (
          <div className="mb-4 p-4 bg-gray-700/30 rounded-lg">
            <div className="text-sm text-gray-400 mb-2">Category Improvements</div>
            <div className="flex gap-4">
              {Object.entries(entry.categoryImprovements).map(([cat, improvement]) => 
                improvement && improvement > 0 ? (
                  <div key={cat} className="text-center">
                    <div className="text-green-400 font-bold">+{improvement}%</div>
                    <div className="text-xs text-gray-500">{cat}</div>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-cyan-500 text-black font-bold rounded-lg hover:bg-cyan-400 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => onTest(entry.modelId)}
            className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Test Live
          </button>
          <button
            onClick={() => {
              setPrompt(entry.prompt);
              setLevel(entry.level);
            }}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Revert
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// DISTILLATION TAB
// ============================================================

const DistillationPanel: React.FC<{
  models: Model[];
  capabilities: string[];
  onRunDistillation: (teacher: string, student: string, capability: string) => Promise<DistillationResult | null>;
}> = ({ models, capabilities, onRunDistillation }) => {
  const [teacherModel, setTeacherModel] = useState('');
  const [studentModel, setStudentModel] = useState('');
  const [capability, setCapability] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DistillationResult | null>(null);

  const handleRun = async () => {
    if (!teacherModel || !studentModel || !capability) return;
    
    setIsRunning(true);
    setResult(null);
    
    const distillResult = await onRunDistillation(teacherModel, studentModel, capability);
    setResult(distillResult);
    setIsRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/50 border border-purple-500/30 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          🧠 Knowledge Distillation
        </h3>
        <p className="text-gray-400 text-sm mb-6">
          Learn successful patterns from strong models and transfer them to weaker models via prosthetic prompts.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Teacher Model */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">👨‍🏫 Teacher Model (Strong)</label>
            <select
              value={teacherModel}
              onChange={(e) => setTeacherModel(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              disabled={isRunning}
            >
              <option value="">-- Select Teacher --</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
              ))}
            </select>
          </div>

          {/* Student Model */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">🎓 Student Model (Weak)</label>
            <select
              value={studentModel}
              onChange={(e) => setStudentModel(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              disabled={isRunning}
            >
              <option value="">-- Select Student --</option>
              {models.filter(m => m.id !== teacherModel).map(m => (
                <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
              ))}
            </select>
          </div>

          {/* Capability */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">🎯 Capability</label>
            <select
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              disabled={isRunning}
            >
              <option value="">-- Select Capability --</option>
              {capabilities.map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={isRunning || !teacherModel || !studentModel || !capability}
          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:from-purple-400 hover:to-pink-400 disabled:opacity-50"
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⚙️</span> Running Distillation...
            </span>
          ) : (
            '🧪 Run Distillation'
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className={`border rounded-xl p-6 ${
          result.success 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{result.success ? '✅' : '❌'}</span>
            <div>
              <div className="text-lg font-bold text-white">{result.message}</div>
              <div className="text-sm text-gray-400">
                {result.teacherModelId} → {result.studentModelId}
              </div>
            </div>
          </div>

          {/* Score Comparison */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-800/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{result.teacherScore}%</div>
              <div className="text-sm text-gray-400">Teacher Score</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{result.studentScoreBefore}%</div>
              <div className="text-sm text-gray-400">Student Before</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${
                result.studentScoreAfter > result.studentScoreBefore ? 'text-green-400' : 'text-red-400'
              }`}>
                {result.studentScoreAfter}%
              </div>
              <div className="text-sm text-gray-400">Student After</div>
            </div>
          </div>

          {/* Extracted Patterns */}
          {result.patterns.length > 0 && (
            <div className="mb-4">
              <div className="text-sm text-gray-400 mb-2">Extracted Patterns</div>
              <div className="flex flex-wrap gap-2">
                {result.patterns.map((p, i) => (
                  <span key={i} className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Generated Prosthetic Preview */}
          {result.prostheticGenerated && (
            <div>
              <div className="text-sm text-gray-400 mb-2">Generated Prosthetic</div>
              <pre className="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto max-h-48 overflow-y-auto">
                {result.prostheticGenerated}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export const ProstheticManager: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('library');
  
  // Data state
  const [prosthetics, setProsthetics] = useState<ProstheticEntry[]>([]);
  const [stats, setStats] = useState<ProstheticStats>({
    totalEntries: 0,
    verifiedCount: 0,
    levelDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
    avgSuccessfulRuns: 0
  });
  const [models, setModels] = useState<Model[]>([]);
  const [distillCapabilities, setDistillCapabilities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Editor state
  const [selectedEntry, setSelectedEntry] = useState<ProstheticEntry | null>(null);

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const fetchProsthetics = useCallback(async () => {
    try {
      const response = await fetch('/api/tooly/prosthetics');
      if (!response.ok) throw new Error('Failed to fetch prosthetics');
      const data = await response.json();
      setProsthetics(data.prosthetics || []);
      setStats(data.stats);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch('/api/tooly/models?provider=lmstudio');
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      setModels(data.models || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchDistillCapabilities = useCallback(async () => {
    try {
      const response = await fetch('/api/tooly/distillation/capabilities');
      if (!response.ok) throw new Error('Failed to fetch capabilities');
      const data = await response.json();
      setDistillCapabilities(data.capabilities || []);
    } catch (err: any) {
      console.error('Failed to fetch distillation capabilities:', err);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchProsthetics(), fetchModels(), fetchDistillCapabilities()])
      .finally(() => setIsLoading(false));
  }, [fetchProsthetics, fetchModels, fetchDistillCapabilities]);

  // ============================================================
  // ACTIONS
  // ============================================================

  const handleSelectProsthetic = (entry: ProstheticEntry) => {
    setSelectedEntry(entry);
    setTab('editor');
  };

  const handleDeleteProsthetic = async (modelId: string) => {
    if (!confirm(`Delete prosthetic for ${modelId}?`)) return;
    
    try {
      const response = await fetch(`/api/tooly/prosthetics/${encodeURIComponent(modelId)}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete');
      await fetchProsthetics();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveProsthetic = async (modelId: string, prompt: string, level: number) => {
    try {
      const response = await fetch(`/api/tooly/prosthetics/${encodeURIComponent(modelId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, level })
      });
      if (!response.ok) throw new Error('Failed to save');
      await fetchProsthetics();
      
      // Update selected entry
      const updated = prosthetics.find(p => p.modelId === modelId);
      if (updated) {
        setSelectedEntry({ ...updated, prompt, level: level as 1 | 2 | 3 | 4 });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTestProsthetic = async (modelId: string) => {
    navigate(`/tooly/readiness?model=${encodeURIComponent(modelId)}`);
  };

  const handleRunDistillation = async (
    teacherModelId: string,
    studentModelId: string,
    capability: string
  ): Promise<DistillationResult | null> => {
    try {
      const response = await fetch('/api/tooly/distillation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherModelId, studentModelId, capability })
      });
      if (!response.ok) throw new Error('Distillation failed');
      const result = await response.json();
      
      // Refresh prosthetics list
      await fetchProsthetics();
      
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <button
          onClick={() => navigate('/tooly')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          ← Back to Model Hub
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            Prosthetic Manager
          </h1>
          <p className="text-gray-400 mt-2">
            View, edit, and manage prosthetic prompts that help models succeed
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'library', label: 'Library', icon: '📚' },
            { id: 'editor', label: 'Editor', icon: '✏️' },
            { id: 'distill', label: 'Distillation', icon: '🧠' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                tab === t.id
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-sm text-gray-400 mt-2">
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Content */}
        {tab === 'library' && (
          <ProstheticLibrary
            prosthetics={prosthetics}
            stats={stats}
            onSelect={handleSelectProsthetic}
            onDelete={handleDeleteProsthetic}
            isLoading={isLoading}
          />
        )}

        {tab === 'editor' && (
          <ProstheticEditor
            entry={selectedEntry}
            onSave={handleSaveProsthetic}
            onTest={handleTestProsthetic}
            onBack={() => {
              setSelectedEntry(null);
              setTab('library');
            }}
          />
        )}

        {tab === 'distill' && (
          <DistillationPanel
            models={models}
            capabilities={distillCapabilities}
            onRunDistillation={handleRunDistillation}
          />
        )}
      </div>
    </div>
  );
};

export default ProstheticManager;


