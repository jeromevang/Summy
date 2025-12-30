import React from 'react';
import { ProviderSelection, ModuleToggles } from './Settings/sections';
import { useSettings } from './Settings/hooks/useSettings';

const Settings: React.FC = () => {
  const { settings, setSettings, saveStatus, summyEnabled, setSummyEnabled, toolyEnabled, setToolyEnabled, handleSave } = useSettings();

  return (
    <div className="min-h-screen bg-[#0d0d0d] py-8 px-4 text-white">
      <div className="max-w-2xl mx-auto bg-[#1a1a1a] border border-[#2d2d2d] rounded-xl">
        <div className="px-6 py-5 border-b border-[#2d2d2d]">
          <h3 className="text-xl font-semibold">⚙️ Settings</h3>
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="p-6 space-y-8">
          <ProviderSelection currentProvider={settings.provider} onChange={v => setSettings({ ...settings, provider: v })} />
          <ModuleToggles summyEnabled={summyEnabled} setSummyEnabled={setSummyEnabled} toolyEnabled={toolyEnabled} setToolyEnabled={setToolyEnabled} />
          <button type="submit" className="w-full py-3 bg-purple-600 rounded-lg font-bold">
            {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Settings;