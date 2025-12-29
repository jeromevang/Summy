/**
 * Configuration Tab Component
 * Tools, context budget, system prompt template, RAG settings
 */

import React, { useState } from 'react';

interface ModelProfile {
  modelId: string;
  optimalSettings?: {
    toolFormat?: 'openai' | 'xml';
    maxToolsPerCall?: number;
    descriptionStyle?: 'verbose' | 'concise';
    systemPromptTemplate?: string;
    contextBudget?: {
      total?: number;
      systemPrompt?: number;
      toolSchemas?: number;
      memory?: number;
      ragResults?: number;
      history?: number;
      reserve?: number;
    };
    ragSettings?: {
      chunkSize?: number;
      chunkOverlap?: number;
      resultCount?: number;
      includeSummaries?: boolean;
      includeGraph?: boolean;
    };
  };
  systemPrompt?: string;
}

interface ConfigurationTabProps {
  profile: ModelProfile;
  isTestRunning: boolean;
  onUpdate: () => void;
}

const TOOL_TIERS = {
  essential: {
    name: 'Essential (15 tools)',
    description: 'Core tools for basic coding tasks',
    tools: ['rag_query', 'read_file', 'write_file', 'edit_file', 'list_directory', 'search_files', 'git_status', 'git_diff', 'git_commit']
  },
  standard: {
    name: 'Standard (35 tools)',
    description: 'Full development toolkit',
    tools: ['...essential', 'git_*', 'run_python', 'run_node', 'memory_*']
  },
  full: {
    name: 'Full (73 tools)',
    description: 'All available tools including browser and HTTP',
    tools: ['...standard', 'browser_*', 'npm_*', 'http_*']
  }
};

export const ConfigurationTab: React.FC<ConfigurationTabProps> = ({
  profile,
  isTestRunning,
  onUpdate
}) => {
  const [activeSection, setActiveSection] = useState<string>('tools');
  const [isSaving, setIsSaving] = useState(false);
  
  // Local state for editable fields
  const [toolTier, setToolTier] = useState<'essential' | 'standard' | 'full'>('standard');
  const [toolFormat, setToolFormat] = useState(profile.optimalSettings?.toolFormat || 'openai');
  const [maxTools, setMaxTools] = useState(profile.optimalSettings?.maxToolsPerCall || 10);
  const [systemPromptTemplate, setSystemPromptTemplate] = useState(
    profile.optimalSettings?.systemPromptTemplate || 'agentic-coding'
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch(`http://localhost:3001/api/tooly/models/${encodeURIComponent(profile.modelId)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolFormat,
          maxToolsPerCall: maxTools,
          toolTier,
          systemPromptTemplate
        })
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateOptimal = async () => {
    setIsSaving(true);
    try {
      await fetch(`http://localhost:3001/api/tooly/models/${encodeURIComponent(profile.modelId)}/config/generate`, {
        method: 'POST'
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to generate config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const settings = profile.optimalSettings || {};
  const contextBudget = settings.contextBudget || {};
  const ragSettings = settings.ragSettings || {};

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex border-b border-[#2d2d2d]">
        {['tools', 'context', 'rag', 'prompt'].map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeSection === section 
                ? 'text-purple-400 border-b-2 border-purple-500' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {section === 'tools' ? '🔧 Tools' :
             section === 'context' ? '📊 Context Budget' :
             section === 'rag' ? '🔍 RAG Settings' :
             '📝 System Prompt'}
          </button>
        ))}
      </div>

      {/* Tools Section */}
      {activeSection === 'tools' && (
        <div className="space-y-6">
          {/* Tool Format */}
          <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
            <h4 className="text-white font-medium mb-3">Tool Call Format</h4>
            <div className="flex gap-4">
              {(['openai', 'xml'] as const).map(format => (
                <label 
                  key={format}
                  className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    toolFormat === format 
                      ? 'border-purple-500 bg-purple-500/10' 
                      : 'border-[#2d2d2d] hover:border-purple-500/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="toolFormat"
                    value={format}
                    checked={toolFormat === format}
                    onChange={() => setToolFormat(format)}
                    className="sr-only"
                    disabled={isTestRunning}
                  />
                  <span className="text-white font-medium">
                    {format === 'openai' ? 'OpenAI Format' : 'XML Format'}
                  </span>
                  <p className="text-gray-500 text-sm mt-1">
                    {format === 'openai' 
                      ? 'Standard JSON tool calls' 
                      : 'XML-style for legacy models'}
                  </p>
                </label>
              ))}
            </div>
          </div>

          {/* Tool Tier */}
          <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
            <h4 className="text-white font-medium mb-3">Tool Set</h4>
            <div className="space-y-3">
              {(Object.entries(TOOL_TIERS) as [keyof typeof TOOL_TIERS, typeof TOOL_TIERS[keyof typeof TOOL_TIERS]][]).map(([tier, config]) => (
                <label 
                  key={tier}
                  className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                    toolTier === tier 
                      ? 'border-purple-500 bg-purple-500/10' 
                      : 'border-[#2d2d2d] hover:border-purple-500/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="toolTier"
                    value={tier}
                    checked={toolTier === tier}
                    onChange={() => setToolTier(tier)}
                    className="sr-only"
                    disabled={isTestRunning}
                  />
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-white font-medium">{config.name}</span>
                      <p className="text-gray-500 text-sm">{config.description}</p>
                    </div>
                    {toolTier === tier && (
                      <span className="text-purple-400">✓</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Max Tools */}
          <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
            <h4 className="text-white font-medium mb-3">Max Tools Per Call</h4>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="20"
                value={maxTools}
                onChange={(e) => setMaxTools(parseInt(e.target.value))}
                className="flex-1 h-2 bg-[#2d2d2d] rounded-lg appearance-none cursor-pointer"
                disabled={isTestRunning}
              />
              <span className="text-white font-mono w-12 text-right">{maxTools}</span>
            </div>
            <p className="text-gray-500 text-sm mt-2">
              Some models perform better with fewer tools per call
            </p>
          </div>
        </div>
      )}

      {/* Context Budget Section */}
      {activeSection === 'context' && (
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h4 className="text-white font-medium mb-4">Context Token Budget</h4>
          <div className="space-y-4">
            <BudgetBar 
              label="System Prompt" 
              value={contextBudget.systemPrompt || 2000} 
              total={contextBudget.total || 32000}
              color="bg-purple-500"
            />
            <BudgetBar 
              label="Tool Schemas" 
              value={contextBudget.toolSchemas || 4000} 
              total={contextBudget.total || 32000}
              color="bg-blue-500"
            />
            <BudgetBar 
              label="Memory" 
              value={contextBudget.memory || 1000} 
              total={contextBudget.total || 32000}
              color="bg-green-500"
            />
            <BudgetBar 
              label="RAG Results" 
              value={contextBudget.ragResults || 8000} 
              total={contextBudget.total || 32000}
              color="bg-amber-500"
            />
            <BudgetBar 
              label="History" 
              value={contextBudget.history || 12000} 
              total={contextBudget.total || 32000}
              color="bg-cyan-500"
            />
            <BudgetBar 
              label="Reserve" 
              value={contextBudget.reserve || 5000} 
              total={contextBudget.total || 32000}
              color="bg-gray-500"
            />
            <div className="pt-3 border-t border-[#2d2d2d]">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total Budget</span>
                <span className="text-white font-mono">
                  {(contextBudget.total || 32000).toLocaleString()} tokens
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RAG Settings Section */}
      {activeSection === 'rag' && (
        <div className="space-y-4">
          <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
            <h4 className="text-white font-medium mb-4">RAG Configuration</h4>
            <div className="grid grid-cols-2 gap-4">
              <SettingItem 
                label="Chunk Size" 
                value={`${ragSettings.chunkSize || 1000} tokens`} 
              />
              <SettingItem 
                label="Chunk Overlap" 
                value={`${ragSettings.chunkOverlap || 200} tokens`} 
              />
              <SettingItem 
                label="Result Count" 
                value={`${ragSettings.resultCount || 5} chunks`} 
              />
              <SettingItem 
                label="Include Summaries" 
                value={ragSettings.includeSummaries ? 'Yes' : 'No'} 
              />
            </div>
          </div>
        </div>
      )}

      {/* System Prompt Section */}
      {activeSection === 'prompt' && (
        <div className="bg-[#161616] rounded-lg p-4 border border-[#2d2d2d]">
          <h4 className="text-white font-medium mb-3">System Prompt Template</h4>
          <select
            value={systemPromptTemplate}
            onChange={(e) => setSystemPromptTemplate(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#2d2d2d] rounded-lg px-4 py-2 text-white"
            disabled={isTestRunning}
          >
            <option value="agentic-coding">Agentic Coding (Default)</option>
            <option value="rag-first">RAG-First Focus</option>
            <option value="minimal">Minimal (Executor)</option>
            <option value="custom">Custom</option>
          </select>
          
          {profile.systemPrompt && (
            <div className="mt-4">
              <label className="text-gray-500 text-sm">Current System Prompt Preview</label>
              <pre className="mt-2 p-3 bg-[#0f0f0f] rounded text-gray-400 text-xs overflow-auto max-h-48">
                {profile.systemPrompt.substring(0, 1000)}
                {profile.systemPrompt.length > 1000 && '...'}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-[#2d2d2d]">
        <button
          onClick={handleGenerateOptimal}
          disabled={isTestRunning || isSaving}
          className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
        >
          🔄 Generate Optimal Config
        </button>
        <button
          onClick={handleSave}
          disabled={isTestRunning || isSaving}
          className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-500 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : '💾 Save Configuration'}
        </button>
      </div>
    </div>
  );
};

// Helper components
const BudgetBar: React.FC<{ label: string; value: number; total: number; color: string }> = ({
  label,
  value,
  total,
  color
}) => (
  <div className="flex items-center gap-4">
    <span className="text-gray-400 text-sm w-28">{label}</span>
    <div className="flex-1 h-4 bg-[#2d2d2d] rounded-full overflow-hidden">
      <div 
        className={`h-full ${color} rounded-full`}
        style={{ width: `${(value / total) * 100}%` }}
      />
    </div>
    <span className="text-gray-400 text-sm font-mono w-20 text-right">
      {value.toLocaleString()}
    </span>
  </div>
);

const SettingItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between">
    <span className="text-gray-400 text-sm">{label}</span>
    <span className="text-white text-sm font-mono">{value}</span>
  </div>
);

export default ConfigurationTab;

