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
  modules?: {
    summy?: { enabled: boolean };
    tooly?: { enabled: boolean };
  };
}

interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  status: 'tested' | 'untested' | 'failed' | 'known_good';
  score?: number;
  toolCount?: number;
  totalTools?: number;
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
    defaultKeepRecent: 5
  });
  const [openaiKey, setOpenaiKey] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lmstudioStatus, setLmstudioStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [lmstudioModels, setLmstudioModels] = useState<string[]>([]);
  const [lmstudioError, setLmstudioError] = useState<string>('');
  const [unloadOthers, setUnloadOthers] = useState(true);
  const [loadingModel, setLoadingModel] = useState(false);
  const [loadModelStatus, setLoadModelStatus] = useState<string>('');
  
  // OpenAI model selection
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [openaiModelsLoading, setOpenaiModelsLoading] = useState(false);
  const [openaiModelsError, setOpenaiModelsError] = useState<string>('');
  
  // Azure connection test
  const [azureStatus, setAzureStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [azureError, setAzureError] = useState<string>('');
  
  // Module settings
  const [summyEnabled, setSummyEnabled] = useState(true);
  const [toolyEnabled, setToolyEnabled] = useState(true);
  
  // Discovered models
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

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
  
  const fetchDiscoveredModels = async () => {
    setModelsLoading(true);
    try {
      const response = await axios.get('http://localhost:3001/api/tooly/models');
      if (response.data.models) {
        setDiscoveredModels(response.data.models);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setModelsLoading(false);
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
        const models = response.data.models?.map((m: any) => m.id) || [];
        setLmstudioModels(models);
        
        // Auto-select first model if none selected
        if (!settings.lmstudioModel && models.length > 0) {
          setSettings(prev => ({ ...prev, lmstudioModel: models[0] }));
        }
      } else {
        setLmstudioStatus('failed');
        setLmstudioError(response.data.error || 'Connection failed');
      }
    } catch (error: any) {
      setLmstudioStatus('failed');
      setLmstudioError(error.response?.data?.error || error.message);
    }
  };

  const handleLoadModel = async () => {
    if (!settings.lmstudioModel) {
      setLoadModelStatus('No model selected');
      return;
    }

    setLoadingModel(true);
    setLoadModelStatus('Loading model...');

    try {
      const response = await axios.post('http://localhost:3001/api/lmstudio/load-model', {
        model: settings.lmstudioModel,
        unloadOthers: unloadOthers
      });

      if (response.data.success) {
        setLoadModelStatus(`✓ ${settings.lmstudioModel} loaded!`);
        // Refresh model list
        handleTestLMStudio();
      } else {
        setLoadModelStatus(`✗ ${response.data.error}`);
      }
    } catch (error: any) {
      setLoadModelStatus(`✗ ${error.response?.data?.error || error.message}`);
    } finally {
      setLoadingModel(false);
      setTimeout(() => setLoadModelStatus(''), 5000);
    }
  };

  const handleFetchOpenAIModels = async () => {
    setOpenaiModelsLoading(true);
    setOpenaiModelsError('');
    
    try {
      const response = await axios.get('http://localhost:3001/api/openai/models');
      if (response.data.models) {
        setOpenaiModels(response.data.models);
        // Auto-select first model if none selected
        if (!settings.openaiModel && response.data.models.length > 0) {
          setSettings(prev => ({ ...prev, openaiModel: response.data.models[0] }));
        }
      }
    } catch (error: any) {
      setOpenaiModelsError(error.response?.data?.error || error.message);
    } finally {
      setOpenaiModelsLoading(false);
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

            {/* Discovered Models */}
            <div className="border border-[#2d2d2d] rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-white flex items-center gap-2">
                  <span className="text-2xl">🎯</span> Discovered Models
                </h4>
                <button
                  type="button"
                  onClick={fetchDiscoveredModels}
                  disabled={modelsLoading}
                  className="px-3 py-1 text-xs bg-[#2d2d2d] text-gray-300 rounded hover:bg-[#3d3d3d] disabled:opacity-50 transition-colors"
                >
                  {modelsLoading ? '⏳ Scanning...' : '🔄 Scan'}
                </button>
              </div>
              
              {discoveredModels.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {discoveredModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between p-3 bg-[#0d0d0d] rounded-lg border border-[#2d2d2d]"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-lg ${
                          model.status === 'tested' || model.status === 'known_good' ? 'text-green-400' :
                          model.status === 'untested' ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {model.status === 'tested' || model.status === 'known_good' ? '✅' :
                           model.status === 'untested' ? '⚠️' : '❌'}
                        </span>
                        <div>
                          <p className="text-white text-sm font-medium">{model.displayName}</p>
                          <p className="text-xs text-gray-500">{model.provider}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {model.score !== undefined && (
                          <span className="text-xs text-gray-400">
                            {model.score}/100
                          </span>
                        )}
                        {model.toolCount !== undefined && (
                          <span className="text-xs px-2 py-0.5 bg-[#2d2d2d] rounded text-gray-400">
                            🔧 {model.toolCount}/{model.totalTools}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  Click "Scan" to discover available models from your LLM providers
                </p>
              )}
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

            {/* LMStudio Configuration */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🤖</span> LMStudio Configuration
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                LMStudio is used for compressing conversation context{settings.provider === 'lmstudio' ? ' and as the main LLM provider' : ''}. Make sure LMStudio is running.
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Model
                  </label>
                  <div className="flex gap-2">
                    {lmstudioModels.length > 0 ? (
                      <select
                        value={settings.lmstudioModel}
                        onChange={(e) => handleChange('lmstudioModel', e.target.value)}
                        className="flex-1 bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      >
                        {lmstudioModels.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={settings.lmstudioModel}
                        onChange={(e) => handleChange('lmstudioModel', e.target.value)}
                        className="flex-1 bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Test connection to see available models"
                      />
                    )}
                    <button
                      type="button"
                      onClick={handleLoadModel}
                      disabled={loadingModel || !settings.lmstudioModel}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        loadingModel
                          ? 'bg-yellow-600 text-white cursor-wait'
                          : 'bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                    >
                      {loadingModel ? '⏳ Loading...' : '📥 Load Model'}
                    </button>
                  </div>
                  
                  {/* Unload others checkbox */}
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unloadOthers}
                      onChange={(e) => setUnloadOthers(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-[#0d0d0d] text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-400">
                      Unload other models when loading (recommended)
                    </span>
                  </label>
                  
                  {/* Load status message */}
                  {loadModelStatus && (
                    <p className={`mt-2 text-sm ${loadModelStatus.startsWith('✓') ? 'text-green-400' : loadModelStatus.startsWith('✗') ? 'text-red-400' : 'text-yellow-400'}`}>
                      {loadModelStatus}
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

            {/* OpenAI Model Selection */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🤖</span> OpenAI Model
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                Select which OpenAI model to use when proxying requests. Click "Fetch Models" to load available models from your API key.
              </p>
              
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFetchOpenAIModels}
                    disabled={openaiModelsLoading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    {openaiModelsLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Fetching...
                      </>
                    ) : (
                      <>🔄 Fetch Models</>
                    )}
                  </button>
                  {openaiModels.length > 0 && (
                    <span className="text-xs text-gray-400 self-center">
                      {openaiModels.length} models available
                    </span>
                  )}
                </div>
                
                {openaiModelsError && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    ❌ {openaiModelsError}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Selected Model
                  </label>
                  {openaiModels.length > 0 ? (
                    <select
                      value={settings.openaiModel}
                      onChange={(e) => handleChange('openaiModel', e.target.value)}
                      className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      {openaiModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={settings.openaiModel}
                      onChange={(e) => handleChange('openaiModel', e.target.value)}
                      className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="gpt-4o-mini"
                    />
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    💡 This model is used when the IDE sends an unknown model name (not gpt-*, o1-*)
                  </p>
                </div>
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
