/**
 * FailurePatternCard
 * Displays a failure pattern with expandable details, severity indicator,
 * and quick actions for analysis.
 */

import React, { useState } from 'react';

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  category: string;
  count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  firstSeen: string;
  lastSeen: string;
  affectedModels?: string[];
  suggestedAction?: string;
}

interface FailurePatternCardProps {
  pattern: FailurePattern;
  isSelected?: boolean;
  onSelect?: (id: string | null) => void;
  onAnalyze?: (pattern: FailurePattern) => void;
}

export function FailurePatternCard({ pattern, isSelected, onSelect, onAnalyze }: FailurePatternCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getSeverityStyles = () => {
    switch (pattern.severity) {
      case 'critical':
        return {
          border: 'border-red-500/60',
          bg: 'bg-red-900/20',
          badge: 'bg-red-600 text-white',
          glow: 'shadow-red-500/20 shadow-lg'
        };
      case 'high':
        return {
          border: 'border-orange-500/60',
          bg: 'bg-orange-900/20',
          badge: 'bg-orange-600 text-white',
          glow: ''
        };
      case 'medium':
        return {
          border: 'border-yellow-500/50',
          bg: 'bg-yellow-900/10',
          badge: 'bg-yellow-600 text-black',
          glow: ''
        };
      default:
        return {
          border: 'border-gray-600',
          bg: 'bg-gray-800/50',
          badge: 'bg-gray-600 text-white',
          glow: ''
        };
    }
  };

  const getCategoryIcon = () => {
    switch (pattern.category) {
      case 'tool': return '🔧';
      case 'rag': return '🔍';
      case 'reasoning': return '🧠';
      case 'intent': return '💭';
      case 'browser': return '🌐';
      case 'timeout': return '⏱️';
      case 'hallucination': return '👻';
      default: return '❓';
    }
  };

  const styles = getSeverityStyles();
  const isExpanded = expanded || isSelected;

  const timeSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div
      className={`rounded-lg border transition-all cursor-pointer ${styles.border} ${styles.bg} ${styles.glow} ${
        isSelected ? 'ring-2 ring-purple-500' : ''
      }`}
      onClick={() => {
        setExpanded(!expanded);
        onSelect?.(isSelected ? null : pattern.id);
      }}
    >
      {/* Header */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{getCategoryIcon()}</span>
            <div>
              <h3 className="font-medium text-white">{pattern.name}</h3>
              <span className="text-xs text-gray-400">{pattern.category}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-bold ${styles.badge}`}>
              {pattern.count}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${styles.badge}`}>
              {pattern.severity}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-700/50 pt-3">
          <p className="text-sm text-gray-300">{pattern.description}</p>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">First seen:</span>
              <span className="text-gray-300 ml-1">{timeSince(pattern.firstSeen)}</span>
            </div>
            <div>
              <span className="text-gray-500">Last seen:</span>
              <span className="text-gray-300 ml-1">{timeSince(pattern.lastSeen)}</span>
            </div>
          </div>

          {pattern.affectedModels && pattern.affectedModels.length > 0 && (
            <div>
              <span className="text-xs text-gray-500">Affected models:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {pattern.affectedModels.slice(0, 3).map(model => (
                  <span key={model} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                    {model.split('/').pop()}
                  </span>
                ))}
                {pattern.affectedModels.length > 3 && (
                  <span className="text-xs text-gray-500">
                    +{pattern.affectedModels.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {pattern.suggestedAction && (
            <div className="p-2 bg-purple-900/30 rounded border border-purple-500/30">
              <span className="text-xs text-purple-400">💡 Suggested:</span>
              <p className="text-xs text-gray-300 mt-1">{pattern.suggestedAction}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze?.(pattern);
              }}
              className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium transition-colors"
            >
              🔬 Analyze
            </button>
            <button
              onClick={(e) => e.stopPropagation()}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors"
            >
              👁️ View Failures
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FailurePatternCard;

