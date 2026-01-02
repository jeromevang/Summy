import React, { useState, useEffect } from 'react';

interface MCPToolsConfigProps {
  onSave?: () => void;
}

type Toolset = 'minimal' | 'standard' | 'full' | 'custom';
type ToolCategory = 'file_ops' | 'git' | 'npm' | 'browser' | 'rag' | 'refactor' | 'memory' | 'system';

interface MCPConfig {
  toolset: Toolset;
  customCategories: ToolCategory[];
}

const TOOLSET_DESCRIPTIONS: Record<Toolset, { name: string; tokens: number; description: string }> = {
  minimal: {
    name: 'Minimal',
    tokens: 8000,
    description: 'RAG + Memory only - For cloud APIs with built-in tools'
  },
  standard: {
    name: 'Standard (Recommended)',
    tokens: 15000,
    description: 'Balanced toolset for most users'
  },
  full: {
    name: 'Full',
    tokens: 54000,
    description: 'All tools - For local models or full control'
  },
  custom: {
    name: 'Custom',
    tokens: 0,
    description: 'Choose individual tool categories'
  }
};

const TOOL_CATEGORIES: Array<{ key: ToolCategory; label: string; description: string }> = [
  { key: 'file_ops', label: 'File Operations', description: 'Read, write, edit, delete files' },
  { key: 'git', label: 'Git Tools', description: 'Version control operations' },
  { key: 'npm', label: 'NPM Tools', description: 'Package management' },
  { key: 'browser', label: 'Browser Automation', description: 'Playwright-based automation' },
  { key: 'rag', label: 'RAG Search', description: 'Semantic code search' },
  { key: 'refactor', label: 'Refactor Tools', description: 'Code refactoring utilities' },
  { key: 'memory', label: 'Memory System', description: 'Persistent memory storage' },
  { key: 'system', label: 'System Tools', description: 'Shell execution, processes' }
];

export const MCPToolsConfig: React.FC<MCPToolsConfigProps> = ({ onSave }) => {
  const [toolset, setToolset] = useState<Toolset>('standard');
  const [customCategories, setCustomCategories] = useState<ToolCategory[]>([]);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Load current config on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.mcp) {
          setToolset(data.mcp.toolset || 'standard');
          setCustomCategories(data.mcp.customCategories || []);
        }
      })
      .catch(err => console.error('Failed to load MCP config:', err));
  }, []);

  const handleToolsetChange = async (newToolset: Toolset) => {
    setToolset(newToolset);
    setNeedsRestart(true);

    // Save immediately
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcp: {
            toolset: newToolset,
            customCategories: newToolset === 'custom' ? customCategories : []
          }
        })
      });

      if (!response.ok) throw new Error('Failed to save settings');
      onSave?.();
    } catch (error) {
      console.error('Failed to save MCP config:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCategoryToggle = async (category: ToolCategory) => {
    const updated = customCategories.includes(category)
      ? customCategories.filter(c => c !== category)
      : [...customCategories, category];

    setCustomCategories(updated);
    setNeedsRestart(true);

    // Save immediately
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcp: {
            toolset: 'custom',
            customCategories: updated
          }
        })
      });

      if (!response.ok) throw new Error('Failed to save settings');
      onSave?.();
    } catch (error) {
      console.error('Failed to save MCP config:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      const response = await fetch('/api/mcp/restart', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to restart MCP server');

      setNeedsRestart(false);
      alert('MCP server restarted successfully!');
    } catch (error) {
      console.error('Failed to restart MCP:', error);
      alert('Failed to restart MCP server. Check console for details.');
    } finally {
      setRestarting(false);
    }
  };

  const currentTokens = toolset === 'custom'
    ? customCategories.reduce((sum, cat) => {
        const estimates: Record<ToolCategory, number> = {
          file_ops: 12000, git: 10000, npm: 4000, browser: 8000,
          rag: 5000, refactor: 2000, memory: 3000, system: 4000
        };
        return sum + estimates[cat];
      }, 0)
    : TOOLSET_DESCRIPTIONS[toolset].tokens;

  return (
    <div className="border border-[#2d2d2d] rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-medium text-white">🛠️ MCP Tools Configuration</h4>
        {needsRestart && (
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {restarting ? 'Restarting...' : '↻ Restart MCP Server'}
          </button>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Toolset Preset</label>
        <select
          value={toolset}
          onChange={(e) => handleToolsetChange(e.target.value as Toolset)}
          disabled={saving}
          className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg p-3 text-white focus:outline-none focus:border-purple-500"
        >
          {Object.entries(TOOLSET_DESCRIPTIONS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.name} - ~{info.tokens.toLocaleString()} tokens
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">{TOOLSET_DESCRIPTIONS[toolset].description}</p>
      </div>

      <div className="mb-4 p-3 bg-[#0d0d0d] rounded-lg border border-[#3d3d3d]">
        <div className="text-sm text-gray-400">Current Context Usage</div>
        <div className="text-2xl font-bold text-white">
          ~{currentTokens.toLocaleString()} <span className="text-base text-gray-400">tokens</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {currentTokens < 10000 && '🟢 Excellent - Minimal context footprint'}
          {currentTokens >= 10000 && currentTokens < 30000 && '🟡 Good - Balanced performance'}
          {currentTokens >= 30000 && '🔴 High - Consider reducing for better performance'}
        </div>
      </div>

      {toolset === 'custom' && (
        <div className="mt-4">
          <label className="block text-sm text-gray-400 mb-2">Select Tool Categories</label>
          <div className="grid grid-cols-2 gap-2">
            {TOOL_CATEGORIES.map(cat => (
              <label
                key={cat.key}
                className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                  customCategories.includes(cat.key)
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-[#3d3d3d] hover:border-[#4d4d4d]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={customCategories.includes(cat.key)}
                  onChange={() => handleCategoryToggle(cat.key)}
                  disabled={saving}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-white">{cat.label}</div>
                  <div className="text-xs text-gray-500">{cat.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {saving && <div className="text-xs text-gray-400 mt-2">Saving...</div>}
    </div>
  );
};
