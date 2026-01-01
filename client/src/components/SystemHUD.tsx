import React, { useState, useEffect } from 'react';
import { webSocketManager } from '../hooks/useWebSocketManager';

interface SystemMetric {
  cpu: number;
  gpu: number;
  gpuMemory?: {
    used: number;
    total: number;
    percent: number;
  };
  gpuName?: string;
}

interface SwarmInfo {
  main?: { id: string; name: string };
  executor?: { id: string; name: string };
}

export const SystemHUD: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetric | null>(null);
  const [swarm, setSwarm] = useState<SwarmInfo | null>(null);
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    // 1. WebSocket for real-time metrics
    const ws = webSocketManager.getConnection(`ws://${window.location.hostname}:3001/ws`);
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'system_metrics') {
          setMetrics({
            cpu: message.data.cpu,
            gpu: message.data.gpu,
            gpuMemory: message.data.vramUsedMB ? {
              used: message.data.vramUsedMB,
              total: message.data.vramTotalMB,
              percent: message.data.vramPercent
            } : undefined,
            gpuName: message.data.gpuName
          });
        }
      } catch (e) {
        // Ignore
      }
    };

    const handleOpen = () => setStatus('connected');
    const handleClose = () => setStatus('disconnected');

    ws.addEventListener('message', handleMessage);
    ws.addEventListener('open', handleOpen);
    ws.addEventListener('close', handleClose);

    if (ws.readyState === WebSocket.OPEN) setStatus('connected');

    // 2. Fetch Swarm Status (Low frequency)
    const fetchSwarmStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          if (data.swarm) {
            setSwarm(data.swarm);
          }
        }
      } catch (e) {
        console.error('Failed to fetch swarm status', e);
      }
    };

    fetchSwarmStatus();
    const interval = setInterval(fetchSwarmStatus, 30000); // Check every 30s

    return () => {
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('close', handleClose);
      clearInterval(interval);
    };
  }, []);

  const formatVram = (used?: number, total?: number) => {
    if (!used || !total) return 'N/A';
    return `${(used / 1024).toFixed(1)}GB / ${(total / 1024).toFixed(1)}GB`;
  };

  return (
    <div className="flex items-center gap-6 px-4 py-1.5 bg-white/[0.02] border border-white/5 rounded-full backdrop-blur-md">
      {/* Active Swarm Display */}
      <div className="flex items-center gap-4">
        {swarm?.main ? (
          <div className="flex items-center gap-2 group cursor-help" title={`Main Model: ${swarm.main.name}`}>
            <span className="text-[10px] font-bold text-cyber-purple uppercase tracking-widest">L3</span>
            <span className="text-[10px] font-mono text-white/60 truncate max-w-[80px] group-hover:max-w-none transition-all duration-300">
              {swarm.main.name.split('/').pop()}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 opacity-30">
            <span className="text-[10px] font-bold text-cyber-purple uppercase tracking-widest">L3</span>
            <span className="text-[10px] text-white/60">--</span>
          </div>
        )}

        <div className="h-3 w-[1px] bg-white/5" />

        {swarm?.executor ? (
          <div className="flex items-center gap-2 group cursor-help" title={`Executor Model: ${swarm.executor.name}`}>
            <span className="text-[10px] font-bold text-cyber-cyan uppercase tracking-widest">L2</span>
            <span className="text-[10px] font-mono text-white/60 truncate max-w-[80px] group-hover:max-w-none transition-all duration-300">
              {swarm.executor.name.split('/').pop()}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 opacity-30">
            <span className="text-[10px] font-bold text-cyber-cyan uppercase tracking-widest">L2</span>
            <span className="text-[10px] text-white/60">--</span>
          </div>
        )}
      </div>

      <div className="h-4 w-[1px] bg-white/10 mx-2" />

      {/* CPU */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">CPU</span>
        <div className="w-12 bg-white/5 h-1 rounded-full overflow-hidden">
          <div 
            className="bg-cyber-purple h-full transition-all duration-500" 
            style={{ width: `${metrics?.cpu ?? 0}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-cyber-purple w-7 text-right">
          {Math.round(metrics?.cpu ?? 0)}%
        </span>
      </div>

      <div className="h-3 w-[1px] bg-white/5" />

      {/* GPU */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">GPU</span>
        <div className="w-12 bg-white/5 h-1 rounded-full overflow-hidden">
          <div 
            className="bg-cyber-emerald h-full transition-all duration-500" 
            style={{ width: `${metrics?.gpu ?? 0}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-cyber-emerald w-7 text-right">
          {Math.round(metrics?.gpu ?? 0)}%
        </span>
      </div>

      <div className="h-3 w-[1px] bg-white/5" />

      {/* VRAM */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">VRAM</span>
        <div className="w-16 bg-white/5 h-1 rounded-full overflow-hidden">
          <div 
            className="bg-cyber-amber h-full transition-all duration-500" 
            style={{ width: `${metrics?.gpuMemory?.percent ?? 0}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-cyber-amber w-14 text-right tabular-nums">
          {metrics?.gpuMemory ? `${(metrics.gpuMemory.used / 1024).toFixed(1)}GB` : 'N/A'}
        </span>
      </div>

      {/* Pulse Status */}
      <div className="flex items-center ml-2">
        <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-cyber-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'} animate-pulse`} />
      </div>
    </div>
  );
};
