import React, { useState, useEffect } from 'react';
import { useSources } from '../hooks/useSources';
import axios from 'axios';

const Sources: React.FC = () => {
  const { settings, loading, saving, saveSources } = useSources();
  const [bridgeInfo, setBridgeInfo] = useState<any>(null);
  
  // Local state for form inputs
  const [formData, setFormData] = useState({
    openaiApiKey: '',
    openrouterApiKey: '',
    lmstudioUrl: '',
    azureResourceName: '',
    azureApiKey: ''
  });

  // Sync settings to local state when loaded
  useEffect(() => {
    if (settings) {
      setFormData({
        openaiApiKey: settings.openaiApiKey || '',
        openrouterApiKey: settings.openrouterApiKey || '',
        lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
        azureResourceName: settings.azureResourceName || '',
        azureApiKey: settings.azureApiKey || ''
      });
    }
  }, [settings]);

  // Fetch Bridge Info
  useEffect(() => {
    axios.get('/api/bridge/info').then(res => setBridgeInfo(res.data)).catch(console.error);
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    saveSources(formData);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You might want to add a toast here
  };

  if (loading) return <div className="p-6 text-gray-400">Loading sources...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">🔑 Sources & Providers</h1>
          <p className="text-gray-400">Configure your AI providers and local endpoints.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-2 rounded-lg font-bold text-white transition-all \${
            saving 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:shadow-lg hover:shadow-purple-500/20'
          }`}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cloud Providers */}
        <div className="space-y-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-2xl">☁️</span> Cloud Providers
            </h3>
            
            <div className="space-y-4">
              {/* OpenAI */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">OpenAI API Key</label>
                <input 
                  type="password"
                  value={formData.openaiApiKey}
                  onChange={e => handleChange('openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors"
                />
              </div>

              {/* OpenRouter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">OpenRouter API Key</label>
                <input 
                  type="password"
                  value={formData.openrouterApiKey}
                  onChange={e => handleChange('openrouterApiKey', e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">Free & Paid models via OpenRouter.</p>
              </div>

              {/* Azure */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Azure Resource Name</label>
                <input 
                  type="text"
                  value={formData.azureResourceName}
                  onChange={e => handleChange('azureResourceName', e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Local & Bridge */}
        <div className="space-y-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-2xl">🏠</span> Local Hosts
            </h3>
            
            <div className="space-y-4">
              {/* LM Studio */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">LM Studio URL</label>
                <input 
                  type="text"
                  value={formData.lmstudioUrl}
                  onChange={e => handleChange('lmstudioUrl', e.target.value)}
                  placeholder="http://localhost:1234"
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors"
                />
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                  <span className="text-xs text-gray-500">Status check not implemented</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="text-6xl">🔗</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Gemini CLI Bridge</h3>
            <p className="text-sm text-gray-400 mb-4">
              Allow external agents (like Gemini CLI) to access Summy's RAG and context tools.
            </p>
            
            <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-600/50 mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
              <span className="text-sm font-mono text-green-400">Active</span>
              {bridgeInfo && <span className="text-xs text-gray-500 ml-auto">{bridgeInfo.endpoints.rag}</span>}
            </div>

            {bridgeInfo && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">System Prompt Snippet</label>
                  <button 
                    onClick={() => copyToClipboard(bridgeInfo.systemPromptSnippet)}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Copy
                  </button>
                </div>
                <div className="bg-black/50 p-3 rounded-lg border border-gray-700">
                  <pre className="text-[10px] text-gray-400 whitespace-pre-wrap font-mono">
                    {bridgeInfo.systemPromptSnippet}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sources;
