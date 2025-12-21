import React from 'react';

interface SlowModelModalProps {
  showSlowModelPrompt: boolean;
  slowModelLatency: number;
  onCancel: () => void;
  onContinue: () => void;
}

export const SlowModelModal: React.FC<SlowModelModalProps> = ({
  showSlowModelPrompt,
  slowModelLatency,
  onCancel,
  onContinue,
}) => {
  if (!showSlowModelPrompt) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg p-6 max-w-md mx-4">
        <div className="text-center mb-4">
          <span className="text-4xl">🐢</span>
          <h3 className="text-lg font-semibold text-white mt-2">This Model is a Bit Slow</h3>
        </div>
        <p className="text-gray-400 text-sm mb-2">
          Initial latency test took <span className="text-yellow-400 font-medium">{(slowModelLatency / 1000).toFixed(1)}s</span> at 2K context.
        </p>
        <p className="text-gray-400 text-sm mb-4">
          Full testing may take a while. This is typical for larger models on consumer hardware.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 rounded-lg transition-colors"
          >
            Cancel Tests
          </button>
          <button
            onClick={onContinue}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

