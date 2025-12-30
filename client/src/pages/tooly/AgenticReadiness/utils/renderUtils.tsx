import React from 'react';
import { THRESHOLD } from '../constants';

export const renderProgressBar = (score: number, threshold = THRESHOLD) => {
  const passed = score >= threshold;
  return (
    <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`absolute h-full transition-all duration-500 \${
          passed ? 'bg-green-500' : score >= threshold * 0.8 ? 'bg-yellow-500' : 'bg-red-500'
        }`}
        style={{ width: `\${Math.min(score, 100)}%` }}
      />
      <div className="absolute h-full w-0.5 bg-white/50" style={{ left: `\${threshold}%` }} />
    </div>
  );
};
