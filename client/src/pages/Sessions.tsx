import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import ReconnectingWebSocket from 'reconnecting-websocket';

interface CompressionConfig {
  mode: 0 | 1 | 2 | 3;
  keepRecent: number;
  enabled: boolean;
  lastCompressed?: string;
  stats?: {
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  };
  systemPrompt?: string | null;
}

interface ContextSession {
  id: string;
  name: string;
  ide: string;
  created: string;
  conversations?: any[];
  turnCount?: number;  // From database API
  originalSize?: number;
  summarizedSize?: number;
  summary?: any;
  compression?: CompressionConfig;
}

const COMPRESSION_MODE_LABELS = ['None', 'Light', 'Medium', 'Aggressive'];

const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<ContextSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSessionName, setNewSessionName] = useState('');

  useEffect(() => {
    // Initial load
    loadSessions();

    // WebSocket for real-time updates
    const ws = new ReconnectingWebSocket('ws://localhost:3001');

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'session_updated') {
          // Reload sessions when one is updated
          loadSessions();
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const loadSessions = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/sessions');
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!newSessionName.trim()) return;

    try {
      const response = await axios.post('http://localhost:3001/api/sessions', {
        name: newSessionName,
        ide: 'Cursor' // Default, could be made configurable
      });
      setSessions(prev => [response.data, ...prev]);
      setNewSessionName('');
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;

    try {
      await axios.delete(`http://localhost:3001/api/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const clearAllSessions = async () => {
    if (sessions.length === 0) return;
    
    const confirmed = confirm(
      `⚠️ WARNING: This will permanently delete ALL ${sessions.length} sessions!\n\n` +
      `This action cannot be undone.\n\n` +
      `Are you sure you want to continue?`
    );
    
    if (!confirmed) return;
    
    // Double confirmation for safety
    const doubleConfirm = confirm(
      `🚨 FINAL WARNING 🚨\n\n` +
      `You are about to delete ${sessions.length} sessions.\n\n` +
      `Type OK to confirm deletion.`
    );
    
    if (!doubleConfirm) return;

    try {
      await axios.delete('http://localhost:3001/api/sessions');
      setSessions([]);
    } catch (error) {
      console.error('Failed to clear sessions:', error);
      alert('Failed to clear sessions. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-4">Context Sessions</h1>

        {/* Auto-creation info */}
        <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0 text-purple-400">💡</div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-purple-400">Auto-Created Sessions</h3>
              <div className="mt-2 text-sm text-gray-400">
                <p>Sessions are automatically created when conversations are detected from your IDE via ngrok. Each unique conversation gets its own session.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Manual create session (less prominent) */}
        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2d2d2d] mb-6">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Create manual session (optional)..."
                className="w-full bg-[#0d0d0d] border border-[#3d3d3d] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                onKeyPress={(e) => e.key === 'Enter' && createSession()}
              />
            </div>
            <button
              onClick={createSession}
              disabled={!newSessionName.trim()}
              className="px-4 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 rounded-lg transition-colors disabled:opacity-50"
            >
              + Create
            </button>
            <button
              onClick={clearAllSessions}
              disabled={sessions.length === 0}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={sessions.length === 0 ? 'No sessions to clear' : `Clear all ${sessions.length} sessions`}
            >
              🗑️ Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Sessions list */}
      <div className="grid gap-3">
        {sessions.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No sessions yet.</p>
            <p className="text-gray-500 text-sm mt-2">Start chatting in your IDE to see sessions here.</p>
          </div>
        ) : (
          sessions.map((session) => (
            <Link
              key={session.id}
              to={`/session/${session.id}`}
              className="block bg-[#1a1a1a] rounded-lg border border-[#2d2d2d] p-4 hover:border-purple-500/50 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-medium truncate group-hover:text-purple-400 transition-colors">
                      {session.name}
                    </h3>
                    <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                      {session.turnCount ?? session.conversations?.length ?? 0} turns
                    </span>
                    {/* Compression status badges */}
                    {session.compression?.enabled && (
                      <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                        🗜️ {COMPRESSION_MODE_LABELS[session.compression.mode]}
                      </span>
                    )}
                    {session.compression?.stats && (
                      <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                        -{Math.round(session.compression.stats.ratio * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {session.ide} • {new Date(session.created).toLocaleDateString()}
                    {session.compression?.lastCompressed && (
                      <> • Compressed: {new Date(session.compression.lastCompressed).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete session"
                  >
                    🗑️
                  </button>
                  <span className="text-gray-500 group-hover:text-purple-400 transition-colors">→</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Sessions;
