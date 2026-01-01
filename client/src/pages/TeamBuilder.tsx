import React, { useState, useEffect } from 'react';
import { useModels } from '../hooks/useModels';
import { useTeam, AgentConfig } from '../hooks/useTeam';
import { useToast } from '../components/Toast';

const TeamBuilder: React.FC = () => {
  const { models } = useModels('all');
  const { team, loading: loadingTeam, saving, saveTeam, error: teamError } = useTeam();
  const { addToast } = useToast();
  
  // Team State
  const [mainModel, setMainModel] = useState<string>('');
  const [executorEnabled, setExecutorEnabled] = useState(false);
  const [executorModel, setExecutorModel] = useState<string>('');
  const [agents, setAgents] = useState<AgentConfig[]>([]);

  // Load team config when fetched
  useEffect(() => {
    if (team) {
      setMainModel(team.mainModelId || '');
      setExecutorEnabled(team.executorEnabled);
      setExecutorModel(team.executorModelId || '');
      setAgents(team.agents || []);
    }
  }, [team]);

  // Filter models by capability (mock logic for now - ideally backend provides tags)
  const smartModels = models.filter(m => 
    m.id.toLowerCase().includes('gpt-4') || 
    m.id.toLowerCase().includes('claude') || 
    m.id.toLowerCase().includes('llama-3') ||
    m.id.toLowerCase().includes('qwen')
  );
  
  const codeModels = models.filter(m => 
    m.id.toLowerCase().includes('coder') || 
    m.id.toLowerCase().includes('deepseek') ||
    m.id.toLowerCase().includes('tool')
  );

  const handleAddAgent = () => {
    const id = Date.now().toString();
    setAgents([...agents, { id, name: 'New Agent', role: 'Reviewer', model: '' }]);
  };

  const handleRemoveAgent = (id: string) => {
    setAgents(agents.filter(a => a.id !== id));
  };

  const handleDeploy = async () => {
    if (!mainModel) {
      addToast('Main Architect is required!', 'error');
      return;
    }

    const success = await saveTeam({
      mainModelId: mainModel,
      executorEnabled,
      executorModelId: executorModel,
      agents
    });

    if (success) {
      addToast('Team deployed successfully!', 'success');
    } else {
      addToast('Failed to deploy team.', 'error');
    }
  };

  if (loadingTeam) return <div className="p-6 text-gray-400">Loading team config...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">👥 Team Builder</h1>
          <p className="text-gray-400">Assemble your AI squad: Main Architect, Executors, and Specialists.</p>
        </div>
        <button 
          onClick={handleDeploy}
          disabled={saving}
          className={`px-6 py-2 rounded-lg font-bold text-black transition-all \${
            saving 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/20'
          }`}
        >
          {saving ? 'Deploying...' : 'Deploy Team'}
        </button>
      </div>

      {teamError && <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">{teamError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Architect (Left Col) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-800/50 border border-purple-500/30 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><span className="text-6xl">🧠</span></div>
            <h3 className="text-xl font-bold text-white mb-1">Main Architect</h3>
            <span className="inline-block px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded mb-4">MANDATORY</span>
            
            <p className="text-sm text-gray-400 mb-6">
              The brain of the operation. Holds the master plan, orchestrates tasks, and communicates with you.
            </p>

            <label className="block text-sm font-medium text-gray-300 mb-2">Select Model</label>
            <select 
              value={mainModel} 
              onChange={e => setMainModel(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="">-- Choose Architect --</option>
              {smartModels.map(m => (
                <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
              ))}
              <optgroup label="Other Models">
                {models.filter(m => !smartModels.includes(m)).map(m => (
                  <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Executor (Middle Col) */}
        <div className="lg:col-span-1 space-y-6">
          <div className={`bg-gray-800/50 border rounded-xl p-6 relative overflow-hidden transition-all \${executorEnabled ? 'border-blue-500/30 opacity-100' : 'border-gray-700 opacity-60'}`}>
            <div className="absolute top-0 right-0 p-4 opacity-10"><span className="text-6xl">⚡</span></div>
            
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Executor</h3>
                <span className="inline-block px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">OPTIONAL</span>
              </div>
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={executorEnabled} 
                  onChange={e => setExecutorEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-900" 
                />
              </div>
            </div>
            
            <p className="text-sm text-gray-400 mb-6">
              Specialized in coding and tool use. Receives isolated tasks from the Architect.
            </p>

            <label className="block text-sm font-medium text-gray-300 mb-2">Select Model</label>
            <select 
              value={executorModel} 
              onChange={e => setExecutorModel(e.target.value)}
              disabled={!executorEnabled}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              <option value="">-- Choose Executor --</option>
              {codeModels.map(m => (
                <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
              ))}
              <optgroup label="Other Models">
                {models.filter(m => !codeModels.includes(m)).map(m => (
                  <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Specialists (Right Col) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-800/50 border border-green-500/30 rounded-xl p-6 relative min-h-[300px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🕵️</span> Specialists
              </h3>
              <button onClick={handleAddAgent} className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white">+ Add</button>
            </div>

            <div className="space-y-3">
              {agents.length === 0 && (
                <div className="text-center text-gray-500 py-8 italic border-2 border-dashed border-gray-700 rounded-lg">
                  No specialists assigned.
                </div>
              )}
              
              {agents.map(agent => (
                <div key={agent.id} className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                  <div className="flex justify-between mb-2">
                    <input 
                      value={agent.role}
                      className="bg-transparent text-green-400 font-bold text-sm w-24 focus:outline-none"
                      onChange={e => {
                        const newAgents = [...agents];
                        newAgents.find(a => a.id === agent.id)!.role = e.target.value;
                        setAgents(newAgents);
                      }}
                    />
                    <button onClick={() => handleRemoveAgent(agent.id)} className="text-gray-500 hover:text-red-400">×</button>
                  </div>
                  <select 
                    value={agent.model}
                    onChange={e => {
                      const newAgents = [...agents];
                      newAgents.find(a => a.id === agent.id)!.model = e.target.value;
                      setAgents(newAgents);
                    }}
                    className="w-full bg-black/30 border border-gray-600 rounded text-xs text-white px-2 py-1"
                  >
                    <option value="">Select Model</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamBuilder;
