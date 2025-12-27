/**
 * ProstheticReview Modal
 * Displays controller analysis results and allows approval/rejection
 * of suggested prosthetics and test cases.
 */

import React, { useState } from 'react';

interface SuggestedProsthetic {
  level: number;
  prompt: string;
  targetCategories: string[];
}

interface TestCase {
  id: string;
  prompt: string;
  expectedTool?: string;
  expectedBehavior: string;
}

interface ControllerAnalysis {
  diagnosis: string;
  rootCause: string;
  suggestedProsthetic: SuggestedProsthetic;
  testCases: TestCase[];
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  affectedPatterns: string[];
}

interface ProstheticReviewProps {
  analysis: ControllerAnalysis;
  onApprove: (modelId: string, modifications?: Partial<SuggestedProsthetic>) => void;
  onReject: (reason: string) => void;
  onClose: () => void;
  availableModels?: string[];
}

export function ProstheticReview({ analysis, onApprove, onReject, onClose, availableModels = [] }: ProstheticReviewProps) {
  const [selectedModel, setSelectedModel] = useState('');
  const [editedPrompt, setEditedPrompt] = useState(analysis.suggestedProsthetic.prompt);
  const [selectedLevel, setSelectedLevel] = useState(analysis.suggestedProsthetic.level);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [testFirst, setTestFirst] = useState(true);

  const getPriorityStyles = () => {
    switch (analysis.priority) {
      case 'critical':
        return 'bg-red-900/50 border-red-500 text-red-300';
      case 'high':
        return 'bg-orange-900/50 border-orange-500 text-orange-300';
      case 'medium':
        return 'bg-yellow-900/50 border-yellow-500 text-yellow-300';
      default:
        return 'bg-blue-900/50 border-blue-500 text-blue-300';
    }
  };

  const getLevelDescription = (level: number) => {
    switch (level) {
      case 1: return 'System prefix (subtle)';
      case 2: return 'Category-specific (moderate)';
      case 3: return 'Aggressive correction';
      default: return 'Unknown level';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔬</span>
            <div>
              <h2 className="text-lg font-semibold text-white">Prosthetic Review</h2>
              <p className="text-sm text-gray-400">Review and approve the controller's suggestion</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-4 space-y-4">
          {/* Priority Badge */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getPriorityStyles()}`}>
              {analysis.priority} priority
            </span>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Confidence:</span>
              <div className="w-32 h-2 bg-gray-700 rounded-full">
                <div 
                  className={`h-full rounded-full ${
                    analysis.confidence >= 80 ? 'bg-green-500' :
                    analysis.confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${analysis.confidence}%` }}
                />
              </div>
              <span className="text-sm text-gray-300">{analysis.confidence}%</span>
            </div>
          </div>

          {/* Diagnosis */}
          <div className="p-3 bg-gray-800 rounded-lg">
            <h3 className="text-sm font-medium text-purple-400 mb-2">📋 Diagnosis</h3>
            <p className="text-gray-300 text-sm">{analysis.diagnosis}</p>
          </div>

          {/* Root Cause */}
          <div className="p-3 bg-gray-800 rounded-lg">
            <h3 className="text-sm font-medium text-orange-400 mb-2">🎯 Root Cause</h3>
            <p className="text-gray-300 text-sm">{analysis.rootCause}</p>
          </div>

          {/* Affected Patterns */}
          {analysis.affectedPatterns && analysis.affectedPatterns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Affects:</span>
              {analysis.affectedPatterns.map(pattern => (
                <span key={pattern} className="px-2 py-0.5 bg-red-900/30 border border-red-500/30 rounded text-xs text-red-300">
                  {pattern}
                </span>
              ))}
            </div>
          )}

          {/* Suggested Prosthetic */}
          <div className="p-4 bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-purple-300">💉 Suggested Prosthetic</h3>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(Number(e.target.value))}
                className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-300"
              >
                <option value={1}>Level 1 - {getLevelDescription(1)}</option>
                <option value={2}>Level 2 - {getLevelDescription(2)}</option>
                <option value={3}>Level 3 - {getLevelDescription(3)}</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="text-xs text-gray-400 mb-1 block">Target Categories:</label>
              <div className="flex flex-wrap gap-1">
                {analysis.suggestedProsthetic.targetCategories.map(cat => (
                  <span key={cat} className="px-2 py-0.5 bg-purple-800/50 rounded text-xs text-purple-300">
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Prompt (editable):</label>
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={6}
                className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 font-mono resize-none focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Test Cases */}
          {analysis.testCases && analysis.testCases.length > 0 && (
            <div className="p-3 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-green-400 mb-2">🧪 Generated Test Cases</h3>
              <div className="space-y-2">
                {analysis.testCases.map((tc, i) => (
                  <div key={tc.id} className="p-2 bg-gray-900 rounded border border-gray-700">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-500 font-mono">#{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-300">{tc.prompt}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {tc.expectedTool && (
                            <span className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs">
                              → {tc.expectedTool}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{tc.expectedBehavior}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model Selection */}
          <div className="p-3 bg-gray-800 rounded-lg">
            <h3 className="text-sm font-medium text-blue-400 mb-2">🤖 Apply to Model</h3>
            {availableModels.length > 0 ? (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-sm text-gray-300"
              >
                <option value="">Select a model...</option>
                {availableModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                placeholder="Enter model ID (e.g., qwen/qwen3-4b)"
                className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-sm text-gray-300"
              />
            )}
            
            <label className="flex items-center gap-2 mt-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={testFirst}
                onChange={(e) => setTestFirst(e.target.checked)}
                className="rounded bg-gray-700 border-gray-600"
              />
              Run test cases before applying prosthetic
            </label>
          </div>

          {/* Reject Form */}
          {showRejectForm && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <h3 className="text-sm font-medium text-red-400 mb-2">Rejection Reason</h3>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this suggestion not appropriate?"
                rows={3}
                className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-sm text-gray-300 resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={() => {
              if (showRejectForm && rejectReason) {
                onReject(rejectReason);
              } else {
                setShowRejectForm(true);
              }
            }}
            className="px-4 py-2 bg-red-900/50 hover:bg-red-900 border border-red-500/50 text-red-300 rounded-lg text-sm font-medium transition-colors"
          >
            {showRejectForm ? 'Confirm Reject' : '✗ Reject'}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!selectedModel) {
                  alert('Please select or enter a model ID');
                  return;
                }
                onApprove(selectedModel, {
                  prompt: editedPrompt,
                  level: selectedLevel
                });
              }}
              disabled={!selectedModel}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              ✓ Approve & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProstheticReview;

