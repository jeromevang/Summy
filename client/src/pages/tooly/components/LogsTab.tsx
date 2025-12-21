import React from 'react';
import type { ExecutionLog } from '../types';

interface LogsTabProps {
  logs: ExecutionLog[];
  logStatusFilter: 'all' | 'success' | 'failed' | 'timeout';
  setLogStatusFilter: (filter: 'all' | 'success' | 'failed' | 'timeout') => void;
  logToolFilter: string;
  setLogToolFilter: (filter: string) => void;
  handleRollback: (backupId: string) => Promise<void>;
}

export const LogsTab: React.FC<LogsTabProps> = ({
  logs,
  logStatusFilter,
  setLogStatusFilter,
  logToolFilter,
  setLogToolFilter,
  handleRollback,
}) => {
  const filteredLogs = logs
    .filter(log => logStatusFilter === 'all' || log.status === logStatusFilter)
    .filter(log => !logToolFilter || log.tool.toLowerCase().includes(logToolFilter.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Execution Logs</h3>
        
        {/* Log Filters */}
        <div className="flex items-center gap-3">
          <select
            value={logStatusFilter}
            onChange={(e) => setLogStatusFilter(e.target.value as typeof logStatusFilter)}
            className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="timeout">Timeout</option>
          </select>
          
          <input
            type="text"
            value={logToolFilter}
            onChange={(e) => setLogToolFilter(e.target.value)}
            placeholder="Filter by tool..."
            className="bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-xs text-gray-300 w-32 focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>
      
      {logs.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No execution logs yet.</p>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="p-4 rounded-lg border border-[#2d2d2d] hover:border-[#3d3d3d]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={
                    log.status === 'success' ? 'text-green-400' :
                    log.status === 'failed' ? 'text-red-400' :
                    'text-yellow-400'
                  }>
                    {log.status === 'success' ? '✅' : log.status === 'failed' ? '❌' : '⏳'}
                  </span>
                  <div>
                    <p className="text-white">{log.tool}</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(log.timestamp).toLocaleString()} • {log.durationMs}ms
                    </p>
                  </div>
                </div>
                {log.backupId && (
                  <button
                    onClick={() => handleRollback(log.backupId!)}
                    className="px-3 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30"
                  >
                    ↩️ Undo
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

