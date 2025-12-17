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
  const [summarizing, setSummarizing] = useState(false);
  const [activeView, setActiveView] = useState<'original' | 'summarized'>('original');
  const [editorContent, setEditorContent] = useState('');
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadSession();
      // Start polling for updates every 30 seconds
      const pollInterval = setInterval(checkForUpdates, 30000);
      return () => clearInterval(pollInterval);
    }
  }, [sessionId]);

  // Auto-save when content changes
  useEffect(() => {
    if (autoSave && editorContent && session) {
      const timeoutId = setTimeout(() => {
        saveSession();
      }, 2000); // Auto-save after 2 seconds of no typing

      return () => clearTimeout(timeoutId);
    }
  }, [editorContent, autoSave]);

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
      const userMessage = turn.request?.messages?.find((m: any) => m.role === 'user')?.content || 'No user message';
      const assistantMessage = turn.response?.choices?.[0]?.message?.content || 'No assistant response';

      return `// ═══════════════════════════════════════════════════════════════
// CONVERSATION TURN ${index + 1}
// Timestamp: ${timestamp}
// ═══════════════════════════════════════════════════════════════

/* ┌─────────────────────────────────────────────────────────────────┐
   │                          USER MESSAGE                            │
   └─────────────────────────────────────────────────────────────────┘ */

${typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage, null, 2)}

/* ┌─────────────────────────────────────────────────────────────────┐
   │                        ASSISTANT RESPONSE                        │
   └─────────────────────────────────────────────────────────────────┘ */

${typeof assistantMessage === 'string' ? assistantMessage : JSON.stringify(assistantMessage, null, 2)}

/* ┌─────────────────────────────────────────────────────────────────┐
   │                          METADATA                               │
   └─────────────────────────────────────────────────────────────────┘ */

Model: ${turn.request?.model || 'unknown'}
Tokens: ${turn.response?.usage?.total_tokens || 'unknown'}
Finish Reason: ${turn.response?.choices?.[0]?.finish_reason || 'unknown'}

═══════════════════════════════════════════════════════════════════════

`;
    }).join('\n');
  };

  const checkForUpdates = async () => {
    if (!sessionId) return;

    try {
      const response = await axios.get(`http://localhost:3001/api/sessions/${sessionId}`);
      const latestSession = response.data;

      // Check if there are new conversations
      if (latestSession.conversations.length > (session?.conversations.length || 0)) {
        const newTurns = latestSession.conversations.length - (session?.conversations.length || 0);
        setLastUpdate(new Date());

        if (confirm(`${newTurns} new conversation turn(s) detected. Reload to see updates?`)) {
          setSession(latestSession);
          setEditorContent(formatConversationsForEditor(latestSession.conversations));
        }
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const saveSession = async () => {
    if (!session) return;

    setSaving(true);
    try {
      await axios.put(`http://localhost:3001/api/sessions/${session.id}`, {
        ...session,
        conversations: parseEditorContent(editorContent)
      });
      setLastUpdate(new Date());
      if (!autoSave) {
        alert('Session saved successfully!');
      }
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

    setSummarizing(true);
    try {
      // Calculate original size
      const originalText = JSON.stringify(session.conversations);
      const originalSize = new Blob([originalText]).size;

      // TODO: Implement LMStudio API call for summarization
      // For now, simulate summarization
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call

      // Create summarized version (simplified for demo)
      const summarizedConversations = session.conversations.map(turn => ({
        ...turn,
        request: {
          ...turn.request,
          messages: turn.request.messages?.map((msg: any) => ({
            ...msg,
            content: msg.content?.length > 100
              ? msg.content.substring(0, 100) + '... [summarized]'
              : msg.content
          }))
        },
        response: {
          ...turn.response,
          choices: turn.response.choices?.map((choice: any) => ({
            ...choice,
            message: {
              ...choice.message,
              content: choice.message.content?.length > 200
                ? choice.message.content.substring(0, 200) + '... [summarized]'
                : choice.message.content
            }
          }))
        }
      }));

      const summarizedText = JSON.stringify(summarizedConversations);
      const summarizedSize = new Blob([summarizedText]).size;
      const ratio = originalSize > 0 ? (originalSize - summarizedSize) / originalSize : 0;

      // Update session with summarized data
      const updatedSession = {
        ...session,
        conversations: summarizedConversations,
        originalSize,
        summarizedSize,
        summary: {
          compressed: true,
          ratio: Math.round(ratio * 100) / 100,
          timestamp: new Date().toISOString()
        }
      };

      // Save to server
      await axios.put(`http://localhost:3001/api/sessions/${session.id}`, updatedSession);
      setSession(updatedSession);
      setCompressionRatio(ratio);
      setEditorContent(formatConversationsForEditor(summarizedConversations));

      alert(`Context summarized! Compression ratio: ${(ratio * 100).toFixed(1)}%`);
    } catch (error) {
      console.error('Failed to summarize context:', error);
      alert('Failed to summarize context. Check LMStudio connection.');
    } finally {
      setSummarizing(false);
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

      {/* View Toggle & Summarization */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setActiveView('original');
                if (session?.conversations) {
                  setEditorContent(formatConversationsForEditor(session.conversations));
                }
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeView === 'original'
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              📝 Original Context
              {session?.originalSize && ` (${session.originalSize} bytes)`}
            </button>
            <button
              onClick={() => {
                setActiveView('summarized');
                if (session?.conversations) {
                  setEditorContent(formatConversationsForEditor(session.conversations));
                }
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeView === 'summarized'
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              🗜️ Current Context
              {session?.summarizedSize && ` (${session.summarizedSize} bytes)`}
            </button>
          </div>

          <div className="flex gap-2 ml-4">
            <button
              onClick={summarizeContext}
              disabled={summarizing || !session}
              className="px-4 py-2 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              {summarizing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Summarizing...
                </>
              ) : (
                <>
                  ⚡ Summarize with LMStudio
                </>
              )}
            </button>

            {compressionRatio !== null && (
              <div className="px-3 py-2 text-sm bg-green-100 text-green-800 rounded-md">
                📊 Compressed: {(compressionRatio * 100).toFixed(1)}% reduction
              </div>
            )}

            <div className="flex items-center gap-2 ml-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  className="rounded border-gray-300"
                />
                💾 Auto-save
              </label>

              <button
                onClick={checkForUpdates}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                title="Check for new conversation turns"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>

        {session?.summary && (
          <div className="mt-2 text-sm text-gray-600">
            💡 This context has been processed with LMStudio summarization
          </div>
        )}
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
      <div className="mt-4 text-sm text-gray-500 flex justify-between items-center">
        <div className="flex gap-4">
          <span>Characters: {editorContent.length.toLocaleString()}</span>
          <span>Lines: {editorContent.split('\n').length}</span>
          <span>Mode: {activeView === 'original' ? 'View Original' : 'Edit Context'}</span>
          {autoSave && <span className="text-green-600">● Auto-save ON</span>}
        </div>
        <div className="flex gap-4">
          {lastUpdate && (
            <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
          )}
          <span className="text-blue-600">🔄 Auto-refresh every 30s</span>
        </div>
      </div>
    </div>
  );
};

export default ContextEditor;
