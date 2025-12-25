import React from 'react';
import {
    Search, Brain, Scale, Zap, CheckCircle, Save,
    ArrowRight, Activity, Terminal
} from 'lucide-react';

export type CognitiveStep = 'search' | 'understand' | 'decide' | 'act' | 'verify' | 'persist' | 'idle';

interface IntentCard {
    strategy: 'refactor' | 'patch' | 'investigate';
    risk: 'high' | 'medium' | 'low';
    reasoning: string;
}

interface CognitiveHUDProps {
    currentStep: CognitiveStep;
    intent?: IntentCard;
    logs: string[];
    mentalModelSummary?: {
        constraints: string[];
        relevantFiles: number;
    };
}

const STEPS = [
    { id: 'search', label: 'Search', icon: Search, color: 'text-blue-400' },
    { id: 'understand', label: 'Understand', icon: Brain, color: 'text-purple-400' },
    { id: 'decide', label: 'Decide', icon: Scale, color: 'text-yellow-400' },
    { id: 'act', label: 'Act', icon: Zap, color: 'text-orange-400' },
    { id: 'verify', label: 'Verify', icon: CheckCircle, color: 'text-green-400' },
    { id: 'persist', label: 'Persist', icon: Save, color: 'text-gray-400' },
];

export const CognitiveHUD: React.FC<CognitiveHUDProps> = ({
    currentStep,
    intent,
    logs,
    mentalModelSummary
}) => {

    const getStepIndex = (step: string) => STEPS.findIndex(s => s.id === step);
    const currentIndex = getStepIndex(currentStep);

    return (
        <div className="space-y-6">

            {/* 1. Step Progress Bar */}
            <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-6 relative overflow-hidden">
                {/* Connecting Line */}
                <div className="absolute top-12 left-10 right-10 h-0.5 bg-[#333]" />
                <div
                    className="absolute top-12 left-10 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 transition-all duration-500"
                    style={{ width: `${Math.max(0, (currentIndex / (STEPS.length - 1)) * 100 - 5)}%` }} // -5 padding
                />

                <div className="relative flex justify-between">
                    {STEPS.map((step, idx) => {
                        const isActive = idx === currentIndex && currentStep !== 'idle';
                        const isCompleted = idx < currentIndex;
                        const Icon = step.icon;

                        return (
                            <div key={step.id} className="flex flex-col items-center gap-3">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${isActive
                                        ? 'bg-[#2a2a2a] border-2 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)] scale-110'
                                        : isCompleted
                                            ? 'bg-[#2a2a2a] border border-gray-600 text-gray-400'
                                            : 'bg-[#1a1a1a] border border-[#333] text-[#333]'
                                    }`}>
                                    <Icon className={`w-5 h-5 ${isActive || isCompleted ? step.color : 'text-[#333]'}`} />
                                </div>
                                <span className={`text-xs font-medium transition-colors ${isActive ? 'text-white' : isCompleted ? 'text-gray-400' : 'text-[#333]'
                                    }`}>
                                    {step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: Intent Card (Decision Engine) */}
                <div className="lg:col-span-1">
                    <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-0 overflow-hidden h-full flex flex-col">
                        <div className="p-4 border-b border-[#2d2d2d] bg-[#252525]">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <Scale className="w-4 h-4 text-yellow-400" />
                                Intent Engine
                            </h3>
                        </div>

                        <div className="p-4 flex-1">
                            {intent ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-gray-500">Strategy</div>
                                        <div className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-mono uppercase">
                                            {intent.strategy}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-gray-500">Risk Profile</div>
                                        <div className={`px-2 py-1 rounded text-xs font-mono uppercase ${intent.risk === 'high' ? 'bg-red-500/20 text-red-400' :
                                                intent.risk === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-green-500/20 text-green-400'
                                            }`}>
                                            {intent.risk}
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-[#333]">
                                        <div className="text-xs text-gray-500 mb-2">Reasoning</div>
                                        <div className="text-sm text-gray-300 italic leading-relaxed">
                                            "{intent.reasoning}"
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2">
                                    <Activity className="w-8 h-8 opacity-20" />
                                    <span className="text-xs">Waiting for Decision...</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Though Stream + Mental Model */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Mental Model Preview */}
                    {stepActiveOrDone(currentStep, 'understand') && mentalModelSummary && (
                        <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4 flex items-center gap-6 animate-fade-in">
                            <div className="flex items-center gap-3">
                                <Brain className="w-5 h-5 text-purple-400" />
                                <div>
                                    <div className="text-xs text-gray-500">Mental Model</div>
                                    <div className="text-sm text-white">{mentalModelSummary.relevantFiles} Relevant Files</div>
                                </div>
                            </div>
                            <div className="h-8 w-px bg-[#333]" />
                            <div className="flex-1">
                                <div className="text-xs text-gray-500 mb-1">Active Constraints</div>
                                <div className="flex flex-wrap gap-2">
                                    {mentalModelSummary.constraints.map((c, i) => (
                                        <span key={i} className="text-[10px] bg-[#252525] text-gray-300 px-2 py-0.5 rounded border border-[#333]">
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Thought Stream (Terminal) */}
                    <div className="bg-black rounded-xl border border-[#2d2d2d] overflow-hidden flex flex-col" style={{ minHeight: '300px' }}>
                        <div className="bg-[#1a1a1a] px-4 py-2 border-b border-[#2d2d2d] flex items-center justify-between">
                            <span className="text-xs text-gray-400 flex items-center gap-2">
                                <Terminal className="w-3 h-3" />
                                Cognitive Stream
                            </span>
                            {currentStep !== 'idle' && (
                                <span className="flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                            )}
                        </div>
                        <div className="flex-1 p-4 font-mono text-xs space-y-1 overflow-y-auto max-h-[300px]">
                            {logs.map((log, i) => (
                                <div key={i} className="text-gray-300 border-l-2 border-[#333] pl-2 hover:border-gray-500 transition-colors">
                                    <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                    {log}
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <div className="text-gray-700 italic">System ready. Waiting for task...</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

function stepActiveOrDone(current: CognitiveStep, target: CognitiveStep) {
    if (current === 'idle') return false;
    const idxCurrent = STEPS.findIndex(s => s.id === current);
    const idxTarget = STEPS.findIndex(s => s.id === target);
    return idxCurrent >= idxTarget;
}
