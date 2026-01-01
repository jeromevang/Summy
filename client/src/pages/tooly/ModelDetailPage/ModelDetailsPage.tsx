import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CapabilityRadar } from '@/components/charts/CapabilityRadar';
import { ContextDegradationCurve } from '@/components/charts/ContextDegradationCurve';
import { useToolyApi } from '../hooks/useToolyApi';
import { Model } from '../types'; // Corrected import path and type name

// Mock data for Capability Radar
const mockCapabilityData = [
  { skill: 'Reasoning', score: 90, fullMark: 100 },
  { skill: 'Coding', score: 85, fullMark: 100 },
  { skill: 'Summarization', score: 70, fullMark: 100 },
  { skill: 'Tool Use', score: 75, fullMark: 100 },
  { skill: 'Creativity', score: 60, fullMark: 100 },
  { skill: 'Safety', score: 95, fullMark: 100 },
];

// Mock data for Context Degradation Curve
const mockDegradationData = [
  { contextLength: 0, performance: 100 },
  { contextLength: 1000, performance: 98 },
  { contextLength: 4000, performance: 95 },
  { contextLength: 8000, performance: 90 },
  { contextLength: 16000, performance: 80 },
  { contextLength: 32000, performance: 65 },
  { contextLength: 64000, performance: 40 },
  { contextLength: 128000, performance: 20 },
];

const ModelDetailsPage: React.FC = () => {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const api = useToolyApi({ 
    setLoading: setLoading, // Pass setLoading to useToolyApi
    // ... other setters from useToolyApi or create a dedicated hook
  });

  useEffect(() => {
    const fetchModelDetails = async () => {
      setLoading(true);
      // In a real scenario, this would call an API to fetch details for modelId
      // For now, let's simulate fetching from the models list
      const allModels = await api.fetchModels(); // Assuming fetchModels returns all models
      const selectedModel = allModels.find((m: Model) => m.id === modelId);
      setModel(selectedModel || null);
      setLoading(false);
    };

    if (modelId) {
      fetchModelDetails();
    }
  }, [modelId, api]); // Include api in dependencies

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-obsidian">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-purple"></div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="text-center py-12 bg-obsidian min-h-screen">
        <p className="text-gray-400">Model not found.</p>
        <button
          onClick={() => navigate('/tooly')}
          className="mt-4 px-4 py-2 bg-cyber-purple hover:bg-cyber-purple/80 text-white rounded-lg"
        >
          Back to Models
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-obsidian text-white flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/tooly')}
            className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{model.displayName || model.id}</h1>
            <p className="text-sm text-white/50">{model.provider}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 flex-1">
        <CapabilityRadar data={mockCapabilityData} modelName={model.displayName || model.id} />
        <ContextDegradationCurve data={mockDegradationData} modelName={model.displayName || model.id} />
      </div>

      {/* Add more model details here */}
      <div className="mt-6 p-6 bg-obsidian-panel border border-white/5 rounded-xl shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-4">Model Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm text-white/70">
          <div>
            <p><span className="font-medium text-white/90">Provider:</span> {model.provider}</p>
            <p><span className="font-medium text-white/90">Family:</span> {model.modelFamily || 'N/A'}</p>
            <p><span className="font-medium text-white/90">Context Window:</span> {model.contextWindow || 'N/A'} tokens</p>
          </div>
          <div>
            <p><span className="font-medium text-white/90">Supports Tools:</span> {model.supportsTools ? 'Yes' : 'No'}</p>
            <p><span className="font-medium text-white/90">Free Tier:</span> {model.freeTier ? 'Yes' : 'No'}</p>
            <p><span className="font-medium text-white/90">Agentic Score:</span> {model.score || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelDetailsPage;
