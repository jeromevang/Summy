import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface DebugEntry {
  timestamp: string;
  type: 'request' | 'response' | 'session' | 'error';
  message: string;
  data?: any;
}

interface DebugData {
  entries: DebugEntry[];
  sessionCount: number;
  uptime: number;
  lastActivity: string | null;
}

const Debug: React.FC = () => {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDebugData = async () => {
    try {
      const response = await axios.get('http://localhost:3001/debug');
      setDebugData(response.data);
    } catch (error) {
      console.error('Failed to fetch debug data:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearDebugLog = async () => {
    try {
      await axios.post('http://localhost:3001/debug/clear');
      await fetchDebugData();
    } catch (error) {
      console.error('Failed to clear debug log:', error);
    }
  };

  useEffect(() => {
    fetchDebugData();

    if (autoRefresh) {
      const interval = setInterval(fetchDebugData, 3000); // Refresh every 3 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'request': return 'text-blue-600 bg-blue-100';
      case 'response': return 'text-green-600 bg-green-100';
      case 'session': return 'text-purple-600 bg-purple-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Debug Console</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{debugData?.sessionCount || 0}</div>
            <div className="text-sm text-gray-600">Total Sessions</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{debugData?.entries.length || 0}</div>
            <div className="text-sm text-gray-600">Debug Entries</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-purple-600">
              {debugData?.uptime ? Math.floor(debugData.uptime / 60) : 0}m
            </div>
            <div className="text-sm text-gray-600">Server Uptime</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Auto-refresh (3s)</span>
            </label>

            <button
              onClick={fetchDebugData}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              🔄 Refresh Now
            </button>

            <button
              onClick={clearDebugLog}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              🗑️ Clear Log
            </button>
          </div>

          {debugData?.lastActivity && (
            <div className="mt-2 text-sm text-gray-600">
              Last activity: {formatTimestamp(debugData.lastActivity)}
            </div>
          )}
        </div>

        {/* Debug Entries */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Activity Log</h3>
            <p className="text-sm text-gray-600">Real-time server activity from ngrok/IDE requests</p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {debugData?.entries.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-2">📡</div>
                <p>No activity yet. Start chatting in your IDE to see requests here!</p>
                <p className="text-sm mt-2">Make sure ngrok is running and your IDE is configured.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {debugData?.entries.map((entry, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(entry.type)}`}>
                        {entry.type.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {entry.message}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>

                        {entry.data && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                              Show details
                            </summary>
                            <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                              {JSON.stringify(entry.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Debug;
