import React, { useState, useEffect } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';

interface SpanEvent {
  traceId: string;
  spanId?: string;
  operation?: string;
  durationMs?: number;
  status?: 'running' | 'success' | 'error';
  attributes?: Record<string, any>;
}

interface ObservabilityPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const ObservabilityPanel: React.FC<ObservabilityPanelProps> = ({ isOpen, onToggle }) => {
  const [spans, setSpans] = useState<SpanEvent[]>([]);
  const [activeTrace, setActiveTrace] = useState<string | null>(null);
  
  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${window.location.hostname}:3001`);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        
        if (message.type === 'trace_start') {
          setActiveTrace(message.payload.traceId);
          setSpans([{ 
            traceId: message.payload.traceId, 
            operation: 'trace_start', 
            attributes: { modelId: message.payload.modelId }
          }]);
        } else if (message.type === 'span_start') {
          setSpans(prev => [...prev, {
            traceId: message.payload.traceId,
            spanId: message.payload.spanId,
            operation: message.payload.operation,
            status: 'running',
            attributes: message.payload.attributes
          }]);
        } else if (message.type === 'span_end') {
          setSpans(prev => prev.map(s => 
            s.spanId === message.payload.spanId 
              ? { ...s, durationMs: message.payload.durationMs, status: message.payload.status }
              : s
          ));
        } else if (message.type === 'trace_end') {
          setActiveTrace(null);
          setSpans(prev => [...prev, {
            traceId: message.payload.traceId,
            operation: 'trace_end',
            durationMs: message.payload.totalDurationMs,
            status: 'success'
          }]);
        }
      } catch {
        // Ignore parse errors
      }
    };
    
    return () => ws.close();
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-cyan-500 transition-colors flex items-center gap-2"
      >
        <span className={activeTrace ? 'animate-pulse text-green-400' : ''}>🔍</span>
        Observability {spans.length > 0 && `(\${spans.length})`}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800">
        <h4 className="font-medium text-white flex items-center gap-2">
          🔍 Trace Log
          {activeTrace && <span className="animate-pulse text-green-400 text-xs">● LIVE</span>}
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSpans([])}
            className="text-xs text-gray-500 hover:text-white"
          >
            Clear
          </button>
          <button onClick={onToggle} className="text-gray-400 hover:text-white">✕</button>
        </div>
      </div>
      
      <div className="max-h-80 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {spans.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No traces yet. Run an assessment to see spans.</div>
        ) : (
          spans.map((span, i) => (
            <div
              key={i}
              className={`px-2 py-1 rounded \${
                span.operation === 'trace_start' ? 'bg-blue-500/20 text-blue-400' :
                span.operation === 'trace_end' ? 'bg-green-500/20 text-green-400' :
                span.status === 'running' ? 'bg-yellow-500/10 text-yellow-400' :
                span.status === 'error' ? 'bg-red-500/10 text-red-400' :
                'bg-gray-800/50 text-gray-400'
              }`}
            >
              <div className="flex justify-between">
                <span>{span.operation}</span>
                {span.durationMs && <span className="text-gray-500">{span.durationMs}ms</span>}
              </div>
              {span.attributes && Object.keys(span.attributes).length > 0 && (
                <div className="text-gray-500 text-xs truncate">
                  {Object.entries(span.attributes).map(([k, v]) => `\${k}=\${JSON.stringify(v)}`).join(' ')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
