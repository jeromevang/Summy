import React from 'react';
import type { Model, TestProgress } from '../types';
import { useNavigate } from 'react-router-dom';

interface ModelCardProps {
  model: Model;
  isSelected: boolean;
  testProgress: TestProgress;
  calculateETA: () => string | null;
}

export const getStatusIcon = (status: DiscoveredModel['status']) => {
  switch (status) {
    case 'tested': return <div className="w-2 h-2 rounded-full bg-cyber-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]" />;
    case 'known_good': return <div className="w-2 h-2 rounded-full bg-cyber-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]" />;
    case 'untested': return <div className="w-2 h-2 rounded-full bg-cyber-amber shadow-[0_0_8px_rgba(245,158,11,0.5)]" />;
    case 'failed': return <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />;
    default: return <div className="w-2 h-2 rounded-full bg-gray-500" />;
  }
};

export const getRoleBadge = (role?: string) => {
  switch (role) {
    case 'main':
      return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/20">Planning</span>;
    case 'executor':
      return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20">Action</span>;
    case 'both':
      return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider bg-cyber-emerald/10 text-cyber-emerald border border-cyber-emerald/20">Hybrid</span>;
    case 'none':
      return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">Limited</span>;
    default:
      return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider bg-white/5 text-white/30 border border-white/5">Unknown</span>;
  }
};

export const getProviderIcon = (provider: string) => {
  switch (provider) {
    case 'openrouter': return '🚀';
    case 'lmstudio': return '💻';
    case 'openai': return '🌐';
    case 'azure': return '☁️';
    default: return '🤖';
  }
};

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  isSelected,
  testProgress,
  calculateETA,
}) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/tooly/model/${model.id}`);
  };

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
      onClick={handleCardClick}
      className={`group relative p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between h-40 overflow-hidden cursor-pointer ${
        isSelected
          ? 'bg-white/[0.03] border-cyber-purple/50 shadow-[0_0_20px_rgba(139,92,246,0.1)]'
          : 'bg-white/[0.01] border-white/5 hover:border-white/20 hover:bg-white/[0.02]'
      }`}
    >
      {/* Background Glow for Selected */}
      {isSelected && (
        <div className="absolute -right-8 -top-8 w-24 h-24 bg-cyber-purple/10 blur-3xl rounded-full" />
      )}

      {/* Top Section */}
      <div className="relative z-10 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(model.status)}
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">
              {model.provider}
            </span>
          </div>
          <div className="flex gap-1">
            {getRoleBadge(model.role)}
          </div>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm line-clamp-2 leading-tight group-hover:text-cyber-purple transition-colors">
            {model.displayName}
          </h3>
          <div className="flex items-center gap-2 mt-2">
             <span className="text-[10px] text-white/40 font-mono">
               {model.maxContextLength ? `${(model.maxContextLength / 1024).toFixed(0)}K CTX` : '8K CTX'}
             </span>
             <span className="text-white/10 text-[10px]">•</span>
             <span className="text-[10px] text-white/40 font-mono">
               {model.quantization || 'FP16'}
             </span>
          </div>
        </div>
      </div>
      
      {/* Bottom Section */}
      <div className="relative z-10">
        {isTestRunning ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-widest font-bold">
              <span className="text-cyber-purple animate-pulse">Processing</span>
              <span className="text-white/30">{Math.round(progressPercent)}%</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
              <div 
                className="bg-cyber-purple h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-between">
            <div className="text-[24px] opacity-20 filter grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300">
              {getProviderIcon(model.provider)}
            </div>
            {model.score !== undefined ? (
              <div className="text-right">
                <div className="text-white font-mono text-xl font-bold leading-none tracking-tight">
                  {model.score}<span className="text-xs text-white/40 ml-0.5">%</span>
                </div>
                <div className="text-[9px] text-cyber-emerald font-bold uppercase tracking-widest mt-1">
                  Readiness
                </div>
              </div>
            ) : (
              <div className="text-right">
                <div className="text-white/20 font-mono text-xl font-bold leading-none tracking-tight">
                  --
                </div>
                <div className="text-[9px] text-white/20 font-bold uppercase tracking-widest mt-1">
                  No Data
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Indicator Bar */}
      {isSelected && (
        <div className="absolute left-0 bottom-0 top-0 w-1 bg-cyber-purple shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
      )}
    </div>
  );
};

