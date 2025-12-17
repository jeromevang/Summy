import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

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
    loadSessions();
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

        {/* Create new session */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Enter session name..."
              className="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              onKeyPress={(e) => e.key === 'Enter' && createSession()}
            />
            <button
              onClick={createSession}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Session
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
                  <h3 className="text-lg font-medium text-gray-900">{session.name}</h3>
                  <p className="text-sm text-gray-500">
                    {session.ide} • {new Date(session.created).toLocaleString()} • {session.conversations.length} turns
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
