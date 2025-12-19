import React, { useState, useEffect } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';

const ServerStatus: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [websocketStatus, setWebsocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [mcpStatus, setMcpStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [lmstudioStatus, setLmstudioStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [isStarting, setIsStarting] = useState(false);

  // All status updates come via WebSocket - no polling!
  useEffect(() => {
    const ws = new ReconnectingWebSocket('ws://localhost:3001');

    ws.onopen = () => {
      setWebsocketStatus('connected');
      setServerStatus('online');
    };

    ws.onclose = () => {
      setWebsocketStatus('disconnected');
      setServerStatus('offline');
      setMcpStatus('disconnected');
      setLmstudioStatus('disconnected');
    };

    ws.onerror = () => {
      setWebsocketStatus('disconnected');
      setServerStatus('offline');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'status') {
          const data = message.data;
          // Update all status from WebSocket message
          setServerStatus(data.server === 'online' ? 'online' : 'offline');
          setWebsocketStatus(data.websocket === 'connected' ? 'connected' : 'disconnected');
          setMcpStatus(data.mcp === 'connected' ? 'connected' : 'disconnected');
          setLmstudioStatus(data.lmstudio === 'connected' ? 'connected' : 'disconnected');
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const startServer = async () => {
    setIsStarting(true);
    try {
      const instructions = `
To start the server, open a new terminal and run one of these commands:

📁 Navigate to your Summy project folder first, then:

For Windows (Command Prompt):
cd server && npm run dev

For Windows (PowerShell):
.\\start-server.ps1

For Mac/Linux:
cd server && npm run dev

Then refresh this page to see the server status change to Online.

The server will run on: http://localhost:3001
      `.trim();

      alert(instructions);
    } catch (error) {
      console.error('Failed to show start instructions:', error);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex items-center space-x-3">
      {/* Server status */}
      <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-[#2d2d2d]">
        <div className={`w-1.5 h-1.5 rounded-full ${
          serverStatus === 'online' ? 'bg-green-400' :
          serverStatus === 'offline' ? 'bg-red-400' : 'bg-gray-400 animate-pulse'
        }`}></div>
        <span className={`text-xs font-medium ${
          serverStatus === 'online' ? 'text-green-400' :
          serverStatus === 'offline' ? 'text-red-400' : 'text-gray-400'
        }`}>
          {serverStatus === 'online' ? 'Server' : serverStatus === 'offline' ? 'Offline' : '...'}
        </span>
      </div>

      {/* WebSocket status */}
      <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-[#2d2d2d]">
        <div className={`w-1.5 h-1.5 rounded-full ${
          websocketStatus === 'connected' ? 'bg-green-400' :
          websocketStatus === 'disconnected' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
        }`}></div>
        <span className={`text-xs font-medium ${
          websocketStatus === 'connected' ? 'text-green-400' :
          websocketStatus === 'disconnected' ? 'text-red-400' : 'text-yellow-400'
        }`}>
          {websocketStatus === 'connected' ? 'WS' : websocketStatus === 'disconnected' ? 'WS ✗' : 'WS...'}
        </span>
      </div>

      {/* MCP status */}
      <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-[#2d2d2d]">
        <div className={`w-1.5 h-1.5 rounded-full ${
          mcpStatus === 'connected' ? 'bg-green-400' : 'bg-gray-500'
        }`}></div>
        <span className={`text-xs font-medium ${
          mcpStatus === 'connected' ? 'text-green-400' : 'text-gray-500'
        }`}>
          MCP
        </span>
      </div>

      {/* LM Studio status */}
      <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-[#2d2d2d]">
        <div className={`w-1.5 h-1.5 rounded-full ${
          lmstudioStatus === 'connected' ? 'bg-green-400' : 'bg-gray-500'
        }`}></div>
        <span className={`text-xs font-medium ${
          lmstudioStatus === 'connected' ? 'text-green-400' : 'text-gray-500'
        }`}>
          LMS
        </span>
      </div>

      {serverStatus === 'offline' && (
        <button
          onClick={startServer}
          disabled={isStarting}
          className="px-2 py-1 text-xs bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 disabled:opacity-50 transition-colors"
        >
          {isStarting ? '...' : '▶ Start'}
        </button>
      )}
    </div>
  );
};

export default ServerStatus;
