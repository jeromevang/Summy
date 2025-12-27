/**
 * CapabilityMap Component
 * Visual display of native/learned/blocked capabilities for a model.
 */

import React from 'react';

interface CapabilityStatus {
  native: string[];
  learned: string[];
  blocked: string[];
  untested: string[];
  fallbackModel: string | null;
}

interface CapabilityMapProps {
  modelId: string;
  capabilities?: CapabilityStatus;
  loading?: boolean;
  compact?: boolean;
  onRefresh?: () => void;
}

const CAPABILITY_INFO: Record<string, { icon: string; label: string; description: string }> = {
  rag_query: { icon: '🔍', label: 'RAG Query', description: 'Semantic code search' },
  read_file: { icon: '📄', label: 'Read File', description: 'File reading' },
  write_file: { icon: '✏️', label: 'Write File', description: 'File writing' },
  search_files: { icon: '🔎', label: 'Search Files', description: 'Pattern search' },
  shell_exec: { icon: '💻', label: 'Shell Exec', description: 'Command execution' },
  web_search: { icon: '🌐', label: 'Web Search', description: 'Internet search' },
  browser_navigate: { icon: '🧭', label: 'Browser', description: 'Browser control' },
  multi_step: { icon: '📋', label: 'Multi-Step', description: 'Complex tasks' },
  reasoning: { icon: '🧠', label: 'Reasoning', description: 'Logical reasoning' },
  intent: { icon: '💭', label: 'Intent', description: 'Intent recognition' },
  format: { icon: '📝', label: 'Format', description: 'Tool call format' },
  param_extraction: { icon: '🎯', label: 'Params', description: 'Parameter extraction' },
  tool: { icon: '🔧', label: 'Tool Use', description: 'Tool selection' },
  rag: { icon: '🔍', label: 'RAG', description: 'RAG usage' },
  browser: { icon: '🌐', label: 'Browser', description: 'Browser tools' },
};

export default function CapabilityMap({ 
  modelId, 
  capabilities, 
  loading,
  compact = false,
  onRefresh 
}: CapabilityMapProps) {
  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="animate-pulse flex items-center justify-center h-24">
          <span className="text-gray-500">Loading capabilities...</span>
        </div>
      </div>
    );
  }

  if (!capabilities) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="text-center text-gray-500 py-4">
          <p>No capability data available</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="mt-2 px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 rounded"
            >
              Run Smoke Test
            </button>
          )}
        </div>
      </div>
    );
  }

  const { native, learned, blocked, untested, fallbackModel } = capabilities;

  const getCapabilityInfo = (cap: string) => {
    return CAPABILITY_INFO[cap] || { icon: '❓', label: cap, description: cap };
  };

  if (compact) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-green-400">●</span>
          <span className="text-gray-400">{native.length} native</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-blue-400">●</span>
          <span className="text-gray-400">{learned.length} learned</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-400">●</span>
          <span className="text-gray-400">{blocked.length} blocked</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          🗺️ Capability Map
        </h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-sm text-purple-400 hover:text-purple-300"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span>Native</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Learned</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span>Blocked</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-600" />
          <span>Untested</span>
        </div>
      </div>

      {/* Native Capabilities */}
      {native.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium text-green-400 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Native Strengths ({native.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {native.map(cap => {
              const info = getCapabilityInfo(cap);
              return (
                <div
                  key={cap}
                  className="px-3 py-1.5 bg-green-900/30 border border-green-500/30 rounded-lg text-green-300 text-sm flex items-center gap-1"
                  title={info.description}
                >
                  <span>{info.icon}</span>
                  <span>{info.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Learned Capabilities */}
      {learned.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Learned (via Prosthetic) ({learned.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {learned.map(cap => {
              const info = getCapabilityInfo(cap);
              return (
                <div
                  key={cap}
                  className="px-3 py-1.5 bg-blue-900/30 border border-blue-500/30 rounded-lg text-blue-300 text-sm flex items-center gap-1"
                  title={info.description}
                >
                  <span>{info.icon}</span>
                  <span>{info.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Blocked Capabilities */}
      {blocked.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium text-red-400 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Blocked (Route to Fallback) ({blocked.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {blocked.map(cap => {
              const info = getCapabilityInfo(cap);
              return (
                <div
                  key={cap}
                  className="px-3 py-1.5 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-center gap-1"
                  title={info.description}
                >
                  <span>{info.icon}</span>
                  <span>{info.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Untested Capabilities */}
      {untested.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-600" />
            Untested ({untested.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {untested.map(cap => {
              const info = getCapabilityInfo(cap);
              return (
                <div
                  key={cap}
                  className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 text-sm flex items-center gap-1"
                  title={info.description}
                >
                  <span>{info.icon}</span>
                  <span>{info.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback Model */}
      {fallbackModel && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="text-sm text-gray-400">
            <span className="text-gray-500">Fallback Model:</span>{' '}
            <span className="text-purple-400">{fallbackModel}</span>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-gray-800 grid grid-cols-4 gap-4 text-center text-sm">
        <div>
          <div className="text-2xl font-bold text-green-400">{native.length}</div>
          <div className="text-gray-500">Native</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-400">{learned.length}</div>
          <div className="text-gray-500">Learned</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-400">{blocked.length}</div>
          <div className="text-gray-500">Blocked</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-400">{untested.length}</div>
          <div className="text-gray-500">Untested</div>
        </div>
      </div>
    </div>
  );
}

