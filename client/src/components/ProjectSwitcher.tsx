import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useWorkspace } from '../hooks/useWorkspace';

// Type declarations for modern directory picker API
declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
  interface HTMLInputElement {
    webkitdirectory: boolean;
  }
}

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

interface BrowseResponse {
  currentPath: string;
  parentPath: string;
  items: DirectoryItem[];
}

export const ProjectSwitcher: React.FC = () => {
  const { workspace, loading, switching, switchWorkspace, error } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [folderSelectorSupported, setFolderSelectorSupported] = useState<boolean | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  if (loading) return <div className="text-xs text-gray-500">Loading workspace...</div>;

  const currentName = workspace?.current.split(/[\\/]/).pop() || 'Unknown Project';


  const handleCurrentProjectSelect = async () => {
    try {
      // Get the actual current working directory from the server
      const res = await axios.get('/api/workspace/current-folder');
      const currentFolder = res.data.currentFolder;
      if (currentFolder) {
        switchWorkspace(currentFolder);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Failed to get current folder:', err);
      // Fallback to stored workspace
      if (workspace?.current) {
        switchWorkspace(workspace.current);
        setIsOpen(false);
      }
    }
  };

  // Check if folder selection APIs are supported
  React.useEffect(() => {
    const checkSupport = () => {
      const fileApiSupported = 'showDirectoryPicker' in window;
      const webkitSupported = (() => {
        const input = document.createElement('input');
        input.type = 'file';
        return 'webkitdirectory' in input;
      })();

      setFolderSelectorSupported(fileApiSupported || webkitSupported);
    };

    checkSupport();
  }, []);

  const handleFolderSelect = useCallback(async () => {
    try {
      // Try modern File System Access API first (Chrome, Edge)
      if ('showDirectoryPicker' in window) {
        try {
          const dirHandle = await (window as any).showDirectoryPicker();
          // We can't get the actual path, but we can show the directory name
          // In a real implementation, we'd need server-side path resolution
          console.log('Selected directory:', dirHandle.name);
          // For now, we'll show an error that this isn't fully implemented
          alert(`Selected folder: ${dirHandle.name}\n\nNote: Modern browsers don't allow web apps to see the actual file system path for security reasons. Please use the manual path entry instead.`);
          return;
        } catch (err) {
          if ((err as any).name !== 'AbortError') {
            console.error('File System API error:', err);
          }
          return;
        }
      }

      // Fallback: webkitdirectory (Safari, older Chrome)
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = false;

      return new Promise<void>((resolve, reject) => {
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            const file = files[0];
            // webkitRelativePath gives us something like "foldername/filename"
            // We can extract the folder name from the first part
            const pathParts = file.webkitRelativePath.split('/');
            const folderName = pathParts[0];

            if (folderName) {
              // This is still not a real path, but we can show what was selected
              console.log('Webkit selected folder:', folderName);
              alert(`Selected folder: ${folderName}\n\nNote: Your browser doesn't provide the full path for security reasons. Please use the manual path entry instead.`);
            }
          }
          resolve();
        };

        input.oncancel = () => resolve();
        input.click();
      });

    } catch (err) {
      console.error('Folder selection error:', err);
      alert('Folder selection failed. Please use manual path entry instead.');
    }
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const item = items[0];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry && entry.isDirectory) {
          // We have a directory entry, but still can't get the real path
          console.log('Dropped directory:', entry.name);
          alert(`Dropped folder: ${entry.name}\n\nNote: Browsers don't allow web apps to access the actual file system path for security reasons. Please use manual path entry.`);
        }
      }
    }
  }, []);

  const browseDirectory = useCallback(async (path?: string) => {
    setBrowseLoading(true);
    setBrowseError(null);

    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      const res = await axios.get(`/api/workspace/browse${params}`);
      setBrowseData(res.data);
    } catch (err: any) {
      console.error('Browse error:', err);
      setBrowseError(err.response?.data?.error || 'Failed to browse directory');
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const handleOpenBrowser = useCallback(() => {
    setShowBrowser(true);
    browseDirectory();
  }, [browseDirectory]);

  const handleCloseBrowser = useCallback(() => {
    setShowBrowser(false);
    setBrowseData(null);
    setBrowseError(null);
  }, []);

  const handleSelectDirectory = useCallback((path: string) => {
    switchWorkspace(path);
    setIsOpen(false);
    handleCloseBrowser();
  }, [switchWorkspace, handleCloseBrowser]);

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
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Switch Project</h3>

              {/* Quick Select Current Project */}
              <div className="mb-3">
                <button
                  onClick={handleCurrentProjectSelect}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 transition-all text-xs text-purple-300 hover:text-purple-200"
                  title={`Switch to: ${workspace?.current || 'No current workspace'}`}
                >
                  <span className="opacity-70">🏠</span>
                  <div className="text-left">
                    <div className="font-medium">Current Workspace</div>
                    <div className="text-[9px] opacity-60 truncate">{currentName}</div>
                  </div>
                </button>
              </div>

              {/* Manual Path Input */}
              <div className="mb-3">
                <div className="flex gap-2 mb-2">
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

                {/* Folder Selection */}
              <div className="mb-3">
                <div className="flex gap-2 mb-2">
                  {/* Directory Browser */}
                  <button
                    onClick={handleOpenBrowser}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-black/20 hover:bg-black/30 border border-gray-600 hover:border-gray-500 transition-all text-xs text-gray-300 hover:text-white"
                    title="Browse and select a directory"
                  >
                    <span className="opacity-70">📁</span>
                    <span>Browse Folders</span>
                  </button>

                  {/* Manual Path Input */}
                  <input
                    type="text"
                    value={manualPath}
                    onChange={(e) => setManualPath(e.target.value)}
                    placeholder="or enter path manually..."
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

                {/* Directory Browser Modal */}
                {showBrowser && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b border-gray-700">
                        <h3 className="text-sm font-medium text-white">Select Directory</h3>
                        <button
                          onClick={handleCloseBrowser}
                          className="text-gray-400 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="p-4">
                        {browseLoading && (
                          <div className="text-center text-gray-400 py-8">
                            Loading directory contents...
                          </div>
                        )}

                        {browseError && (
                          <div className="text-center text-red-400 py-4">
                            Error: {browseError}
                          </div>
                        )}

                        {browseData && (
                          <div>
                            {/* Current Path */}
                            <div className="flex items-center gap-2 mb-4 p-2 bg-black/20 rounded">
                              <button
                                onClick={() => browseDirectory(browseData.parentPath)}
                                className="text-gray-400 hover:text-white"
                                disabled={browseData.currentPath === browseData.parentPath}
                              >
                                ⬅️
                              </button>
                              <span className="text-xs text-gray-300 font-mono flex-1">
                                {browseData.currentPath}
                              </span>
                              <button
                                onClick={() => handleSelectDirectory(browseData.currentPath)}
                                className="px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs text-white"
                              >
                                Select This
                              </button>
                            </div>

                            {/* Directory Contents */}
                            <div className="max-h-96 overflow-y-auto">
                              {browseData.items.map((item) => (
                                <div
                                  key={item.path}
                                  className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-white/5 ${
                                    item.isDirectory ? 'text-blue-300' : 'text-gray-300'
                                  }`}
                                  onClick={() => {
                                    if (item.isDirectory) {
                                      browseDirectory(item.path);
                                    }
                                  }}
                                >
                                  <span className="text-sm">
                                    {item.isDirectory ? '📁' : '📄'}
                                  </span>
                                  <span className="flex-1 text-xs truncate">
                                    {item.name}
                                  </span>
                                  {item.isDirectory && (
                                    <span className="text-gray-500 text-xs">DIR</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              </div>

              {error && <p className="text-red-400 text-[10px]">{error}</p>}
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
