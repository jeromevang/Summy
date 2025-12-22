/**
 * Testing Tab Component
 * Run tests, view live progress, and see categorized results
 */

import React, { useState } from 'react';

interface TestProgress {
  isRunning: boolean;
  currentTest?: string;
  currentCategory?: string;
  progress?: { current: number; total: number };
  status?: string;
  eta?: number;
}

interface PreflightError {
  aborted: boolean;
  abortReason?: 'MODEL_TOO_SLOW' | 'USER_CANCELLED' | 'ERROR';
  preflightLatency?: number;
  preflightMessage?: string;
}

interface ModelProfile {
  modelId: string;
  probeResults?: Record<string, any>;
  capabilities?: Record<string, { supported: boolean; score: number }>;
}

interface TestingTabProps {
  profile: ModelProfile;
  testProgress: TestProgress;
  onRunTests: (mode: string, skipPreflight?: boolean) => void;
  onCancelTests: () => void;
  onClearResults?: () => void;
  isTestRunning: boolean;
  preflightError?: PreflightError | null;
  onDismissPreflightError?: () => void;
}

type TestMode = 'quick' | 'standard' | 'deep' | 'optimization';

const TEST_MODES: Record<TestMode, { name: string; icon: string; time: string; description: string }> = {
  quick: {
    name: 'Quick',
    icon: '⚡',
    time: '~2 min',
    description: 'Essential tests for quick ranking'
  },
  standard: {
    name: 'Standard',
    icon: '🧪',
    time: '~10 min',
    description: 'Full capability assessment'
  },
  deep: {
    name: 'Deep',
    icon: '🔬',
    time: '~20 min',
    description: 'Complete evaluation with all categories'
  },
  optimization: {
    name: 'Optimization',
    icon: '🎯',
    time: '~30+ min',
    description: 'Find optimal settings for this model'
  }
};

const TEST_CATEGORIES = [
  { id: '1.x', name: 'Tool Behavior', tests: ['1.1 Emit', '1.2 Schema', '1.3 Selection', '1.4 Suppression', '1.5-1.8 Advanced'] },
  { id: '2.x', name: 'Reasoning', tests: ['2.1 Intent', '2.2 Planning', '2.3 Conditional', '2.4 Context', '2.5-2.7 Advanced'] },
  { id: '3.x', name: 'RAG Usage', tests: ['3.1 Priority', '3.2 Chaining', '3.3 Error Recovery', '3.4 Synthesis'] },
  { id: '4.x', name: 'Bug Detection', tests: ['4.1-4.4 Domain Bugs'] },
  { id: '5.x', name: 'Navigation', tests: ['5.1-5.3 Codebase Navigation'] },
  { id: '6.x', name: 'Helicopter View', tests: ['6.1-6.3 Architecture Understanding'] },
  { id: '7.x', name: 'Proactive', tests: ['7.1-7.3 Proactive Helpfulness'] },
  { id: '8.x', name: 'Intent Recognition', tests: ['8.1-8.8 When to Call Tools'] },
  { id: '9.x', name: 'Failure Modes', tests: ['9.1 Silent Failure', '9.2 Calibration', '9.3 Correction', '9.4 Partial'] },
  { id: '10.x', name: 'Stateful', tests: ['10.1 Instruction Decay', '10.2 Schema Erosion', '10.3-10.5 Drift'] },
  { id: '11.x', name: 'Precedence', tests: ['11.1-11.5 Rule Conflicts'] },
  { id: '14.x', name: 'Compliance', tests: ['14.1-14.8 System Prompt Following'] }
];

export const TestingTab: React.FC<TestingTabProps> = ({
  profile,
  testProgress,
  onRunTests,
  onCancelTests,
  onClearResults,
  isTestRunning,
  preflightError,
  onDismissPreflightError
}) => {
  const [selectedMode, setSelectedMode] = useState<TestMode>('standard');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  
  // Check if currently in pre-flight check
  const isPreflightCheck = isTestRunning && testProgress.currentCategory === 'Pre-flight Check';

  // Get category status from results
  const getCategoryStatus = (categoryId: string): 'passed' | 'failed' | 'partial' | 'untested' => {
    // This would be derived from actual test results
    if (!profile.probeResults) return 'untested';
    
    // Simplified - in real implementation, check actual results
    const score = profile.probeResults[categoryId.replace('.x', 'Score')];
    if (score === undefined) return 'untested';
    if (score >= 80) return 'passed';
    if (score >= 50) return 'partial';
    return 'failed';
  };

  return (
    <div className="space-y-6">
      {/* Pre-flight Error Message */}
      {preflightError && preflightError.abortReason === 'MODEL_TOO_SLOW' && (
        <div className="bg-red-900/20 border-2 border-red-500/50 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="text-4xl">🐢</div>
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold text-lg mb-2">Model Too Slow</h3>
              <p className="text-gray-300 mb-2">{preflightError.preflightMessage}</p>
              <p className="text-gray-500 text-sm mb-4">
                Response time of {((preflightError.preflightLatency || 0) / 1000).toFixed(1)}s at 2K context 
                exceeds the 5s threshold. Full tests would take too long.
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => onRunTests(selectedMode, true)}
                  className="px-4 py-2 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 
                             rounded-lg text-sm font-medium transition-colors border border-amber-600/50"
                >
                  ⚠️ Force Run Anyway
                </button>
                {onDismissPreflightError && (
                  <button
                    onClick={onDismissPreflightError}
                    className="px-4 py-2 bg-gray-700 text-gray-300 hover:bg-gray-600 
                               rounded-lg text-sm transition-colors"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pre-flight Check In Progress */}
      {isPreflightCheck && (
        <div className="bg-gradient-to-r from-amber-900/20 to-amber-800/10 rounded-lg p-6 
                        border-2 border-amber-500/50">
          <div className="flex items-center gap-4">
            <div className="animate-pulse">
              <span className="text-4xl">⏱️</span>
            </div>
            <div>
              <h3 className="text-amber-400 font-semibold text-lg">Checking Model Speed...</h3>
              <p className="text-gray-400 text-sm">
                Testing response time at 2K context. Models responding over 5s will be flagged.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Test Mode Selection */}
      {!isTestRunning && !preflightError && (
        <div className="grid grid-cols-4 gap-4">
          {(Object.entries(TEST_MODES) as [TestMode, typeof TEST_MODES[TestMode]][]).map(([mode, config]) => (
            <button
              key={mode}
              onClick={() => setSelectedMode(mode)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                selectedMode === mode 
                  ? 'border-purple-500 bg-purple-500/10' 
                  : 'border-[#2d2d2d] bg-[#161616] hover:border-purple-500/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{config.icon}</span>
                <span className="text-white font-medium">{config.name}</span>
              </div>
              <p className="text-gray-500 text-sm">{config.description}</p>
              <p className="text-purple-400 text-xs mt-1">{config.time}</p>
            </button>
          ))}
        </div>
      )}

      {/* Run/Cancel/Clear Buttons */}
      <div className="flex justify-center gap-4">
        {isTestRunning ? (
          <button
            onClick={onCancelTests}
            className="px-8 py-3 bg-red-600/20 text-red-400 hover:bg-red-600/30 
                       rounded-lg text-lg font-medium transition-colors"
          >
            ⏹ Cancel Testing
          </button>
        ) : (
          <>
            <button
              onClick={() => onRunTests(selectedMode)}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-purple-500 
                         hover:from-purple-500 hover:to-purple-400 
                         text-white font-medium rounded-lg text-lg shadow-lg 
                         shadow-purple-500/20 transition-all"
            >
              🚀 Start {TEST_MODES[selectedMode].name} Test
            </button>
            {onClearResults && (
              <button
                onClick={onClearResults}
                className="px-6 py-3 bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 
                           hover:text-gray-300 rounded-lg text-lg font-medium transition-colors"
                title="Clear all test results for this model"
              >
                🗑️ Clear Results
              </button>
            )}
          </>
        )}
      </div>

      {/* Live Progress - Enhanced */}
      {isTestRunning && (
        <div className="bg-gradient-to-r from-purple-900/20 to-purple-800/10 rounded-lg p-6 
                        border-2 border-purple-500/50 shadow-lg shadow-purple-500/10
                        animate-pulse-slow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-3 h-3 bg-purple-500 rounded-full animate-ping" />
                <h3 className="text-white font-semibold text-lg">Testing in Progress</h3>
              </div>
              
              {/* Current Category - Large */}
              <div className="bg-purple-500/20 rounded-lg px-4 py-2 mb-2 border border-purple-500/30">
                <span className="text-purple-300 text-xs uppercase tracking-wide">Category</span>
                <p className="text-purple-100 font-medium text-lg">
                  {testProgress.currentCategory || 'Initializing...'}
                </p>
              </div>
              
              {/* Current Test Name - Prominent */}
              <div className="bg-[#1a1a1a] rounded-lg px-4 py-2 border border-[#2d2d2d]">
                <span className="text-gray-500 text-xs uppercase tracking-wide">Current Test</span>
                <p className="text-white font-mono text-sm truncate">
                  {testProgress.currentTest || 'Starting...'}
                </p>
              </div>
            </div>
            
            <div className="text-right ml-6">
              <div className="bg-[#1a1a1a] rounded-lg px-4 py-3 border border-[#2d2d2d]">
                <span className="text-purple-400 text-3xl font-bold font-mono">
                  {testProgress.progress?.current || 0}
                </span>
                <span className="text-gray-500 text-xl">/{testProgress.progress?.total || '?'}</span>
                <p className="text-gray-500 text-xs mt-1">tests completed</p>
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="h-4 bg-[#2d2d2d] rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 
                         transition-all duration-500 ease-out relative"
              style={{ width: `${testProgress.progress ? (testProgress.progress.current / testProgress.progress.total) * 100 : 0}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent 
                              animate-shimmer" />
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-2">
            <p className="text-gray-400 text-sm">
              {testProgress.status || 'Running tests...'}
            </p>
            <p className="text-purple-400 text-sm font-mono">
              {testProgress.progress ? Math.round((testProgress.progress.current / testProgress.progress.total) * 100) : 0}%
            </p>
          </div>
        </div>
      )}

      {/* Test Categories */}
      <div className="space-y-2">
        <h3 className="text-white font-medium mb-3">Test Categories</h3>
        
        {TEST_CATEGORIES.map(category => {
          const status = getCategoryStatus(category.id);
          const isExpanded = expandedCategory === category.id;
          // Check if this category is currently being tested
          const isActiveCategory = isTestRunning && 
            testProgress.currentCategory?.toLowerCase().includes(category.name.toLowerCase());
          
          return (
            <div 
              key={category.id}
              className={`rounded-lg border overflow-hidden transition-all duration-300 ${
                isActiveCategory 
                  ? 'bg-gradient-to-r from-purple-900/30 to-purple-800/20 border-purple-500 ring-2 ring-purple-500/50 shadow-lg shadow-purple-500/20 scale-[1.02]' 
                  : 'bg-[#161616] border-[#2d2d2d]'
              }`}
            >
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
                  isActiveCategory 
                    ? 'bg-purple-500/10' 
                    : 'hover:bg-[#1a1a1a]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isActiveCategory ? (
                    <span className="relative">
                      <span className="absolute inset-0 bg-purple-500 rounded-full animate-ping opacity-50" />
                      <span className="relative text-purple-400 text-lg">▶</span>
                    </span>
                  ) : (
                    <StatusIcon status={status} />
                  )}
                  <span className={`font-mono text-sm ${isActiveCategory ? 'text-purple-300' : 'text-white'}`}>
                    {category.id}
                  </span>
                  <span className={isActiveCategory ? 'text-purple-100 font-semibold' : 'text-gray-400'}>
                    {category.name}
                  </span>
                  {isActiveCategory && (
                    <span className="ml-2 px-2 py-0.5 bg-purple-500/30 text-purple-300 text-xs rounded-full animate-pulse font-medium">
                      ● TESTING
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {status !== 'untested' && (
                    <span className={`text-sm ${
                      status === 'passed' ? 'text-green-400' :
                      status === 'failed' ? 'text-red-400' :
                      'text-amber-400'
                    }`}>
                      {status === 'passed' ? 'Passed' :
                       status === 'failed' ? 'Failed' : 'Partial'}
                    </span>
                  )}
                  <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </div>
              </button>
              
              {isExpanded && (
                <div className="px-4 py-3 border-t border-[#2d2d2d] bg-[#0f0f0f]">
                  <div className="space-y-2">
                    {category.tests.map((test, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-400">{test}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Status icon component
const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'passed':
      return <span className="text-green-400">✓</span>;
    case 'failed':
      return <span className="text-red-400">✗</span>;
    case 'partial':
      return <span className="text-amber-400">◐</span>;
    default:
      return <span className="text-gray-600">○</span>;
  }
};

export default TestingTab;

