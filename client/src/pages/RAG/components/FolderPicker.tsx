import React from 'react';

interface FolderEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface BrowseRoot {
  path: string;
  name: string;
  type: 'drive' | 'folder';
}

interface FolderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  roots: BrowseRoot[];
  currentPath: string;
  folders: FolderEntry[];
  parent: string | null;
  isLoading: boolean;
  onBrowse: (path: string) => void;
  onSelect: () => void;
}

export const FolderPicker: React.FC<FolderPickerProps> = ({
  isOpen,
  onClose,
  roots,
  currentPath,
  folders,
  parent,
  isLoading,
  onBrowse,
  onSelect
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            📁 Select Project Folder
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-6">
          <div className="flex gap-4 mb-4">
            <div className="w-1/3 border-r border-gray-800 pr-4 overflow-y-auto max-h-[400px]">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Drives / Roots</h4>
              <div className="space-y-1">
                {roots.map(root => (
                  <button
                    key={root.path}
                    onClick={() => onBrowse(root.path)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors \${
                      currentPath.startsWith(root.path) ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {root.type === 'drive' ? '💽' : '🏠'} {root.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-[#0a0a0a] border border-gray-800 rounded p-2 mb-3 text-xs font-mono truncate text-gray-400">
                {currentPath}
              </div>

              <div className="flex-1 overflow-y-auto max-h-[350px] space-y-1 pr-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20 text-gray-500 animate-pulse">Loading folders...</div>
                ) : (
                  <>
                    {parent && (
                      <button
                        onClick={() => onBrowse(parent)}
                        className="w-full text-left px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 transition-colors"
                      >
                        ⬆️ .. (Parent Directory)
                      </button>
                    )}
                    {folders.map(folder => (
                      <button
                        key={folder.path}
                        onClick={() => onBrowse(folder.path)}
                        className="w-full text-left px-3 py-2 rounded text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
                      >
                        📁 {folder.name}
                      </button>
                    ))}
                    {folders.length === 0 && !isLoading && (
                      <div className="text-center py-10 text-gray-600 italic">No sub-folders found</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#111] border-t border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSelect}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors"
          >
            Select Current
          </button>
        </div>
      </div>
    </div>
  );
};
