import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
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

const ContextEditor: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ContextSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'original' | 'summarized'>('original');
  const [editorContent, setEditorContent] = useState('');

  useEffect(() => {
    if (sessionId) {
      loadSession();
    }
  }, [sessionId]);

  const loadSession = async () => {
    if (!sessionId) return;

    try {
      const response = await axios.get(`http://localhost:3001/api/sessions/${sessionId}`);
      setSession(response.data);
      setEditorContent(formatConversationsForEditor(response.data.conversations));
    } catch (error) {
      console.error('Failed to load session:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const formatConversationsForEditor = (conversations: any[]): string => {
    return conversations.map((turn, index) => {
      const timestamp = new Date(turn.timestamp).toLocaleString();
      return `// ===== TURN ${index + 1} (${timestamp}) =====
// --- USER ---
${JSON.stringify(turn.request, null, 2)}

// --- ASSISTANT ---
${JSON.stringify(turn.response, null, 2)}

`;
    }).join('\n');
  };

  const saveSession = async () => {
    if (!session) return;

    setSaving(true);
    try {
      await axios.put(`http://localhost:3001/api/sessions/${session.id}`, {
        ...session,
        conversations: parseEditorContent(editorContent)
      });
      alert('Session saved successfully!');
    } catch (error) {
      console.error('Failed to save session:', error);
      alert('Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  const parseEditorContent = (content: string): any[] => {
    // This is a simplified parser - in a real app you'd want more robust parsing
    // For now, we'll just return the existing conversations
    return session?.conversations || [];
  };

  const summarizeContext = async () => {
    if (!session) return;

    try {
      // TODO: Implement LMStudio summarization
      alert('Summarization not yet implemented - will call LMStudio API');
    } catch (error) {
      console.error('Failed to summarize:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Session not found.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
            <p className="text-gray-600">
              {session.ide} • Created {new Date(session.created).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveSession}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : '💾 Save'}
            </button>
            <button
              onClick={summarizeContext}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              🗜️ Summarize
            </button>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('original')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              activeView === 'original'
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            📝 Original Context
            {session.originalSize && ` (${session.originalSize} chars)`}
          </button>
          <button
            onClick={() => setActiveView('summarized')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              activeView === 'summarized'
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
            disabled={!session.summary}
          >
            🗜️ Summarized Context
            {session.summarizedSize && ` (${session.summarizedSize} chars)`}
          </button>
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="context-editor">
        <Editor
          height="600px"
          language="typescript"
          theme="vs-light"
          value={editorContent}
          onChange={(value) => setEditorContent(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            readOnly: false,
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            renderLineHighlight: 'line',
            bracketPairColorization: { enabled: true }
          }}
        />
      </div>

      {/* Status Bar */}
      <div className="mt-4 text-sm text-gray-500 flex justify-between">
        <span>Characters: {editorContent.length}</span>
        <span>Lines: {editorContent.split('\n').length}</span>
        <span>Mode: Edit</span>
      </div>
    </div>
  );
};

export default ContextEditor;
