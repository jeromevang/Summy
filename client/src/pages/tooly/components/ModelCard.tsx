import React from 'react';
import type { DiscoveredModel, TestProgress } from '../types';

interface ModelCardProps {
  model: DiscoveredModel;
  isSelected: boolean;
  testProgress: TestProgress;
  calculateETA: () => string | null;
  onClick: () => void;
}

export const getStatusIcon = (status: DiscoveredModel['status']) => {
  switch (status) {
    case 'tested': return '✅';
    case 'known_good': return '✅';
    case 'untested': return '⚠️';
    case 'failed': return '❌';
    default: return '❓';
  }
};

export const getStatusColor = (status: DiscoveredModel['status']) => {
  switch (status) {
    case 'tested': return 'text-green-400';
    case 'known_good': return 'text-green-400';
    case 'untested': return 'text-yellow-400';
    case 'failed': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

export const getRoleBadge = (role?: string) => {
  switch (role) {
    case 'main':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">🧠 Main</span>;
    case 'executor':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">⚡ Executor</span>;
    case 'both':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">✨ Both</span>;
    case 'none':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">⚠️ Limited</span>;
    default:
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">? Unprobed</span>;
  }
};

export const getProviderBadge = (provider: string) => {
  switch (provider) {
    case 'openrouter':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400">🚀 OpenRouter</span>;
    case 'lmstudio':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">💻 LM Studio</span>;
    case 'openai':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">🌐 OpenAI</span>;
    case 'azure':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-sky-500/20 text-sky-400">☁️ Azure</span>;
    default:
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">{provider}</span>;
  }
};

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  isSelected,
  testProgress,
  calculateETA,
  onClick,
}) => {
  const isTestRunning = testProgress.modelId === model.id && 
    (testProgress.probeProgress?.status === 'running' || 
     testProgress.toolsProgress?.status === 'running' || 
     testProgress.latencyProgress?.status === 'running');

  const currentProgress = (testProgress.probeProgress?.current ?? 0) + 
    (testProgress.toolsProgress?.current ?? 0) + 
    (testProgress.latencyProgress?.current ?? 0);
  
  const totalProgress = (testProgress.probeProgress?.total ?? 0) + 
    (testProgress.toolsProgress?.total ?? 0) + 
    (testProgress.latencyProgress?.total ?? 0);

  const progressPercent = totalProgress > 0 ? (currentProgress / totalProgress) * 100 : 0;

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'border-purple-500 bg-purple-500/10'
          : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={getStatusColor(model.status)}>
            {getStatusIcon(model.status)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-white font-medium">{model.displayName}</p>
              {getRoleBadge(model.role)}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {getProviderBadge(model.provider)}
              {model.quantization && (
                <>
                  <span>•</span>
                  <span className="text-purple-400">{model.quantization}</span>
                </>
              )}
              {model.sizeBytes && (
                <>
                  <span>•</span>
                  <span>{(model.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)}GB</span>
                </>
              )}
              {model.maxContextLength && (
                <>
                  <span>•</span>
                  <span>{(model.maxContextLength / 1024).toFixed(0)}K ctx</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          {model.score !== undefined ? (
            <div className="text-right">
              <p className="text-white font-medium" title="🔧Tools / 🔬Probe / 🧠Reasoning">
                🔧{model.score}/🔬{model.toolScore ?? '-'}/🧠{model.reasoningScore ?? '-'}
              </p>
              <p className="text-gray-500 text-xs">
                {model.toolCount}/{model.totalTools} tools
              </p>
            </div>
          ) : (
            <span className="text-gray-500 text-xs">Not tested</span>
          )}
        </div>
      </div>
      
      {/* Mini Progress Bar on Model Card */}
      {isTestRunning && (
        <div className="mt-3 pt-3 border-t border-[#2d2d2d]">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="animate-pulse text-purple-400 text-xs">●</span>
              <span className="text-xs text-gray-400 truncate max-w-[180px]">
                {testProgress.probeProgress?.currentTest || 
                 testProgress.toolsProgress?.currentTest || 
                 testProgress.latencyProgress?.currentTest || 
                 'Testing...'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {calculateETA() && (
                <span className="text-xs text-gray-500">{calculateETA()}</span>
              )}
              <span className="text-xs text-gray-500">
                {currentProgress}/{totalProgress}
              </span>
            </div>
          </div>
          <div className="w-full bg-[#1a1a1a] rounded-full h-1.5">
            <div 
              className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

