import React from 'react';
import TestEditor from '../../../components/TestEditor';
import type { CustomTest } from '../../../components/TestEditor';

interface TestsTabProps {
  customTests: any[];
  builtInTests: any[];
  testCategoryFilter: string;
  setTestCategoryFilter: (filter: string) => void;
  testSearchFilter: string;
  setTestSearchFilter: (filter: string) => void;
  selectedTest: any | null;
  setSelectedTest: (test: any | null) => void;
  testResult: any | null;
  setTestResult: (result: any | null) => void;
  tryingTest: boolean;
  testEditorOpen: boolean;
  setTestEditorOpen: (open: boolean) => void;
  editingTest: CustomTest | null;
  setEditingTest: (test: CustomTest | null) => void;
  mainModelId: string;
  handleTryTest: (test: any) => Promise<void>;
  handleDeleteTest: (testId: string) => Promise<void>;
  handleSaveTest: (test: CustomTest) => Promise<void>;
}

export const TestsTab: React.FC<TestsTabProps> = ({
  customTests,
  builtInTests,
  testCategoryFilter,
  setTestCategoryFilter,
  testSearchFilter,
  setTestSearchFilter,
  selectedTest,
  setSelectedTest,
  testResult,
  setTestResult,
  tryingTest,
  testEditorOpen,
  setTestEditorOpen,
  editingTest,
  setEditingTest,
  mainModelId,
  handleTryTest,
  handleDeleteTest,
  handleSaveTest,
}) => {
  const filteredCustomTests = customTests
    .filter(t => testCategoryFilter === 'all' || t.category === testCategoryFilter)
    .filter(t => !testSearchFilter || t.name.toLowerCase().includes(testSearchFilter.toLowerCase()) || t.prompt.toLowerCase().includes(testSearchFilter.toLowerCase()));

  const filteredBuiltInTests = builtInTests
    .filter(t => testCategoryFilter === 'all' || t.category === testCategoryFilter)
    .filter(t => !testSearchFilter || t.name.toLowerCase().includes(testSearchFilter.toLowerCase()) || t.prompt.toLowerCase().includes(testSearchFilter.toLowerCase()));

  return (
    <>
      <div className="flex gap-4 h-[calc(100vh-280px)]">
        {/* Left: Test List */}
        <div className="w-1/2 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Tests</h3>
            <button
              onClick={() => { setEditingTest(null); setTestEditorOpen(true); }}
              className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded"
            >
              + New Test
            </button>
          </div>
          
          {/* Filters */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={testSearchFilter}
              onChange={e => setTestSearchFilter(e.target.value)}
              placeholder="Search..."
              className="flex-1 px-2 py-1 text-xs bg-[#2d2d2d] border border-[#3d3d3d] rounded text-gray-300 focus:border-purple-500 focus:outline-none"
            />
            <select
              value={testCategoryFilter}
              onChange={e => setTestCategoryFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-[#2d2d2d] border border-[#3d3d3d] rounded text-gray-300 focus:border-purple-500 focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="custom">Custom</option>
              <option value="3.x">Strategic RAG</option>
              <option value="4.x">Architectural</option>
              <option value="5.x">Navigation</option>
              <option value="6.x">Helicopter</option>
              <option value="7.x">Proactive</option>
              <option value="8.x">Intent</option>
            </select>
          </div>
          
          {/* Test List */}
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
            {/* Custom Tests */}
            {filteredCustomTests.map(test => (
              <div
                key={test.id}
                onClick={() => { setSelectedTest(test); setTestResult(null); }}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedTest?.id === test.id 
                    ? 'border-purple-500 bg-purple-500/10' 
                    : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{test.name}</p>
                    <p className="text-gray-500 text-xs">📝 Custom • {test.category}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <span className={`px-1.5 py-0.5 text-xs rounded ${
                      test.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                      test.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {test.difficulty}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingTest(test); setTestEditorOpen(true); }}
                      className="p-1 text-gray-400 hover:text-white"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteTest(test.id); }}
                      className="p-1 text-gray-400 hover:text-red-400"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <p className="text-gray-400 text-xs mt-1 truncate">{test.prompt}</p>
              </div>
            ))}
            
            {/* Built-in Tests */}
            {filteredBuiltInTests.map(test => (
              <div
                key={test.id}
                onClick={() => { setSelectedTest(test); setTestResult(null); }}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedTest?.id === test.id 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-[#2d2d2d] hover:border-[#3d3d3d]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{test.name}</p>
                    <p className="text-gray-500 text-xs">{test.categoryIcon} {test.categoryName}</p>
                  </div>
                  <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                    built-in
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-1 truncate">{test.prompt}</p>
              </div>
            ))}
            
            {customTests.length === 0 && builtInTests.length === 0 && (
              <p className="text-gray-500 text-center py-8">No tests found</p>
            )}
          </div>
        </div>
        
        {/* Right: Test Details / Chat */}
        <div className="w-1/2 flex flex-col border-l border-[#2d2d2d] pl-4">
          {selectedTest ? (
            <>
              {/* Test Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedTest.name}</h3>
                  <p className="text-gray-500 text-sm">
                    {selectedTest.categoryIcon || '📝'} {selectedTest.categoryName || selectedTest.category}
                    {selectedTest.expectedTool && ` • Expected: ${selectedTest.expectedTool}`}
                  </p>
                </div>
                <button
                  onClick={() => handleTryTest(selectedTest)}
                  disabled={tryingTest || !mainModelId}
                  className={`px-4 py-2 text-sm rounded transition-colors ${
                    tryingTest 
                      ? 'bg-gray-600 text-gray-300' 
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  } disabled:opacity-50`}
                >
                  {tryingTest ? '⏳ Running...' : '▶️ Try Test'}
                </button>
              </div>
              
              {/* Test Prompt */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1 block">Prompt</label>
                <div className="p-3 bg-[#1a1a1a] border border-[#2d2d2d] rounded text-sm text-gray-300 font-mono">
                  {selectedTest.prompt}
                </div>
              </div>
              
              {/* Expected Behavior */}
              {selectedTest.expectedBehavior && (
                <div className="mb-4">
                  <label className="text-xs text-gray-500 mb-1 block">Expected Behavior</label>
                  <div className="p-3 bg-[#1a1a1a] border border-[#2d2d2d] rounded text-sm text-gray-400">
                    {selectedTest.expectedBehavior}
                  </div>
                </div>
              )}
              
              {/* Test Result */}
              {testResult && (
                <div className="flex-1 overflow-y-auto">
                  <label className="text-xs text-gray-500 mb-1 block">Result</label>
                  {testResult.error ? (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                      {testResult.error}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Tool Calls */}
                      {testResult.result?.toolCalls?.length > 0 && (
                        <div>
                          <span className="text-xs text-gray-500">Tool Calls:</span>
                          {testResult.result.toolCalls.map((tc: any, i: number) => (
                            <div key={i} className="mt-1 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-xs">
                              <span className="text-purple-400">{tc.function?.name || tc.name}</span>
                              {tc.function?.arguments && (
                                <pre className="mt-1 text-gray-400 overflow-x-auto">
                                  {typeof tc.function.arguments === 'string' 
                                    ? tc.function.arguments 
                                    : JSON.stringify(tc.function.arguments, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Response Content */}
                      {testResult.result?.content && (
                        <div>
                          <span className="text-xs text-gray-500">Response:</span>
                          <div className="mt-1 p-3 bg-[#1a1a1a] border border-[#2d2d2d] rounded text-sm text-gray-300 whitespace-pre-wrap">
                            {testResult.result.content}
                          </div>
                        </div>
                      )}
                      
                      {/* Model Info */}
                      <div className="text-xs text-gray-500">
                        Model: {testResult.result?.model}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a test to view details
            </div>
          )}
        </div>
      </div>
      
      {/* Test Editor Modal */}
      <TestEditor
        isOpen={testEditorOpen}
        onClose={() => { setTestEditorOpen(false); setEditingTest(null); }}
        onSave={handleSaveTest}
        editingTest={editingTest}
      />
    </>
  );
};

