import React from 'react';
import { CompressionVersions } from '../types';

interface CompressionStepperProps {
  value: 0 | 1 | 2 | 3;
  onChange: (v: 0 | 1 | 2 | 3) => void;
  versions: CompressionVersions | null;
  disabled?: boolean;
}

export const CompressionStepper: React.FC<CompressionStepperProps> = ({ 
  value, 
  onChange, 
  versions,
  disabled 
}) => {
  const steps = [
    { value: 0, label: 'None', description: 'Original messages', key: 'none' },
    { value: 1, label: 'Light', description: 'Summarize text only', key: 'light' },
    { value: 2, label: 'Medium', description: 'Truncate tool outputs', key: 'medium' },
    { value: 3, label: 'Aggressive', description: 'Full compression', key: 'aggressive' },
  ];

  const getStats = (key: string) => {
    if (!versions) return null;
    return versions[key as keyof CompressionVersions]?.stats;
  };

  return (
    <div className="w-full">
      <div className="flex items-stretch">
        {steps.map((step, idx) => {
          const stats = getStats(step.key);
          const isActive = value === step.value;
          const isPast = value > step.value;
          const isFirst = idx === 0;
          const isLast = idx === steps.length - 1;
          
          return (
            <button
              key={step.value}
              onClick={() => !disabled && onChange(step.value as 0 | 1 | 2 | 3)}
              disabled={disabled}
              className={`
                relative flex-1 flex items-center gap-3 px-4 py-3
                border-y border-r first:border-l first:rounded-l-lg last:rounded-r-lg
                transition-all duration-200
                ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                ${isActive 
                  ? 'bg-[#1a1a2e] border-purple-500/50' 
                  : 'bg-[#0d0d12] border-[#2d2d3d] hover:bg-[#151520]'
                }
                ${isFirst ? 'rounded-l-lg' : ''}
                ${isLast ? 'rounded-r-lg' : ''}
              `}
            >
              <div className={`
                flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                font-medium text-sm transition-all duration-200
                ${isPast 
                  ? 'bg-purple-500 text-white' 
                  : isActive 
                    ? 'border-2 border-purple-500 text-purple-400 bg-transparent' 
                    : 'border border-[#3d3d4d] text-gray-500 bg-transparent'
                }
              `}>
                {isPast ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{String(idx).padStart(2, '0')}</span>
                )}
              </div>
              
              <div className="flex flex-col items-start min-w-0">
                <span className={`text-sm font-medium truncate ${
                  isActive ? 'text-white' : isPast ? 'text-purple-300' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
                <span className="text-xs text-gray-500 truncate">
                  {stats && step.value > 0 
                    ? `${Math.round(stats.ratio * 100)}% saved` 
                    : step.description
                  }
                </span>
              </div>
              
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
              )}
              
              {!isLast && (
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                  <div className={`w-4 h-4 rotate-45 border-t border-r ${
                    isActive || isPast ? 'border-purple-500/50 bg-[#1a1a2e]' : 'border-[#2d2d3d] bg-[#0d0d12]'
                  }`} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
