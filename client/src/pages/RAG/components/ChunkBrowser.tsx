import React from 'react';
import { ChunkInfo, ChunkBrowserState } from '../types';

interface ChunkBrowserProps {
  state: ChunkBrowserState;
  filter: { fileType: string; symbolType: string; search: string };
  isLoading: boolean;
  selectedChunk: ChunkInfo | null;
  onFilterChange: (filter: any) => void;
  onLoadChunks: (page: number) => void;
  onChunkClick: (chunk: ChunkInfo) => void;
}

export const ChunkBrowser: React.FC<ChunkBrowserProps> = ({
  state, filter, isLoading, selectedChunk, onFilterChange, onLoadChunks, onChunkClick
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={filter.search}
              onChange={e => onFilterChange({ ...filter, search: e.target.value })}
              placeholder="Search content or file path..."
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded focus:border-blue-500 outline-none"
            />
          </div>
          <button onClick={() => onLoadChunks(1)} disabled={isLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium">
            {isLoading ? 'Loading...' : 'Filter'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {state.chunks.map(chunk => (
          <div
            key={chunk.id}
            onClick={() => onChunkClick(chunk)}
            className={`bg-[#1a1a1a] rounded-lg p-4 border cursor-pointer hover:border-blue-500/50 \${selectedChunk?.id === chunk.id ? 'border-blue-500' : 'border-gray-800'}`}
          >
            <div className="font-mono text-sm text-blue-400 truncate">{chunk.filePath}</div>
            <div className="text-xs text-gray-500 mt-1">Lines {chunk.startLine}-{chunk.endLine}</div>
            <div className="text-xs font-mono text-gray-400 mt-2 bg-[#0a0a0a] px-2 py-1 rounded line-clamp-2">{chunk.preview}...</div>
            {selectedChunk?.id === chunk.id && chunk.content && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <pre className="bg-[#0a0a0a] p-3 rounded overflow-x-auto text-xs max-h-96 overflow-y-auto"><code>{chunk.content}</code></pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
