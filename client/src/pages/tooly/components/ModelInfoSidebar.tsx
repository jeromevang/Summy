/**
 * Model Info Sidebar Component
 * Shows comprehensive model info with radar chart
 * Fetches extended info from HuggingFace including benchmarks, downloads, etc.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SkillRadar from '../../../components/SkillRadar';
import ScoreRing from '../../../components/ScoreRing';

interface ModelInfo {
  name?: string;
  author?: string;
  parameters?: string;
  architecture?: string;
  contextLength?: number;
  quantization?: string;
}

interface BenchmarkScores {
  mmlu?: number;
  humaneval?: number;
  gsm8k?: number;
  arc?: number;
  hellaswag?: number;
  truthfulqa?: number;
  winogrande?: number;
  mtbench?: number;
  average?: number;
  [key: string]: number | undefined;
}

interface ExtendedModelInfo extends ModelInfo {
  description?: string;
  fullDescription?: string;
  license?: string;
  capabilities?: string[];
  tags?: string[];
  releaseDate?: string;
  source?: 'huggingface' | 'cache' | 'inference';
  downloads?: number;
  likes?: number;
  gatedAccess?: boolean;
  pipelineTag?: string;
  languages?: string[];
  datasets?: string[];
  baseModel?: string;
  benchmarks?: BenchmarkScores;
  huggingFaceUrl?: string;
  trainingData?: string;
}

interface ScoreBreakdown {
  toolScore?: number;
  reasoningScore?: number;
  ragScore?: number;
  intentScore?: number;
  bugDetectionScore?: number;
  overallScore?: number;
}

interface ModelProfile {
  modelId: string;
  displayName: string;
  score: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  modelInfo?: ModelInfo;
  scoreBreakdown?: ScoreBreakdown;
  testedAt?: string;
}

interface TestProgress {
  isRunning: boolean;
  currentTest?: string;
  currentCategory?: string;
  progress?: number;
  status?: string;
}

interface ModelInfoSidebarProps {
  profile: ModelProfile | null;
  isLoading?: boolean;
  isTestRunning?: boolean;
  testProgress?: TestProgress;
  onSetAsMain?: () => void;
  onSetAsExecutor?: () => void;
}

// Role badge
const RoleBadge: React.FC<{ role: string | undefined }> = ({ role }) => {
  if (!role || role === 'none') return null;
  const config: Record<string, { bg: string; text: string; label: string }> = {
    main: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: '🎯 Main' },
    executor: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: '⚡ Executor' },
    both: { bg: 'bg-green-500/20', text: 'text-green-400', label: '✨ Both' }
  };
  const c = config[role] || config.main;
  return (
    <span className={`${c.bg} ${c.text} px-2 py-0.5 rounded text-xs font-medium`}>
      {c.label}
    </span>
  );
};

// Capability badge with icons
const CapabilityBadge: React.FC<{ capability: string }> = ({ capability }) => {
  const icons: Record<string, string> = {
    'tool-use': '🔧',
    'vision': '👁️',
    'coding': '💻',
    'chat': '💬',
    'instruct': '📝',
    'text-gen': '📄',
    'math': '🔢',
    'reasoning': '🧠',
  };
  return (
    <span className="bg-[#2a2a2a] text-gray-300 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
      {icons[capability] || '•'} {capability}
    </span>
  );
};

// Format large numbers
const formatNumber = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
};

export const ModelInfoSidebar: React.FC<ModelInfoSidebarProps> = ({
  profile,
  isLoading = false,
  isTestRunning = false,
  testProgress,
  onSetAsMain,
  onSetAsExecutor
}) => {
  const navigate = useNavigate();
  const [extendedInfo, setExtendedInfo] = useState<ExtendedModelInfo | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);

  // Fetch extended info from HuggingFace
  useEffect(() => {
    if (!profile?.modelId) {
      setExtendedInfo(null);
      return;
    }

    const fetchExtendedInfo = async () => {
      setFetchingInfo(true);
      try {
        const encodedId = encodeURIComponent(profile.modelId);
        const res = await fetch(`/api/tooly/models/${encodedId}/info`);
        if (res.ok) {
          const data = await res.json();
          setExtendedInfo(data);
        }
      } catch (err) {
        console.warn('Failed to fetch extended model info:', err);
      } finally {
        setFetchingInfo(false);
      }
    };

    fetchExtendedInfo();
  }, [profile?.modelId]);

  if (!profile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-sm">Select a model to view details</p>
        </div>
      </div>
    );
  }

  const info: ExtendedModelInfo = { ...profile.modelInfo, ...extendedInfo };

  // Radar data - use actual scores from scoreBreakdown
  const radarData = [
    { skill: 'Tools', score: profile.scoreBreakdown?.toolScore ?? 0 },
    { skill: 'RAG', score: profile.scoreBreakdown?.ragScore ?? 0 },
    { skill: 'Failures', score: profile.scoreBreakdown?.failureModesScore ?? 0 },
    { skill: 'Stateful', score: profile.scoreBreakdown?.statefulScore ?? 0 },
    { skill: 'Precedence', score: profile.scoreBreakdown?.precedenceScore ?? 0 },
    { skill: 'Compliance', score: profile.scoreBreakdown?.complianceScore ?? 0 },
  ];

  const handleViewDetails = () => {
    navigate(`/tooly/model/${encodeURIComponent(profile.modelId)}`);
  };

  const hasBenchmarks = info.benchmarks && Object.keys(info.benchmarks).length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Compact Header */}
      <div className="flex-shrink-0 flex items-center gap-3 pb-2 border-b border-[#2d2d2d]">
        <ScoreRing score={profile.score} size={56} />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate" title={profile.displayName}>
            {profile.displayName}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <RoleBadge role={profile.role} />
            {info.source === 'huggingface' && (
              <span className="text-yellow-400 text-[10px]" title="Data from HuggingFace">🤗</span>
            )}
          </div>
        </div>
      </div>

      {/* Test Progress */}
      {testProgress?.isRunning && (
        <div className="flex-shrink-0 my-2 bg-purple-500/10 rounded p-2 border border-purple-500/30">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-purple-400 flex items-center gap-1">
              <span className="animate-spin">⚙️</span> Testing
            </span>
            <span className="text-gray-400">{testProgress.progress || 0}%</span>
          </div>
          <div className="w-full bg-[#2d2d2d] rounded-full h-1">
            <div 
              className="bg-purple-500 h-1 rounded-full transition-all"
              style={{ width: `${testProgress.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* LARGE Radar Chart */}
      <div className="flex-shrink-0 flex justify-center py-1 -mx-2">
        <SkillRadar data={radarData} size={400} />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 text-xs">
        {/* Stats Row: Downloads, Likes */}
        {(info.downloads || info.likes) && (
          <div className="flex gap-3 text-gray-400">
            {info.downloads && (
              <span title="Downloads">⬇️ {formatNumber(info.downloads)}</span>
            )}
            {info.likes && (
              <span title="Likes">❤️ {formatNumber(info.likes)}</span>
            )}
            {info.license && (
              <span title="License">📄 {info.license}</span>
            )}
          </div>
        )}

        {/* Description */}
        {info.description && (
          <p className="text-gray-300 text-[11px] leading-relaxed line-clamp-2" title={info.description}>
            {info.description}
          </p>
        )}

        {/* Capabilities */}
        {info.capabilities && info.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {info.capabilities.slice(0, 6).map(cap => (
              <CapabilityBadge key={cap} capability={cap} />
            ))}
          </div>
        )}

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 bg-[#1a1a1a] rounded p-2">
          {info.parameters && <SpecRow label="Size" value={info.parameters} />}
          {info.quantization && <SpecRow label="Quant" value={info.quantization} />}
          {info.contextLength && <SpecRow label="Context" value={`${(info.contextLength / 1000).toFixed(0)}K`} />}
          {info.architecture && <SpecRow label="Arch" value={info.architecture} />}
          {info.author && <SpecRow label="Author" value={info.author} />}
          {info.baseModel && <SpecRow label="Base" value={info.baseModel.split('/').pop() || info.baseModel} />}
        </div>

        {/* Benchmarks */}
        {hasBenchmarks && (
          <div className="bg-[#1a1a1a] rounded p-2">
            <div className="text-gray-400 text-[10px] mb-1 font-medium">📊 Benchmarks</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {Object.entries(info.benchmarks!).slice(0, 6).map(([key, val]) => (
                val !== undefined && (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-500 uppercase">{key}</span>
                    <span className="text-teal-400 font-mono">{typeof val === 'number' ? val.toFixed(1) : val}</span>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {info.tags && info.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {info.tags.slice(0, 8).map(tag => (
              <span key={tag} className="bg-[#222] text-gray-500 px-1 py-0.5 rounded text-[9px]">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* HuggingFace Link */}
        {info.huggingFaceUrl && (
          <a
            href={info.huggingFaceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-500 hover:text-yellow-400 text-[10px] flex items-center gap-1"
          >
            🤗 View on HuggingFace →
          </a>
        )}

        {/* Loading */}
        {fetchingInfo && (
          <div className="text-gray-500 text-[10px] text-center py-1 animate-pulse">
            Fetching from HuggingFace...
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex-shrink-0 pt-2 mt-2 border-t border-[#2d2d2d] space-y-1.5">
        <div className="flex gap-2">
          <button
            onClick={onSetAsMain}
            disabled={isTestRunning}
            className={`flex-1 py-1 px-2 rounded text-[11px] font-medium transition
              ${isTestRunning ? 'bg-gray-700 text-gray-500' : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'}`}
          >
            🎯 Main
          </button>
          <button
            onClick={onSetAsExecutor}
            disabled={isTestRunning}
            className={`flex-1 py-1 px-2 rounded text-[11px] font-medium transition
              ${isTestRunning ? 'bg-gray-700 text-gray-500' : 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30'}`}
          >
            ⚡ Exec
          </button>
        </div>
        <button
          onClick={handleViewDetails}
          className="w-full py-1.5 px-3 bg-gradient-to-r from-purple-600 to-purple-500 
                     hover:from-purple-500 hover:to-purple-400 text-white font-medium 
                     rounded transition text-xs shadow shadow-purple-500/20"
        >
          View Details →
        </button>
      </div>
    </div>
  );
};

// Spec row helper
const SpecRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between">
    <span className="text-gray-500">{label}</span>
    <span className="text-white font-mono truncate ml-1" title={value}>{value}</span>
  </div>
);

export default ModelInfoSidebar;
