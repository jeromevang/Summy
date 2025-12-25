import React from 'react';
import { Bot, Cpu, AlertTriangle, ShieldAlert } from 'lucide-react';

interface SwarmModel {
    id: string;
    role: 'main' | 'executor' | 'specialist';
    status: 'active' | 'busy' | 'disqualified';
    vramUsage?: number;
    disqualificationReason?: string;
}

interface SwarmStatusProps {
    models: SwarmModel[];
    totalVram: number;
    usedVram: number;
}

export const SwarmStatus: React.FC<SwarmStatusProps> = ({ models, totalVram, usedVram }) => {

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'main': return <Bot className="w-5 h-5 text-yellow-400" />;
            case 'executor': return <Cpu className="w-5 h-5 text-blue-400" />;
            default: return <Bot className="w-5 h-5 text-gray-400" />;
        }
    };

    return (
        <div className="bg-[#1a1a1a] rounded-xl border border-[#2d2d2d] p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Swarm Cluster
                </h3>
                <div className="text-xs text-gray-400">
                    VRAM: {usedVram}GB / {totalVram}GB
                </div>
            </div>

            <div className="space-y-3">
                {models.map(model => (
                    <div
                        key={model.id}
                        className={`relative p-3 rounded-lg border ${model.status === 'disqualified'
                                ? 'bg-red-900/20 border-red-800'
                                : 'bg-[#252525] border-[#333]'
                            }`}
                    >
                        {/* Disqualified Badge */}
                        {model.status === 'disqualified' && (
                            <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
                                <ShieldAlert className="w-3 h-3" />
                                BANNED (Protocol X)
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${model.role === 'main' ? 'bg-yellow-500/10' : 'bg-blue-500/10'
                                    }`}>
                                    {getRoleIcon(model.role)}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-white flex items-center gap-2">
                                        {model.id}
                                        {model.role === 'main' && (
                                            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 rounded uppercase tracking-wider">
                                                Leader
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${model.status === 'active' ? 'bg-green-500' :
                                                model.status === 'busy' ? 'bg-blue-400' : 'bg-red-500'
                                            }`} />
                                        {model.status.toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="text-right">
                                <div className="text-xs text-gray-400">VRAM</div>
                                <div className="text-sm font-mono text-white">{model.vramUsage || '-'}GB</div>
                            </div>
                        </div>

                        {/* Disqualification Reason */}
                        {model.disqualificationReason && (
                            <div className="mt-2 pt-2 border-t border-red-800/30 text-xs text-red-400 flex items-start gap-1.5">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                {model.disqualificationReason}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
