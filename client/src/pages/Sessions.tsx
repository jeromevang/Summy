import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import ReconnectingWebSocket from 'reconnecting-websocket';

interface ContextSession {
  id: string;
  name: string;
  ide: string;
  created: string;
  conversations: any[];
  originalSize?: number;
  summarizedSize?: number;
  summary?: any;
}

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
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Context Sessions</h1>

        {/* Auto-creation info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Auto-Created Sessions</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Sessions are automatically created when conversations are detected from your IDE. Each unique conversation gets its own session with an auto-generated name based on the first message.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Manual create session (less prominent) */}
        <div className="bg-white p-4 rounded-lg shadow mb-6 border-l-4 border-gray-300">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Create manual session (optional)..."
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                onKeyPress={(e) => e.key === 'Enter' && createSession()}
              />
            </div>
            <button
              onClick={createSession}
              disabled={!newSessionName.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 disabled:opacity-50"
            >
              Create Manual Session
            </button>
          </div>
        </div>
      </div>

      {/* Sessions list */}
      <div className="grid gap-4">
        {sessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No sessions yet. Create your first session above.</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium text-gray-900">{session.name}</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Auto-created
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {session.ide} • {new Date(session.created).toLocaleString()} • {session.conversations.length} conversation turn{session.conversations.length !== 1 ? 's' : ''}
                  </p>
                  {session.originalSize && session.summarizedSize && (
                    <p className="text-sm text-green-600 mt-1">
                      Compressed: {session.originalSize} → {session.summarizedSize} chars
                      ({Math.round((session.summarizedSize / session.originalSize) * 100)}%)
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/editor/${session.id}`}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="inline-flex items-center px-3 py-1 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Sessions;
