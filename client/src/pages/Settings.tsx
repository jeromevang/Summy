import React, { useState } from 'react';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    openaiKey: '',
    lmstudioUrl: 'http://localhost:1234',
    lmstudioModel: '',
    ngrokUrl: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Save settings to localStorage and send to server
    localStorage.setItem('summy-settings', JSON.stringify(settings));
    alert('Settings saved!');
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
                <label htmlFor="openaiKey" className="block text-sm font-medium text-gray-700">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  id="openaiKey"
                  value={settings.openaiKey}
                  onChange={(e) => handleChange('openaiKey', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="sk-..."
                />
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

            {/* ngrok Configuration */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">IDE Integration</h4>
              <div>
                <label htmlFor="ngrokUrl" className="block text-sm font-medium text-gray-700">
                  ngrok URL (for IDE connection)
                </label>
                <input
                  type="text"
                  id="ngrokUrl"
                  value={settings.ngrokUrl}
                  onChange={(e) => handleChange('ngrokUrl', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="https://your-ngrok-url.ngrok.io"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Start ngrok locally and paste the HTTPS URL here. Configure your IDE to use this URL.
                </p>
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

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
