import React, { useState } from 'react';
import { useWorkspace } from '../hooks/useWorkspace';

export const ProjectSwitcher: React.FC = () => {
  const { workspace, loading, switching, switchWorkspace, error } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [manualPath, setManualPath] = useState('');

  if (loading) return <div className="text-xs text-gray-500">Loading workspace...</div>;

  const currentName = workspace?.current.split(/[\\/]/).pop() || 'Unknown Project';

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-sm font-medium text-gray-300"
      >
        <span className="opacity-50">📂</span>
        <span className="max-w-[150px] truncate">{currentName}</span>
        <span className="text-[10px] opacity-50">▼</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-80 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Switch Project</h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="/path/to/project"
                  className="flex-1 bg-black/30 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-purple-500 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      switchWorkspace(manualPath);
                      setIsOpen(false);
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    switchWorkspace(manualPath);
                    setIsOpen(false);
                  }}
                  disabled={switching || !manualPath}
                  className="px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs text-white disabled:opacity-50"
                >
                  Go
                </button>
              </div>
              {error && <p className="text-red-400 text-[10px] mt-2">{error}</p>}
            </div>

            <div className="max-h-60 overflow-y-auto">
              <div className="px-4 py-2">
                <h4 className="text-[10px] font-bold text-gray-600 uppercase mb-1">Recent</h4>
                {workspace?.recent.map((path) => (
                  <button
                    key={path}
                    onClick={() => {
                      switchWorkspace(path);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-2 py-2 rounded text-xs truncate transition-colors ${path === workspace.current 
                        ? 'bg-purple-500/20 text-purple-300' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                    title={path}
                  >
                    {path.split(/[\\/]/).pop()}
                    <span className="block text-[9px] opacity-40 truncate">{path}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
