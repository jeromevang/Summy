import React from 'react';

interface ModuleTogglesProps {
  summyEnabled: boolean;
  setSummyEnabled: (enabled: boolean) => void;
  toolyEnabled: boolean;
  setToolyEnabled: (enabled: boolean) => void;
}

export const ModuleToggles: React.FC<ModuleTogglesProps> = ({ summyEnabled, setSummyEnabled, toolyEnabled, setToolyEnabled }) => {
  return (
    <div className="border border-[#2d2d2d] rounded-lg p-4">
      <h4 className="text-lg font-medium text-white mb-4">⚡ Active Modules</h4>
      <div className="grid grid-cols-2 gap-4">
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer \${summyEnabled ? 'border-purple-500 bg-purple-500/10' : 'border-[#3d3d3d]'}`}>
          <input type="checkbox" checked={summyEnabled} onChange={e => setSummyEnabled(e.target.checked)} className="mt-1" />
          <div><div className="font-medium text-white">Summy</div><div className="text-xs text-gray-400">Context compression</div></div>
        </label>
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer \${toolyEnabled ? 'border-blue-500 bg-blue-500/10' : 'border-[#3d3d3d]'}`}>
          <input type="checkbox" checked={toolyEnabled} onChange={e => setToolyEnabled(e.target.checked)} className="mt-1" />
          <div><div className="font-medium text-white">Tooly</div><div className="text-xs text-gray-400">Tool management</div></div>
        </label>
      </div>
    </div>
  );
};
