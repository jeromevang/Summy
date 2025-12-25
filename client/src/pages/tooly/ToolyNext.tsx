import React from 'react';
import { CognitiveHUD } from './components/CognitiveHUD';
import { SwarmStatus } from './components/SwarmStatus';
import { Bot, Terminal, Activity, MonitorPlay } from 'lucide-react';
import type { ToolyState } from './hooks/useToolyState';

interface ToolyNextProps {
    state: ToolyState;
    api: any;
}

export const ToolyNext: React.FC<ToolyNextProps> = ({ state, api }) => {
    // Determine if we are in "Simulation Mode" (Active Testing or Sandbox)
    const isSimulationMode = state.tryingTest || state.testingIntents || state.cognitiveStep !== 'idle' || state.sandboxActive;

    // Filter swarm models for SwarmStatus
    const swarmModels = [
        ...(state.activeMainModel ? [{
            id: state.activeMainModel.id,
            role: 'main' as const,
            status: 'active' as const,
            vramUsage: 12 // Placeholder or fetch from somewhere
        }] : []),
        ...(state.activeExecutorModel ? [{
            id: state.activeExecutorModel.id,
            role: 'executor' as const,
            status: 'active' as const,
            vramUsage: 4 // Placeholder
        }] : [])
    ];

    return (
        <div className={`h-[calc(100vh-80px)] overflow-y-auto pr-2 space-y-6 transition-colors duration-500 ${isSimulationMode ? 'bg-black/40 p-4 rounded-xl border border-green-900/30' : ''
            }`}>

            {/* Header / Top Bar */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className={`text-3xl font-bold flex items-center gap-3 transition-colors ${isSimulationMode ? 'text-green-500 font-mono' : 'text-white'
                        }`}>
                        {isSimulationMode ? (
                            <Activity className="w-8 h-8 animate-pulse text-green-500" />
                        ) : (
                            <BrainIcon className="w-8 h-8 text-purple-500" />
                        )}
                        Tooly <span className={isSimulationMode ? 'text-green-400 opacity-80' : 'text-purple-500'}>
                            {isSimulationMode ? 'SIMULATION_LAB' : 'Mission Control'}
                        </span>
                    </h1>
                    <p className={`mt-1 font-mono text-sm ${isSimulationMode ? 'text-green-700' : 'text-gray-400'}`}>
                        {isSimulationMode ? '> SYSTEM PROTOCOLS: ACTIVE_TRACING' : 'Cognitive Agent Orchestrator'}
                    </p>
                </div>

                {/* Mode Switcher */}
                <div className="flex gap-4">
                    {/* Sandbox Toggle */}
                    <div className="bg-[#1a1a1a] rounded-lg p-1 border border-[#2d2d2d] flex items-center gap-1">
                        <button
                            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-all ${state.sandboxActive
                                ? 'bg-green-900/40 text-green-400 border border-green-500/50'
                                : 'text-gray-400 hover:text-white'
                                }`}
                            onClick={() => state.sandboxActive ? api.exitSandbox() : api.enterSandbox()}
                        >
                            <Terminal className="w-4 h-4" />
                            {state.sandboxActive ? 'Exit Sandbox' : 'Enter Sandbox'}
                        </button>
                    </div>

                    <div className="bg-[#1a1a1a] rounded-lg p-1 border border-[#2d2d2d] flex items-center gap-1">
                        <button
                            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-all ${!state.legacyMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-[#252525]'}`}
                            onClick={() => state.setLegacyMode(false)}
                        >
                            <MonitorPlay className="w-4 h-4" />
                            Live View
                        </button>
                        <button
                            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-all ${state.legacyMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-[#252525]'}`}
                            onClick={() => state.setLegacyMode(true)}
                        >
                            <Terminal className="w-4 h-4" />
                            Legacy
                        </button>
                    </div>
                </div>
            </div>

            {/* Cognitive HUD (The Brain) */}
            <section className={`transition-all duration-500 ${isSimulationMode ? 'scale-[1.01]' : ''}`}>
                <div className="flex items-center gap-2 mb-4">
                    <Activity className={`w-5 h-5 ${isSimulationMode ? 'text-green-500 animate-spin-slow' : 'text-blue-400'}`} />
                    <h2 className={`text-lg font-semibold ${isSimulationMode ? 'text-green-400 tracking-widest' : 'text-white'}`}>
                        {isSimulationMode ? 'COGNITIVE_TRACE_LOG' : 'Cognitive Loop'}
                    </h2>
                </div>
                <CognitiveHUD
                    currentStep={state.cognitiveStep}
                    intent={state.intentCard}
                    logs={state.cognitiveLogs}
                    mentalModelSummary={state.mentalModelSummary}
                />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Swarm Status (The Body) */}
                <div className="lg:col-span-1">
                    <SwarmStatus
                        models={swarmModels}
                        totalVram={24} // TODO: Fetch from hardware info
                        usedVram={swarmModels.reduce((acc, m) => acc + (m.vramUsage || 0), 0)}
                    />
                </div>

                {/* Quick Actions / Controls */}
                <div className={`lg:col-span-2 rounded-xl border p-6 transition-colors ${isSimulationMode
                    ? 'bg-black/60 border-green-900/40'
                    : 'bg-[#1a1a1a] border-[#2d2d2d]'
                    }`}>
                    <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${isSimulationMode ? 'text-green-400' : 'text-white'
                        }`}>
                        <Terminal className="w-5 h-5 opacity-70" />
                        Command Line
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 hover:bg-red-900/50 transition-colors text-left"
                            onClick={() => {
                                console.log('Emergency Stop Triggered');
                            }}
                        >
                            <div className="font-semibold text-sm mb-1">Emergency Halt</div>
                            <div className="text-xs opacity-70">Terminate all active agents immediately</div>
                        </button>
                        <button
                            className="p-3 bg-blue-900/30 border border-blue-800 rounded-lg text-blue-300 hover:bg-blue-900/50 transition-colors text-left"
                            onClick={() => {
                                console.log('Memory Dump Triggered');
                            }}
                        >
                            <div className="font-semibold text-sm mb-1">Force Memory Dump</div>
                            <div className="text-xs opacity-70">Persist current short-term memory to disk</div>
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};

// Simple Brain Icon component
const BrainIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
);
