import React, { useState, useEffect } from 'react';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    openaiKey: '',
    lmstudioUrl: 'http://localhost:1234',
    lmstudioModel: ''
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('summy-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
    setIsLoaded(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');

    // Save settings to localStorage
    localStorage.setItem('summy-settings', JSON.stringify(settings));

    // Show success feedback
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleChange = (field: string, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Summy Settings
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* OpenAI Configuration */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">OpenAI Configuration</h4>
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="openaiKey" className="block text-sm font-medium text-gray-700">
                    OpenAI API Key
                  </label>
                  {isLoaded && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      settings.openaiKey ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {settings.openaiKey ? '✓ Set' : 'Not set'}
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  id="openaiKey"
                  value={settings.openaiKey}
                  onChange={(e) => handleChange('openaiKey', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="sk-..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  {isLoaded ? 'Settings loaded from browser storage' : 'Loading settings...'}
                </p>
              </div>
            </div>

            {/* LMStudio Configuration */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">LMStudio Configuration</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="lmstudioUrl" className="block text-sm font-medium text-gray-700">
                    LMStudio URL
                  </label>
                  <input
                    type="text"
                    id="lmstudioUrl"
                    value={settings.lmstudioUrl}
                    onChange={(e) => handleChange('lmstudioUrl', e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="http://localhost:1234"
                  />
                </div>
                <div>
                  <label htmlFor="lmstudioModel" className="block text-sm font-medium text-gray-700">
                    Model Name
                  </label>
                  <input
                    type="text"
                    id="lmstudioModel"
                    value={settings.lmstudioModel}
                    onChange={(e) => handleChange('lmstudioModel', e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="your-model-name"
                  />
                </div>
              </div>
            </div>

            {/* IDE Setup Instructions */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">IDE Configuration</h4>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="text-sm text-gray-700 space-y-2">
                  <p><strong>1.</strong> Start this Summy server: <code className="bg-gray-100 px-1 rounded">npm run dev:server</code></p>
                  <p><strong>2.</strong> Start ngrok: <code className="bg-gray-100 px-1 rounded">ngrok http 3001</code></p>
                  <p><strong>3.</strong> Copy the ngrok HTTPS URL (e.g., <code className="bg-gray-100 px-1 rounded">https://abc123.ngrok.io</code>)</p>
                  <p><strong>4.</strong> Configure your IDE to use: <code className="bg-gray-100 px-1 rounded">https://your-ngrok-url.ngrok.io/v1/chat/completions</code></p>
                  <p className="text-xs text-gray-500 ml-4">Or just: <code className="bg-gray-100 px-1 rounded">https://your-ngrok-url.ngrok.io/chat/completions</code></p>
                </div>
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Sessions will be automatically created as you chat in your IDE.
                    Check the Sessions page to see captured conversations.
                  </p>
                </div>
              </div>
            </div>

            {/* Server Management */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Server Management</h4>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Server Status:</span>
                    <span className="text-sm font-medium text-gray-900">Check the status indicator in the navigation bar</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        alert('To start the server:\n1. Open a new terminal\n2. Run: cd server && npm run dev\n3. Refresh this page');
                      }}
                      className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                    >
                      How to Start Server
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        alert('To stop the server, kill Node processes:\n\nnpm run kill\n\nOr manually: taskkill /F /IM node.exe /T');
                      }}
                      className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      How to Stop Server
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    The server runs independently. Start with: <code>npm run dev:server</code><br/>
                    Stop with: <code>npm run kill</code>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {saveStatus === 'saving' && '💾 Saving...'}
                {saveStatus === 'saved' && '✅ Settings saved!'}
              </div>
              <button
                type="submit"
                disabled={saveStatus === 'saving'}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
