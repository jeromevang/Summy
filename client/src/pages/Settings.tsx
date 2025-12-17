import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ServerSettings {
  lmstudioUrl: string;
  lmstudioModel: string;
  defaultCompressionMode: 0 | 1 | 2 | 3;
  defaultKeepRecent: number;
}

const COMPRESSION_MODES = [
  { value: 0, label: 'None', description: 'No compression applied' },
  { value: 1, label: 'Light', description: 'Summarize text, preserve all tools' },
  { value: 2, label: 'Medium', description: 'Summarize text, truncate tool outputs' },
  { value: 3, label: 'Aggressive', description: 'Convert everything to text summaries' },
];

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<ServerSettings>({
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

  // Load settings from server and localStorage
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load server settings
      const response = await axios.get('http://localhost:3001/api/settings');
      setSettings(response.data);
      
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
      // Save server settings
      await axios.post('http://localhost:3001/api/settings', settings);
      
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
            {/* LMStudio Configuration */}
            <div>
              <h4 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🤖</span> LMStudio Configuration
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                LMStudio is used for compressing conversation context. Make sure LMStudio is running before testing.
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
                    💡 Sessions are automatically created as you chat. Check the Sessions page to view captured conversations.
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
