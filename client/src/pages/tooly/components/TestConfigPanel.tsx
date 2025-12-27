import React, { useState, useEffect } from 'react';

interface TestConfig {
  timeouts: {
    soft: number; // seconds
    hard: number; // seconds
  };
  testCategories: {
    qualifying: boolean;
    tool: boolean;
    rag: boolean;
    reasoning: boolean;
    intent: boolean;
    browser: boolean;
    multi_turn: boolean;
    boundary: boolean;
    fault_injection: boolean;
  };
  contextFill: {
    levels: number[]; // [25, 50, 75, 90]
    qualityThreshold: number; // 70
  };
  multiTurn: {
    maxTurns: number; // 3, 5, or 10
  };
  runCount: number; // 1-3 for flakiness detection
}

const DEFAULT_CONFIG: TestConfig = {
  timeouts: {
    soft: 10,
    hard: 60,
  },
  testCategories: {
    qualifying: true,
    tool: true,
    rag: true,
    reasoning: true,
    intent: true,
    browser: true,
    multi_turn: true,
    boundary: true,
    fault_injection: true,
  },
  contextFill: {
    levels: [25, 50, 75, 90],
    qualityThreshold: 70,
  },
  multiTurn: {
    maxTurns: 3,
  },
  runCount: 1,
};

interface TestConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: TestConfig) => void;
  initialConfig?: TestConfig;
}

export const TestConfigPanel: React.FC<TestConfigPanelProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig,
}) => {
  const [config, setConfig] = useState<TestConfig>(initialConfig || DEFAULT_CONFIG);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  if (!isOpen) return null;

  const handleCategoryToggle = (category: keyof TestConfig['testCategories']) => {
    // Don't allow disabling qualifying tests
    if (category === 'qualifying') return;
    
    setConfig(prev => ({
      ...prev,
      testCategories: {
        ...prev.testCategories,
        [category]: !prev.testCategories[category],
      },
    }));
  };

  const handleContextLevelToggle = (level: number) => {
    setConfig(prev => {
      const levels = prev.contextFill.levels.includes(level)
        ? prev.contextFill.levels.filter(l => l !== level)
        : [...prev.contextFill.levels, level].sort((a, b) => a - b);
      return {
        ...prev,
        contextFill: { ...prev.contextFill, levels },
      };
    });
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const categoryLabels: Record<keyof TestConfig['testCategories'], { name: string; icon: string }> = {
    qualifying: { name: 'Qualifying Gate', icon: '🔒' },
    tool: { name: 'Tool Calling', icon: '🔧' },
    rag: { name: 'RAG Usage', icon: '📚' },
    reasoning: { name: 'Reasoning', icon: '🧠' },
    intent: { name: 'Intent Recognition', icon: '🎯' },
    browser: { name: 'Browser/Web', icon: '🌐' },
    multi_turn: { name: 'Multi-Turn', icon: '💬' },
    boundary: { name: 'Boundaries', icon: '🚧' },
    fault_injection: { name: 'Fault Injection', icon: '💥' },
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">⚙️</span> Test Configuration
            </h2>
            <p className="text-gray-400 text-sm mt-1">Configure test settings and categories</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <span className="text-gray-400 text-xl">✕</span>
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Timeout Settings */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>⏱️</span> Timeout Settings
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-2">Soft Timeout</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={config.timeouts.soft}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      timeouts: { ...prev.timeouts, soft: parseInt(e.target.value) }
                    }))}
                    className="flex-1"
                  />
                  <span className="text-white font-mono w-16">{config.timeouts.soft}s</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Flag as slow, continue test</p>
              </div>
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-2">Hard Timeout</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="30"
                    max="120"
                    value={config.timeouts.hard}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      timeouts: { ...prev.timeouts, hard: parseInt(e.target.value) }
                    }))}
                    className="flex-1"
                  />
                  <span className="text-white font-mono w-16">{config.timeouts.hard}s</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Kill test, mark as failed</p>
              </div>
            </div>
          </section>

          {/* Test Categories */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>📋</span> Test Categories
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(categoryLabels).map(([key, { name, icon }]) => {
                const isEnabled = config.testCategories[key as keyof TestConfig['testCategories']];
                const isQualifying = key === 'qualifying';
                return (
                  <button
                    key={key}
                    onClick={() => handleCategoryToggle(key as keyof TestConfig['testCategories'])}
                    disabled={isQualifying}
                    className={`p-3 rounded-xl border transition-all ${
                      isEnabled
                        ? 'bg-purple-500/20 border-purple-500/50 text-white'
                        : 'bg-gray-800/50 border-gray-700 text-gray-500'
                    } ${isQualifying ? 'opacity-70 cursor-not-allowed' : 'hover:border-purple-500/30'}`}
                  >
                    <span className="text-xl mr-2">{icon}</span>
                    <span className="text-sm">{name}</span>
                    {isQualifying && <span className="text-xs ml-1">(required)</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Context Fill Settings */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>📏</span> Context Fill Testing
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Fill Levels to Test</label>
                <div className="flex gap-2">
                  {[25, 50, 75, 90].map((level) => (
                    <button
                      key={level}
                      onClick={() => handleContextLevelToggle(level)}
                      className={`px-4 py-2 rounded-lg border transition-all ${
                        config.contextFill.levels.includes(level)
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : 'bg-gray-800/50 border-gray-700 text-gray-500'
                      }`}
                    >
                      {level}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-2">Quality Threshold</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="50"
                    max="90"
                    value={config.contextFill.qualityThreshold}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      contextFill: { ...prev.contextFill, qualityThreshold: parseInt(e.target.value) }
                    }))}
                    className="flex-1"
                  />
                  <span className="text-white font-mono w-16">{config.contextFill.qualityThreshold}%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Minimum acceptable quality score</p>
              </div>
            </div>
          </section>

          {/* Multi-Turn Settings */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>💬</span> Multi-Turn Settings
            </h3>
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <label className="block text-sm text-gray-400 mb-2">Max Turns per Test</label>
              <div className="flex gap-2">
                {[3, 5, 10].map((turns) => (
                  <button
                    key={turns}
                    onClick={() => setConfig(prev => ({
                      ...prev,
                      multiTurn: { maxTurns: turns }
                    }))}
                    className={`px-6 py-2 rounded-lg border transition-all ${
                      config.multiTurn.maxTurns === turns
                        ? 'bg-green-500/20 border-green-500/50 text-green-300'
                        : 'bg-gray-800/50 border-gray-700 text-gray-500'
                    }`}
                  >
                    {turns} turns
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Flakiness Detection */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>🎲</span> Flakiness Detection
            </h3>
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <label className="block text-sm text-gray-400 mb-2">Runs per Test</label>
              <div className="flex gap-2">
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    onClick={() => setConfig(prev => ({ ...prev, runCount: count }))}
                    className={`px-6 py-2 rounded-lg border transition-all ${
                      config.runCount === count
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                        : 'bg-gray-800/50 border-gray-700 text-gray-500'
                    }`}
                  >
                    {count}x
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {config.runCount === 1 && 'Single run - fastest but no flakiness detection'}
                {config.runCount === 2 && 'Double run - basic consistency check'}
                {config.runCount === 3 && 'Triple run - full flakiness detection with consistency %'}
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 p-4 flex justify-end gap-3">
          <button
            onClick={() => setConfig(DEFAULT_CONFIG)}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export type { TestConfig };

