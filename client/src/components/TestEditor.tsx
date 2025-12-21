import React, { useState, useEffect } from 'react';

// ============================================================
// TYPES
// ============================================================

export interface CustomTest {
  id?: string;
  name: string;
  category: string;
  prompt: string;
  expectedTool?: string;
  expectedBehavior?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  variants?: Array<{ prompt: string; difficulty: string }>;
  isBuiltin?: boolean;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (test: CustomTest) => Promise<void>;
  editingTest?: CustomTest | null;
}

// ============================================================
// CATEGORY OPTIONS
// ============================================================

const CATEGORIES = [
  { id: 'custom', name: 'Custom Tests', icon: '📝' },
  { id: '3.x', name: 'Strategic RAG', icon: '🔍' },
  { id: '4.x', name: 'Architectural', icon: '🏗️' },
  { id: '5.x', name: 'Navigation', icon: '🧭' },
  { id: '6.x', name: 'Helicopter View', icon: '🚁' },
  { id: '7.x', name: 'Proactive', icon: '💡' },
  { id: '8.x', name: 'Intent Recognition', icon: '🎯' },
];

const EXPECTED_TOOLS = [
  { id: '', name: '(None)' },
  { id: 'rag_query', name: 'RAG Query' },
  { id: 'read_file', name: 'Read File' },
  { id: 'search_files', name: 'Search Files' },
  { id: 'list_directory', name: 'List Directory' },
  { id: 'write_file', name: 'Write File' },
  { id: 'edit_file', name: 'Edit File' },
];

// ============================================================
// FILE TREE COMPONENT
// ============================================================

const FileTree: React.FC<{
  nodes: FileTreeNode[];
  onSelect: (path: string) => void;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}> = ({ nodes, onSelect, selectedPath, expanded, onToggle }) => {
  return (
    <div className="pl-2">
      {nodes.map(node => (
        <div key={node.path}>
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer hover:bg-[#2d2d2d] text-sm ${
              selectedPath === node.path ? 'bg-purple-600/30 text-purple-300' : 'text-gray-300'
            }`}
            onClick={() => {
              if (node.type === 'directory') {
                onToggle(node.path);
              } else {
                onSelect(node.path);
              }
            }}
          >
            <span className="text-xs">
              {node.type === 'directory' 
                ? (expanded.has(node.path) ? '📂' : '📁')
                : '📄'}
            </span>
            <span className="truncate">{node.name}</span>
            {node.type === 'file' && (
              <button
                className="ml-auto px-1 text-xs text-purple-400 hover:text-purple-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(node.path);
                }}
              >
                Insert
              </button>
            )}
          </div>
          {node.type === 'directory' && expanded.has(node.path) && node.children && (
            <FileTree
              nodes={node.children}
              onSelect={onSelect}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
            />
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================
// TEST EDITOR MODAL
// ============================================================

export const TestEditor: React.FC<Props> = ({ isOpen, onClose, onSave, editingTest }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('custom');
  const [prompt, setPrompt] = useState('');
  const [expectedTool, setExpectedTool] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // File picker state
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadingTree, setLoadingTree] = useState(false);

  // Reset form when opening/closing or when editing test changes
  useEffect(() => {
    if (isOpen) {
      if (editingTest) {
        setName(editingTest.name);
        setCategory(editingTest.category || 'custom');
        setPrompt(editingTest.prompt);
        setExpectedTool(editingTest.expectedTool || '');
        setExpectedBehavior(editingTest.expectedBehavior || '');
        setDifficulty(editingTest.difficulty || 'medium');
      } else {
        // Reset for new test
        setName('');
        setCategory('custom');
        setPrompt('');
        setExpectedTool('');
        setExpectedBehavior('');
        setDifficulty('medium');
      }
      setError(null);
    }
  }, [isOpen, editingTest]);

  // Load file tree when picker is opened
  useEffect(() => {
    if (showFilePicker && fileTree.length === 0) {
      setLoadingTree(true);
      fetch('/api/tooly/test-project/tree')
        .then(res => res.json())
        .then(data => {
          setFileTree(data.tree || []);
          // Auto-expand first level
          const firstLevel = new Set<string>();
          (data.tree || []).forEach((node: FileTreeNode) => {
            if (node.type === 'directory') {
              firstLevel.add(node.path);
            }
          });
          setExpandedDirs(firstLevel);
        })
        .catch(err => console.error('Failed to load file tree:', err))
        .finally(() => setLoadingTree(false));
    }
  }, [showFilePicker, fileTree.length]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        id: editingTest?.id,
        name: name.trim(),
        category,
        prompt: prompt.trim(),
        expectedTool: expectedTool || undefined,
        expectedBehavior: expectedBehavior.trim() || undefined,
        difficulty,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save test');
    } finally {
      setSaving(false);
    }
  };

  const handleInsertFile = (filePath: string) => {
    // Insert file path at cursor position or end of prompt
    setPrompt(prev => {
      if (prev.endsWith('\n') || prev === '') {
        return prev + `\`${filePath}\``;
      }
      return prev + ` \`${filePath}\``;
    });
    setShowFilePicker(false);
  };

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] rounded-lg border border-[#2d2d2d] w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d2d2d]">
          <h2 className="text-lg font-semibold text-white">
            {editingTest ? 'Edit Test' : 'Create New Test'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Test Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Implicit RAG Usage"
              className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded text-white focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Category & Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded text-white focus:border-purple-500 focus:outline-none"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Test Prompt</label>
              <button
                onClick={() => setShowFilePicker(!showFilePicker)}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                {showFilePicker ? '✕ Close' : '📁 Insert File'}
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Enter the prompt the model will receive..."
              rows={4}
              className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded text-white focus:border-purple-500 focus:outline-none resize-none font-mono text-sm"
            />
          </div>

          {/* File Picker */}
          {showFilePicker && (
            <div className="p-3 bg-[#0a0a0a] border border-[#3d3d3d] rounded max-h-48 overflow-y-auto">
              <div className="text-xs text-gray-500 mb-2">Test Project Files (click to insert path)</div>
              {loadingTree ? (
                <div className="text-gray-500 text-sm">Loading...</div>
              ) : fileTree.length === 0 ? (
                <div className="text-gray-500 text-sm">No test project files found</div>
              ) : (
                <FileTree
                  nodes={fileTree}
                  onSelect={handleInsertFile}
                  selectedPath={null}
                  expanded={expandedDirs}
                  onToggle={toggleDir}
                />
              )}
            </div>
          )}

          {/* Expected Tool */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Expected Tool</label>
            <select
              value={expectedTool}
              onChange={e => setExpectedTool(e.target.value)}
              className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded text-white focus:border-purple-500 focus:outline-none"
            >
              {EXPECTED_TOOLS.map(tool => (
                <option key={tool.id} value={tool.id}>{tool.name}</option>
              ))}
            </select>
          </div>

          {/* Expected Behavior */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Expected Behavior (optional)</label>
            <textarea
              value={expectedBehavior}
              onChange={e => setExpectedBehavior(e.target.value)}
              placeholder="Describe what the model should do..."
              rows={2}
              className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded text-white focus:border-purple-500 focus:outline-none resize-none text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#2d2d2d]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : (editingTest ? 'Update Test' : 'Create Test')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestEditor;

