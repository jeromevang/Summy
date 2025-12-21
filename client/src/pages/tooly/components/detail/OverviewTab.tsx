/**
 * Overview Tab Component
 * Shows scores, badges, recommendations, and failure profile
 */

import React from 'react';

interface ModelProfile {
  modelId: string;
  displayName: string;
  score: number;
  scoreBreakdown?: Record<string, number>;
  badges?: Array<{ id: string; name: string; icon: string }>;
  recommendations?: Array<{ type: string; message: string; priority: string }>;
  failureProfile?: {
    failureType?: string;
    hallucinationType?: string;
    confidenceWhenWrong?: number;
    recoverable?: boolean;
    failureConditions?: string[];
  };
  trainabilityScores?: {
    systemPromptCompliance?: number;
    instructionPersistence?: number;
    correctionAcceptance?: number;
    overallTrainability?: number;
  };
  modelInfo?: Record<string, any>;
  testedAt?: string;
}

interface OverviewTabProps {
  profile: ModelProfile;
  onRunTests: (mode: string) => void;
  isTestRunning: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  profile,
  onRunTests,
  isTestRunning
}) => {
  return (
    <div className="space-y-6">
      {/* Dual Scoring Section */}
      <div className="grid grid-cols-2 gap-6">
        {/* Raw Capabilities */}
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <span>📊</span> Raw Capabilities
          </h3>
          <div className="space-y-3">
            {profile.scoreBreakdown && Object.entries(profile.scoreBreakdown).map(([key, value]) => (
              <ScoreBar 
                key={key} 
                label={formatLabel(key)} 
                value={value} 
                color={getScoreColor(value)}
              />
            ))}
          </div>
        </div>

        {/* Trainability */}
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <span>🎓</span> Trainability (Programmability)
          </h3>
          {profile.trainabilityScores ? (
            <div className="space-y-3">
              <ScoreBar 
                label="System Prompt Compliance" 
                value={profile.trainabilityScores.systemPromptCompliance ?? 0} 
                color="text-purple-400"
              />
              <ScoreBar 
                label="Instruction Persistence" 
                value={profile.trainabilityScores.instructionPersistence ?? 0} 
                color="text-purple-400"
              />
              <ScoreBar 
                label="Correction Acceptance" 
                value={profile.trainabilityScores.correctionAcceptance ?? 0} 
                color="text-purple-400"
              />
              <div className="pt-2 border-t border-[#2d2d2d]">
                <ScoreBar 
                  label="Overall Trainability" 
                  value={profile.trainabilityScores.overallTrainability ?? 0} 
                  color="text-green-400"
                />
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              Run compliance tests (14.x) to measure trainability.
            </p>
          )}
        </div>
      </div>

      {/* Badges */}
      {profile.badges && profile.badges.length > 0 && (
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h3 className="text-white font-medium mb-3">🏆 Earned Badges</h3>
          <div className="flex flex-wrap gap-2">
            {profile.badges.map(badge => (
              <span 
                key={badge.id}
                className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-amber-600/20 
                           text-amber-400 rounded-full text-sm flex items-center gap-1"
              >
                <span>{badge.icon}</span>
                {badge.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Failure Profile */}
      {profile.failureProfile && profile.failureProfile.failureType !== 'none' && (
        <div className="bg-[#161616] rounded-lg p-4 border border-red-900/30">
          <h3 className="text-red-400 font-medium mb-3">⚠️ Failure Profile</h3>
          <div className="grid grid-cols-2 gap-4">
            <InfoItem 
              label="Failure Type" 
              value={profile.failureProfile.failureType || 'Unknown'} 
            />
            <InfoItem 
              label="Hallucination Type" 
              value={profile.failureProfile.hallucinationType || 'None'} 
            />
            <InfoItem 
              label="Confidence When Wrong" 
              value={`${profile.failureProfile.confidenceWhenWrong ?? 0}%`} 
            />
            <InfoItem 
              label="Recoverable" 
              value={profile.failureProfile.recoverable ? 'Yes' : 'No'} 
            />
          </div>
          {profile.failureProfile.failureConditions && 
           profile.failureProfile.failureConditions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#2d2d2d]">
              <span className="text-gray-500 text-sm">Fails under: </span>
              <span className="text-gray-300 text-sm">
                {profile.failureProfile.failureConditions.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {profile.recommendations && profile.recommendations.length > 0 && (
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h3 className="text-white font-medium mb-3">💡 Recommendations</h3>
          <div className="space-y-2">
            {profile.recommendations.map((rec, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded-lg ${
                  rec.priority === 'high' ? 'bg-red-900/10 border border-red-900/30' :
                  rec.priority === 'medium' ? 'bg-amber-900/10 border border-amber-900/30' :
                  'bg-[#1a1a1a] border border-[#2d2d2d]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={
                    rec.priority === 'high' ? 'text-red-400' :
                    rec.priority === 'medium' ? 'text-amber-400' :
                    'text-blue-400'
                  }>
                    {rec.type === 'warning' ? '⚠️' : 
                     rec.type === 'improvement' ? '🔧' : '💡'}
                  </span>
                  <p className="text-gray-300 text-sm">{rec.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Info */}
      {profile.modelInfo && (
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h3 className="text-white font-medium mb-3">ℹ️ Model Information</h3>
          <div className="grid grid-cols-3 gap-4">
            {profile.modelInfo.parameters && (
              <InfoItem label="Parameters" value={profile.modelInfo.parameters} />
            )}
            {profile.modelInfo.quantization && (
              <InfoItem label="Quantization" value={profile.modelInfo.quantization} />
            )}
            {profile.modelInfo.contextLength && (
              <InfoItem 
                label="Context Length" 
                value={`${(profile.modelInfo.contextLength / 1000).toFixed(0)}K`} 
              />
            )}
            {profile.modelInfo.architecture && (
              <InfoItem label="Architecture" value={profile.modelInfo.architecture} />
            )}
            {profile.modelInfo.author && (
              <InfoItem label="Author" value={profile.modelInfo.author} />
            )}
            {profile.modelInfo.license && (
              <InfoItem label="License" value={profile.modelInfo.license} />
            )}
          </div>
        </div>
      )}

      {/* Test Modes CTA */}
      {!profile.scoreBreakdown && (
        <div className="bg-purple-900/10 rounded-lg p-6 border border-purple-900/30 text-center">
          <h3 className="text-white font-medium mb-2">No Test Results Yet</h3>
          <p className="text-gray-400 text-sm mb-4">
            Run tests to evaluate this model's capabilities
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => onRunTests('quick')}
              disabled={isTestRunning}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              ⚡ Quick (~2 min)
            </button>
            <button
              onClick={() => onRunTests('standard')}
              disabled={isTestRunning}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500 disabled:opacity-50"
            >
              🧪 Standard (~10 min)
            </button>
            <button
              onClick={() => onRunTests('deep')}
              disabled={isTestRunning}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              🔬 Deep (~20 min)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper components
const ScoreBar: React.FC<{ label: string; value: number; color?: string }> = ({ 
  label, 
  value, 
  color = 'text-white' 
}) => (
  <div className="flex items-center justify-between">
    <span className="text-gray-400 text-sm">{label}</span>
    <div className="flex items-center gap-2">
      <div className="w-32 h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            value >= 80 ? 'bg-green-500' :
            value >= 60 ? 'bg-amber-500' :
            value >= 40 ? 'bg-orange-500' :
            'bg-red-500'
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-sm font-mono w-10 text-right ${color}`}>
        {value}%
      </span>
    </div>
  </div>
);

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span className="text-gray-500 text-xs block">{label}</span>
    <span className="text-white text-sm">{value}</span>
  </div>
);

const formatLabel = (key: string): string => {
  return key
    .replace(/Score$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, c => c.toUpperCase());
};

const getScoreColor = (value: number): string => {
  if (value >= 80) return 'text-green-400';
  if (value >= 60) return 'text-amber-400';
  if (value >= 40) return 'text-orange-400';
  return 'text-red-400';
};

export default OverviewTab;

