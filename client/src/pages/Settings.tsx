import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ServerSettings {
  provider: 'openai' | 'azure' | 'lmstudio';
  openaiModel: string;
  azureResourceName: string;
  azureDeploymentName: string;
  azureApiKey: string;
  azureApiVersion: string;
  lmstudioUrl: string;
  lmstudioModel: string;
  defaultCompressionMode: 0 | 1 | 2 | 3;
  defaultKeepRecent: number;
  defaultContextLength: number;
  modules?: {
    summy?: { enabled: boolean };
    tooly?: { enabled: boolean };
  };
}

const COMPRESSION_MODES = [
  { value: 0, label: 'None', description: 'No compression applied' },
  { value: 1, label: 'Light', description: 'Summarize text, preserve all tools' },
  { value: 2, label: 'Medium', description: 'Summarize text, truncate tool outputs' },
  { value: 3, label: 'Aggressive', description: 'Convert everything to text summaries' },
];

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<ServerSettings>({
    provider: 'openai',
    openaiModel: 'gpt-4o-mini',
    azureResourceName: '',
    azureDeploymentName: '',
    azureApiKey: '',
    azureApiVersion: '2024-02-01',
    lmstudioUrl: 'http://localhost:1234',
    lmstudioModel: '',
    defaultCompressionMode: 1,
    defaultKeepRecent: 5,
    defaultContextLength: 8192
  });
  const [openaiKey, setOpenaiKey] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lmstudioStatus, setLmstudioStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [lmstudioError, setLmstudioError] = useState<string>('');
  
  // Azure connection test
  const [azureStatus, setAzureStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [azureError, setAzureError] = useState<string>('');
  
  // Module settings
  const [summyEnabled, setSummyEnabled] = useState(true);
  const [toolyEnabled, setToolyEnabled] = useState(true);

  // Load settings from server and localStorage
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load server settings
      const response = await axios.get('http://localhost:3001/api/settings');
      setSettings(response.data);
      
      // Load module settings
      setSummyEnabled(response.data.modules?.summy?.enabled ?? true);
      setToolyEnabled(response.data.modules?.tooly?.enabled ?? true);
      
      // Load OpenAI key from localStorage (sensitive data stays local)
      const savedKey = localStorage.getItem('summy-openai-key');
      if (savedKey) {
        setOpenaiKey(savedKey);
      }
      
      setIsLoaded(true);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setIsLoaded(true);
    }
  };
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');

    try {
      // Save server settings with module toggles
      const settingsToSave = {
        ...settings,
        modules: {
          summy: { enabled: summyEnabled },
          tooly: { enabled: toolyEnabled }
        }
      };
      await axios.post('http://localhost:3001/api/settings', settingsToSave);
      
      // Save OpenAI key locally
      localStorage.setItem('summy-openai-key', openaiKey);

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleTestLMStudio = async () => {
    setLmstudioStatus('testing');
    setLmstudioError('');
    setLmstudioModels([]);

    try {
      const response = await axios.post('http://localhost:3001/api/test-lmstudio', {
        url: settings.lmstudioUrl
      });

      if (response.data.success) {
        setLmstudioStatus('connected');
      } else {
        setLmstudioStatus('failed');
        setLmstudioError(response.data.error || 'Connection failed');
      }
    } catch (error: any) {
      setLmstudioStatus('failed');
      setLmstudioError(error.response?.data?.error || error.message);
    }
  };

  const handleTestAzure = async () => {
    setAzureStatus('testing');
    setAzureError('');
    
    try {
      const response = await axios.post('http://localhost:3001/api/test-azure', {
        resourceName: settings.azureResourceName,
        deploymentName: settings.azureDeploymentName,
        apiKey: settings.azureApiKey,
        apiVersion: settings.azureApiVersion
      });
      
      if (response.data.success) {
        setAzureStatus('connected');
      } else {
        setAzureStatus('failed');
        setAzureError(response.data.error || 'Connection failed');
      }
    } catch (error: any) {
      setAzureStatus('failed');
      setAzureError(error.response?.data?.error || error.message);
    }
  };

  const handleChange = (field: keyof ServerSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-xl">
          <div className="px-6 py-5 border-b border-[#2d2d2d]">
            <h3 className="text-xl font-semibold text-white">
              ⚙️ Settings
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Configure Summy proxy and compression settings
            </p>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-8">
            {/* Provider Selection */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🔌</span> LLM Provider
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                Select which LLM provider to use for IDE requests. Use model name <code className="bg-[#1a1a1a] px-1 rounded text-purple-400">localproxy</code> in your IDE to always route to LM Studio.
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'openai', label: 'OpenAI', icon: '🌐', desc: 'GPT-4, GPT-4o, etc.' },
                  { value: 'azure', label: 'Azure OpenAI', icon: '☁️', desc: 'Azure-hosted models' },
                  { value: 'lmstudio', label: 'LM Studio', icon: '💻', desc: 'Local models' },
                ].map(provider => (
                  <button
                    key={provider.value}
                    type="button"
                    onClick={() => handleChange('provider', provider.value)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      settings.provider === provider.value
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-[#3d3d3d] bg-[#0d0d0d] hover:border-[#5d5d5d]'
                    }`}
                  >
                    <div className="text-2xl mb-1">{provider.icon}</div>
                    <div className="font-medium text-white">{provider.label}</div>
                    <div className="text-xs text-gray-500">{provider.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Module Toggles */}
            <div className="border border-[#2d2d2d] rounded-lg p-4">
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">⚡</span> Active Modules
              </h4>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Summy Toggle */}
                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                  summyEnabled 
                    ? 'border-purple-500 bg-purple-500/10' 
                    : 'border-[#3d3d3d] hover:border-[#5d5d5d]'
                }`}>
                  <input
                    type="checkbox"
                    checked={summyEnabled}
                    onChange={(e) => setSummyEnabled(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-[#0d0d0d] text-purple-500 focus:ring-purple-500"
                  />
                  <div>
                    <div className="font-medium text-white">Summy</div>
                    <div className="text-xs text-gray-400">Context compression & session management</div>
                  </div>
                </label>
                
                {/* Tooly Toggle */}
                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                  toolyEnabled 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-[#3d3d3d] hover:border-[#5d5d5d]'
                }`}>
                  <input
                    type="checkbox"
                    checked={toolyEnabled}
                    onChange={(e) => setToolyEnabled(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-[#0d0d0d] text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-white">Tooly</div>
                    <div className="text-xs text-gray-400">Tool management & MCP integration</div>
                  </div>
                </label>
              </div>
              
              {!summyEnabled && !toolyEnabled && (
                <p className="mt-3 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                  ⚠️ Both modules disabled - Summy will act as a pure passthrough proxy
                </p>
              )}
            </div>

            {/* Model Hub Link */}
            <div className="border border-[#2d2d2d] rounded-lg p-4 bg-purple-500/5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-medium text-white flex items-center gap-2">
                    <span className="text-2xl">🎯</span> Model Management
                  </h4>
                  <p className="text-sm text-gray-400 mt-1">
                    Discover, test, and configure models in the Tooly - Model Hub
                  </p>
                </div>
                <a
                  href="/tooly"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Open Model Hub →
                </a>
              </div>
            </div>

            {/* Azure OpenAI Configuration - only show when Azure is selected */}
            {settings.provider === 'azure' && (
              <div className="border border-blue-500/30 rounded-lg p-4 bg-blue-500/5">
                <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">☁️</span> Azure OpenAI Configuration
                </h4>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Resource Name
                      </label>
                      <input
                        type="text"
                        value={settings.azureResourceName}
                        onChange={(e) => handleChange('azureResourceName', e.target.value)}
                        className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="my-resource"
                      />
                      <p className="text-xs text-gray-500 mt-1">From: https://<span className="text-blue-400">[resource]</span>.openai.azure.com</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Deployment Name
                      </label>
                      <input
                        type="text"
                        value={settings.azureDeploymentName}
                        onChange={(e) => handleChange('azureDeploymentName', e.target.value)}
                        className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="gpt-4o-deployment"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={settings.azureApiKey}
                      onChange={(e) => handleChange('azureApiKey', e.target.value)}
                      className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your Azure API key"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        API Version
                      </label>
                      <input
                        type="text"
                        value={settings.azureApiVersion}
                        onChange={(e) => handleChange('azureApiVersion', e.target.value)}
                        className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="2024-02-01"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={handleTestAzure}
                        disabled={azureStatus === 'testing' || !settings.azureResourceName || !settings.azureDeploymentName || !settings.azureApiKey}
                        className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                          azureStatus === 'testing' 
                            ? 'bg-gray-600 text-gray-300 cursor-wait'
                            : azureStatus === 'connected'
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : azureStatus === 'failed'
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
                        }`}
                      >
                        {azureStatus === 'testing' ? 'Testing...' 
                          : azureStatus === 'connected' ? '✓ Connected'
                          : azureStatus === 'failed' ? '✗ Retry'
                          : 'Test Connection'}
                      </button>
                    </div>
                  </div>
                  
                  {azureError && (
                    <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                      ❌ {azureError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* LMStudio Configuration - Connection Only */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🤖</span> LMStudio Connection
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                Configure the LM Studio server URL. Model selection and management is done in the Model Hub.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    LMStudio URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.lmstudioUrl}
                      onChange={(e) => handleChange('lmstudioUrl', e.target.value)}
                      className="flex-1 bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="http://localhost:1234"
                    />
                    <button
                      type="button"
                      onClick={handleTestLMStudio}
                      disabled={lmstudioStatus === 'testing'}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        lmstudioStatus === 'testing' 
                          ? 'bg-gray-600 text-gray-300 cursor-wait'
                          : lmstudioStatus === 'connected'
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : lmstudioStatus === 'failed'
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      {lmstudioStatus === 'testing' ? 'Testing...' 
                        : lmstudioStatus === 'connected' ? '✓ Connected'
                        : lmstudioStatus === 'failed' ? '✗ Retry'
                        : 'Test Connection'}
                    </button>
                  </div>
                  {lmstudioError && (
                    <p className="mt-2 text-sm text-red-400">
                      ❌ {lmstudioError}
                    </p>
                  )}
                  {lmstudioStatus === 'connected' && (
                    <p className="mt-2 text-sm text-green-400">
                      ✓ Connected to LM Studio. Go to <a href="/tooly" className="underline text-purple-400 hover:text-purple-300">Model Hub</a> to manage models.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Default Compression Settings */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🗜️</span> Default Compression Settings
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                These defaults apply to new sessions. You can override per-session.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Compression Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {COMPRESSION_MODES.map(mode => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => handleChange('defaultCompressionMode', mode.value)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          settings.defaultCompressionMode === mode.value
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-[#3d3d3d] hover:border-[#5d5d5d]'
                        }`}
                      >
                        <div className="text-sm font-medium text-white">{mode.label}</div>
                        <div className="text-xs text-gray-400">{mode.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Keep Recent Messages
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={settings.defaultKeepRecent}
                      onChange={(e) => handleChange('defaultKeepRecent', parseInt(e.target.value))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="w-12 text-center text-white font-medium bg-[#0d0d0d] px-2 py-1 rounded">
                      {settings.defaultKeepRecent}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    The last N messages will never be compressed
                  </p>
                </div>
              </div>
            </div>

            {/* Default Context Length */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📏</span> Default Context Length
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Context Window Size (tokens)
                  </label>
                  <div className="flex items-center gap-4">
                    <select
                      value={settings.defaultContextLength}
                      onChange={(e) => handleChange('defaultContextLength', parseInt(e.target.value))}
                      className="flex-1 bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value={2048}>2,048 tokens (2K)</option>
                      <option value={4096}>4,096 tokens (4K)</option>
                      <option value={8192}>8,192 tokens (8K)</option>
                      <option value={16384}>16,384 tokens (16K)</option>
                      <option value={32768}>32,768 tokens (32K)</option>
                      <option value={65536}>65,536 tokens (64K)</option>
                      <option value={131072}>131,072 tokens (128K)</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Default context length for LM Studio models. Can be overridden per model in Tooly.
                  </p>
                </div>
              </div>
            </div>

            {/* OpenAI Configuration */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🔑</span> OpenAI API Key
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                Your API key is stored in the server's .env file. This setting is for reference only.
              </p>
              
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-300">
                    API Key (stored locally)
                  </label>
                  {isLoaded && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      openaiKey ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'
                    }`}>
                      {openaiKey ? '✓ Set' : 'Not set'}
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="sk-..."
                />
                <p className="mt-2 text-xs text-gray-500">
                  ⚠️ The actual API key is read from <code className="bg-[#0d0d0d] px-1 rounded">server/.env</code>
                </p>
              </div>
            </div>

            {/* OpenAI Model - Simplified */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🤖</span> Default OpenAI Model
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                Fallback model for OpenAI requests. For full model management, use the Model Hub.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Model Name
                </label>
                <input
                  type="text"
                  value={settings.openaiModel}
                  onChange={(e) => handleChange('openaiModel', e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="gpt-4o-mini"
                />
                <p className="mt-2 text-xs text-gray-500">
                  💡 Used as fallback when the IDE sends an unknown model name
                </p>
              </div>
            </div>

            {/* IDE Setup Instructions */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">💻</span> IDE Configuration
              </h4>
              
              <div className="bg-[#0d0d0d] border border-[#2d2d2d] rounded-lg p-4 space-y-3">
                <div className="text-sm text-gray-300 space-y-2">
                  <p><span className="text-purple-400 font-medium">1.</span> Start the server: <code className="bg-[#1a1a1a] px-2 py-0.5 rounded text-green-400">npm run dev:server</code></p>
                  <p><span className="text-purple-400 font-medium">2.</span> Start ngrok: <code className="bg-[#1a1a1a] px-2 py-0.5 rounded text-green-400">ngrok http 3001</code></p>
                  <p><span className="text-purple-400 font-medium">3.</span> Copy the ngrok HTTPS URL</p>
                  <p><span className="text-purple-400 font-medium">4.</span> Configure your IDE API endpoint:</p>
                </div>
                <div className="bg-[#1a1a1a] rounded p-3 font-mono text-sm text-blue-400">
                  https://your-ngrok-url.ngrok.io/v1/chat/completions
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-sm text-blue-300">
                    💡 Use model name <code className="bg-[#1a1a1a] px-1 rounded text-purple-400">localproxy</code> in your IDE to route requests to LM Studio instead of OpenAI.
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-4 border-t border-[#2d2d2d]">
              <div className="text-sm">
                {saveStatus === 'saving' && <span className="text-gray-400">💾 Saving...</span>}
                {saveStatus === 'saved' && <span className="text-green-400">✅ Settings saved!</span>}
                {saveStatus === 'error' && <span className="text-red-400">❌ Failed to save</span>}
              </div>
              <button
                type="submit"
                disabled={saveStatus === 'saving'}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
