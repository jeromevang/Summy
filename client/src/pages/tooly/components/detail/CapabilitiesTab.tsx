/**
 * Capabilities Tab Component
 * Detailed probe results by category with expandable test details
 */

import React, { useState } from 'react';

interface TestProgress {
  isRunning: boolean;
  currentCategory?: string;
}

interface ProbeResult {
  passed: boolean;
  score: number;
  details: string;
}

interface ModelProfile {
  modelId: string;
  capabilities?: Record<string, { supported: boolean; score: number; nativeAliases?: string[] }>;
  probeResults?: {
    emitTest?: ProbeResult;
    schemaTest?: ProbeResult;
    selectionTest?: ProbeResult;
    suppressionTest?: ProbeResult;
    strategicRAGProbes?: Array<{ name: string; passed: boolean; score: number }>;
    architecturalProbes?: Array<{ name: string; passed: boolean; score: number }>;
    intentProbes?: Array<{ name: string; passed: boolean; score: number }>;
    reasoningProbes?: Record<string, ProbeResult>;
  };
}

interface CapabilitiesTabProps {
  profile: ModelProfile;
  testProgress: TestProgress;
}

const CAPABILITY_SECTIONS = [
  {
    id: 'tool',
    name: 'Tool Behavior (1.x)',
    icon: '🔧',
    probes: ['emitTest', 'schemaTest', 'selectionTest', 'suppressionTest']
  },
  {
    id: 'reasoning',
    name: 'Reasoning (2.x)',
    icon: '🧠',
    probes: ['intentExtraction', 'multiStepPlanning', 'conditionalReasoning', 'contextContinuity']
  },
  {
    id: 'rag',
    name: 'RAG Usage (3.x)',
    icon: '🔍',
    arrayKey: 'strategicRAGProbes'
  },
  {
    id: 'domain',
    name: 'Domain/Bug Detection (4.x)',
    icon: '🐛',
    arrayKey: 'architecturalProbes'
  },
  {
    id: 'intent',
    name: 'Intent Recognition (8.x)',
    icon: '🎯',
    arrayKey: 'intentProbes'
  }
];

export const CapabilitiesTab: React.FC<CapabilitiesTabProps> = ({
  profile,
  testProgress
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>('tool');

  const getProbeResult = (probeName: string): ProbeResult | null => {
    if (!profile.probeResults) return null;
    
    // Check direct probe results
    const directResult = profile.probeResults[probeName as keyof typeof profile.probeResults];
    if (directResult && typeof directResult === 'object' && 'passed' in directResult) {
      return directResult as ProbeResult;
    }
    
    // Check reasoning probes
    if (profile.probeResults.reasoningProbes) {
      const reasoningResult = profile.probeResults.reasoningProbes[probeName];
      if (reasoningResult) return reasoningResult;
    }
    
    return null;
  };

  const getArrayProbes = (arrayKey: string): Array<{ name: string; passed: boolean; score: number }> => {
    if (!profile.probeResults) return [];
    const probes = profile.probeResults[arrayKey as keyof typeof profile.probeResults];
    if (Array.isArray(probes)) return probes;
    return [];
  };

  return (
    <div className="space-y-4">
      {/* Tool Capabilities Grid */}
      {profile.capabilities && Object.keys(profile.capabilities).length > 0 && (
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h3 className="text-white font-medium mb-4">Tool Capabilities</h3>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(profile.capabilities).map(([tool, cap]) => (
              <div 
                key={tool}
                className={`px-3 py-2 rounded text-sm ${
                  cap.supported && cap.score >= 80 
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                  cap.supported && cap.score >= 50 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                  cap.supported 
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                    'bg-[#1a1a1a] text-gray-500 border border-[#2d2d2d]'
                }`}
                title={`Score: ${cap.score}%${cap.nativeAliases?.length ? `\nAliases: ${cap.nativeAliases.join(', ')}` : ''}`}
              >
                <span className="font-mono text-xs">{tool}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Probe Results by Category */}
      {CAPABILITY_SECTIONS.map(section => {
        const isExpanded = expandedSection === section.id;
        const isRunning = testProgress.isRunning && 
                         testProgress.currentCategory?.includes(section.id.charAt(0));
        
        // Get probes for this section
        let probeItems: Array<{ name: string; passed: boolean; score: number; details?: string }> = [];
        
        if (section.probes) {
          probeItems = section.probes.map(probeName => {
            const result = getProbeResult(probeName);
            return {
              name: formatProbeName(probeName),
              passed: result?.passed ?? false,
              score: result?.score ?? 0,
              details: result?.details
            };
          });
        } else if (section.arrayKey) {
          probeItems = getArrayProbes(section.arrayKey).map(p => ({
            name: p.name,
            passed: p.passed,
            score: p.score
          }));
        }
        
        const hasResults = probeItems.some(p => p.score > 0);
        const avgScore = hasResults 
          ? Math.round(probeItems.reduce((sum, p) => sum + p.score, 0) / probeItems.length)
          : 0;
        
        return (
          <div 
            key={section.id}
            className={`bg-[#161616] rounded-lg border overflow-hidden ${
              isRunning ? 'border-purple-500/50' : 'border-[#2d2d2d]'
            }`}
          >
            <button
              onClick={() => setExpandedSection(isExpanded ? null : section.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1a1a1a] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{section.icon}</span>
                <span className="text-white font-medium">{section.name}</span>
                {isRunning && (
                  <span className="animate-spin text-purple-400">⚙️</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {hasResults && (
                  <>
                    <div className="w-24 h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          avgScore >= 80 ? 'bg-green-500' :
                          avgScore >= 60 ? 'bg-amber-500' :
                          avgScore >= 40 ? 'bg-orange-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${avgScore}%` }}
                      />
                    </div>
                    <span className="text-gray-400 font-mono text-sm w-10 text-right">
                      {avgScore}%
                    </span>
                  </>
                )}
                <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </button>
            
            {isExpanded && (
              <div className="px-4 py-3 border-t border-[#2d2d2d] bg-[#0f0f0f]">
                {probeItems.length > 0 ? (
                  <div className="space-y-3">
                    {probeItems.map((probe, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={probe.passed ? 'text-green-400' : probe.score > 0 ? 'text-amber-400' : 'text-gray-600'}>
                            {probe.passed ? '✓' : probe.score > 0 ? '◐' : '○'}
                          </span>
                          <span className="text-gray-300 text-sm">{probe.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-mono ${
                            probe.score >= 80 ? 'text-green-400' :
                            probe.score >= 60 ? 'text-amber-400' :
                            probe.score > 0 ? 'text-orange-400' :
                            'text-gray-600'
                          }`}>
                            {probe.score}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No results yet. Run tests to evaluate this category.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Helper to format probe names
const formatProbeName = (name: string): string => {
  return name
    .replace(/Test$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, c => c.toUpperCase());
};

export default CapabilitiesTab;

