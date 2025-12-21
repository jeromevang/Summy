/**
 * Model Info Sidebar Component
 * Simplified sidebar showing basic model info and radar chart
 * Includes "View Details" button to navigate to full detail page
 */

import React from 'react';
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

interface ModelInfoSidebarProps {
  profile: ModelProfile | null;
  isLoading?: boolean;
  isTestRunning?: boolean;
  onSetAsMain?: () => void;
  onSetAsExecutor?: () => void;
}

// Role badge component
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

export const ModelInfoSidebar: React.FC<ModelInfoSidebarProps> = ({
  profile,
  isLoading = false,
  isTestRunning = false,
  onSetAsMain,
  onSetAsExecutor
}) => {
  const navigate = useNavigate();

  if (!profile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <p>Select a model to view details</p>
        </div>
      </div>
    );
  }

  // Prepare radar data
  const radarData = [
    { subject: 'Tools', value: profile.scoreBreakdown?.toolScore ?? 0 },
    { subject: 'Reasoning', value: profile.scoreBreakdown?.reasoningScore ?? 0 },
    { subject: 'RAG', value: profile.scoreBreakdown?.ragScore ?? 0 },
    { subject: 'Intent', value: profile.scoreBreakdown?.intentScore ?? 0 },
    { subject: 'Bugs', value: profile.scoreBreakdown?.bugDetectionScore ?? 0 },
  ];

  const handleViewDetails = () => {
    const encodedId = encodeURIComponent(profile.modelId);
    navigate(`/tooly/model/${encodedId}`);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with Score Ring */}
      <div className="flex items-start gap-4 mb-4">
        {/* Score Ring */}
        <div className="flex-shrink-0">
          <ScoreRing score={profile.score} size={80} />
        </div>
        
        {/* Model Name and Role */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-lg truncate" title={profile.displayName}>
            {profile.displayName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <RoleBadge role={profile.role} />
          </div>
          {profile.testedAt && (
            <p className="text-gray-500 text-xs mt-1">
              Tested: {new Date(profile.testedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Radar Chart */}
      <div className="flex-shrink-0 flex justify-center mb-4">
        <SkillRadar data={radarData} size={220} />
      </div>

      {/* Model Info */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {profile.modelInfo?.parameters && (
          <InfoRow label="Size" value={profile.modelInfo.parameters} />
        )}
        {profile.modelInfo?.quantization && (
          <InfoRow label="Quant" value={profile.modelInfo.quantization} />
        )}
        {profile.modelInfo?.contextLength && (
          <InfoRow label="Context" value={`${(profile.modelInfo.contextLength / 1000).toFixed(0)}K`} />
        )}
        {profile.modelInfo?.architecture && (
          <InfoRow label="Arch" value={profile.modelInfo.architecture} />
        )}
        {profile.modelInfo?.author && (
          <InfoRow label="Author" value={profile.modelInfo.author} />
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex-shrink-0 space-y-2">
        {/* Role Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onSetAsMain}
            disabled={isTestRunning}
            className={`flex-1 py-1.5 px-3 rounded text-sm font-medium transition-colors
              ${isTestRunning 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'}`}
            title={isTestRunning ? 'Cannot change while test is running' : 'Set as Main Model'}
          >
            🎯 Set Main
          </button>
          <button
            onClick={onSetAsExecutor}
            disabled={isTestRunning}
            className={`flex-1 py-1.5 px-3 rounded text-sm font-medium transition-colors
              ${isTestRunning 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30'}`}
            title={isTestRunning ? 'Cannot change while test is running' : 'Set as Executor Model'}
          >
            ⚡ Set Exec
          </button>
        </div>
        
        {/* View Details Button */}
        <button
          onClick={handleViewDetails}
          className="w-full py-2 px-4 bg-gradient-to-r from-purple-600 to-purple-500 
                     hover:from-purple-500 hover:to-purple-400 
                     text-white font-medium rounded-lg transition-all
                     shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
        >
          View Details →
        </button>
      </div>
    </div>
  );
};

// Helper component for info rows
const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center py-1 border-b border-[#2d2d2d]">
    <span className="text-gray-500 text-sm">{label}</span>
    <span className="text-white text-sm font-mono">{value}</span>
  </div>
);

export default ModelInfoSidebar;

