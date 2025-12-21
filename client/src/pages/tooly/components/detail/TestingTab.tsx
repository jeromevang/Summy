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

interface ModelProfile {
  modelId: string;
  probeResults?: Record<string, any>;
  capabilities?: Record<string, { supported: boolean; score: number }>;
}

interface TestingTabProps {
  profile: ModelProfile;
  testProgress: TestProgress;
  onRunTests: (mode: string) => void;
  onCancelTests: () => void;
  isTestRunning: boolean;
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
  isTestRunning
}) => {
  const [selectedMode, setSelectedMode] = useState<TestMode>('standard');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

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
      {/* Test Mode Selection */}
      {!isTestRunning && (
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

      {/* Run/Cancel Button */}
      <div className="flex justify-center">
        {isTestRunning ? (
          <button
            onClick={onCancelTests}
            className="px-8 py-3 bg-red-600/20 text-red-400 hover:bg-red-600/30 
                       rounded-lg text-lg font-medium transition-colors"
          >
            ⏹ Cancel Testing
          </button>
        ) : (
          <button
            onClick={() => onRunTests(selectedMode)}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-purple-500 
                       hover:from-purple-500 hover:to-purple-400 
                       text-white font-medium rounded-lg text-lg shadow-lg 
                       shadow-purple-500/20 transition-all"
          >
            🚀 Start {TEST_MODES[selectedMode].name} Test
          </button>
        )}
      </div>

      {/* Live Progress */}
      {isTestRunning && testProgress.progress && (
        <div className="bg-[#161616] rounded-lg p-6 border border-purple-500/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-medium">Testing in Progress</h3>
              <p className="text-gray-400 text-sm">
                {testProgress.currentCategory}: {testProgress.currentTest}
              </p>
            </div>
            <div className="text-right">
              <span className="text-purple-400 text-lg font-mono">
                {testProgress.progress.current}/{testProgress.progress.total}
              </span>
              <p className="text-gray-500 text-xs">tests completed</p>
            </div>
          </div>
          
          <div className="h-3 bg-[#2d2d2d] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-600 to-purple-400 
                         transition-all duration-300 relative"
              style={{ width: `${(testProgress.progress.current / testProgress.progress.total) * 100}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
          
          <p className="text-gray-500 text-xs mt-2 text-center">
            {testProgress.status || 'Running tests...'}
          </p>
        </div>
      )}

      {/* Test Categories */}
      <div className="space-y-2">
        <h3 className="text-white font-medium mb-3">Test Categories</h3>
        
        {TEST_CATEGORIES.map(category => {
          const status = getCategoryStatus(category.id);
          const isExpanded = expandedCategory === category.id;
          
          return (
            <div 
              key={category.id}
              className="bg-[#161616] rounded-lg border border-[#2d2d2d] overflow-hidden"
            >
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1a1a1a] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <StatusIcon status={status} />
                  <span className="text-white font-mono text-sm">{category.id}</span>
                  <span className="text-gray-400">{category.name}</span>
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

