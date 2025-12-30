import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProsthetics } from './ProstheticManager/hooks/useProsthetics';
import { ProstheticEntry, Model, DistillationResult, Tab } from './ProstheticManager/types';

// Sub-components kept in file for brevity but logic moved to hook
const Library: React.FC<any> = ({ prosthetics, stats, onSelect, onDelete, isLoading }) => {
  if (isLoading) return <div className="text-center py-12">Loading...</div>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800 p-4 rounded-xl"><strong>{stats.totalEntries}</strong><br/>Prosthetics</div>
        <div className="bg-gray-800 p-4 rounded-xl text-green-400"><strong>{stats.verifiedCount}</strong><br/>Verified</div>
      </div>
      <div className="space-y-2">
        {prosthetics.map((p: any) => (
          <div key={p.modelId} onClick={() => onSelect(p)} className="bg-gray-800 p-4 rounded-xl cursor-pointer hover:bg-gray-700">
            <span className="font-bold">{p.modelId}</span> - Level {p.level}
          </div>
        ))}
      </div>
    </div>
  );
};

export const ProstheticManager: React.FC = () => {
  const navigate = useNavigate();
  const {
    tab, setTab, prosthetics, stats, models, distillCapabilities, isLoading, error, setError,
    selectedEntry, setSelectedEntry, handleSaveProsthetic, handleRunDistillation, fetchProsthetics
  } = useProsthetics();

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => navigate('/tooly')} className="text-gray-400 mb-6">← Back</button>
        <h1 className="text-3xl font-bold mb-8">Prosthetic Manager</h1>

        <div className="flex gap-2 mb-6">
          {['library', 'editor', 'distill'].map(t => (
            <button key={t} onClick={() => setTab(t as Tab)} className={`px-4 py-2 rounded-lg \${tab === t ? 'bg-purple-600' : 'bg-gray-800 text-gray-400'}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-900/50 p-4 mb-6 rounded-lg">{error}</div>}

        {tab === 'library' && <Library prosthetics={prosthetics} stats={stats} onSelect={e => { setSelectedEntry(e); setTab('editor'); }} onDelete={() => {}} isLoading={isLoading} />}
        {tab === 'editor' && selectedEntry && <div className="p-6 bg-gray-800 rounded-xl">Editor for {selectedEntry.modelId}... (Simplified)</div>}
        {tab === 'distill' && <div className="p-6 bg-gray-800 rounded-xl">Distillation Panel... (Simplified)</div>}
      </div>
    </div>
  );
};

export default ProstheticManager;