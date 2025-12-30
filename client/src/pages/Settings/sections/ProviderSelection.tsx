import React from 'react';
import { ServerSettings } from '../types';

interface ProviderSelectionProps {
  currentProvider: string;
  onChange: (provider: any) => void;
}

export const ProviderSelection: React.FC<ProviderSelectionProps> = ({ currentProvider, onChange }) => {
  const providers = [
    { value: 'openai', label: 'OpenAI', icon: '🌐', desc: 'GPT-4, GPT-4o, etc.' },
    { value: 'azure', label: 'Azure OpenAI', icon: '☁️', desc: 'Azure-hosted models' },
    { value: 'lmstudio', label: 'LM Studio', icon: '💻', desc: 'Local models' },
    { value: 'openrouter', label: 'OpenRouter', icon: '🚀', desc: 'Free multi-provider models' }
  ];

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">🔌 LLM Provider</h4>
      <div className="grid grid-cols-2 gap-3">
        {providers.map(p => (
          <button key={p.value} type="button" onClick={() => onChange(p.value)} className={`p-4 rounded-lg border text-left transition-all \${currentProvider === p.value ? 'border-purple-500 bg-purple-500/10' : 'border-[#3d3d3d] bg-[#0d0d0d]'}`}>
            <div className="text-2xl mb-1">{p.icon}</div>
            <div className="font-medium text-white">{p.label}</div>
            <div className="text-xs text-gray-500">{p.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
