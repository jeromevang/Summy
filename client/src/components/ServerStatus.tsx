import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReconnectingWebSocket from 'reconnecting-websocket';

const ServerStatus: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [websocketStatus, setWebsocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isStarting, setIsStarting] = useState(false);

  // WebSocket connection
  useEffect(() => {
    const ws = new ReconnectingWebSocket('ws://localhost:3001');

    ws.onopen = () => {
      setWebsocketStatus('connected');
    };

    ws.onclose = () => {
      setWebsocketStatus('disconnected');
    };

    ws.onerror = () => {
      setWebsocketStatus('disconnected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'status') {
          // Server sends connection status
          setWebsocketStatus(message.data.websocket === 'connected' ? 'connected' : 'disconnected');
          setServerStatus(message.data.server === 'online' ? 'online' : 'offline');
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const checkServerStatus = async () => {
    try {
      await axios.get('http://localhost:3001/health', { timeout: 2000 });
      setServerStatus('online');
    } catch {
      setServerStatus('offline');
    }
  };

  const startServer = async () => {
    setIsStarting(true);
    try {
      // Show clear instructions since browser can't start system processes
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

      // Create a simple dialog with copyable commands
      if (window.confirm) {
        alert(instructions);
      } else {
        // Fallback for browsers without confirm
        alert('Open a terminal in your Summy project folder and run:\n\ncd server && npm run dev\n\nThen refresh this page.');
      }
    } catch (error) {
      console.error('Failed to show start instructions:', error);
    } finally {
      setIsStarting(false);
    }
  };

  const stopServer = async () => {
    try {
      const confirmed = confirm(
        'This will kill all Node.js processes. Make sure to save your work first.\n\nContinue?'
      );

      if (confirmed) {
        alert('Run this command in a terminal to stop all Node processes:\n\nnpm run kill\n\nOr manually: taskkill /F /IM node.exe /T');
      }
    } catch (error) {
      console.error('Failed to stop server:', error);
    }
  };

  useEffect(() => {
    checkServerStatus();
    const interval = setInterval(checkServerStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (serverStatus) {
      case 'online': return 'text-green-600';
      case 'offline': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (serverStatus) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      default: return 'Checking...';
    }
  };

  const getWebsocketColor = () => {
    switch (websocketStatus) {
      case 'connected': return 'text-green-600';
      case 'disconnected': return 'text-red-600';
      default: return 'text-yellow-500';
    }
  };

  const getWebsocketText = () => {
    switch (websocketStatus) {
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      default: return 'Connecting...';
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${
          serverStatus === 'online' ? 'bg-green-500' :
          serverStatus === 'offline' ? 'bg-red-500' : 'bg-gray-400 animate-pulse'
        }`}></div>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          Server: {getStatusText()}
        </span>
      </div>

      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${
          websocketStatus === 'connected' ? 'bg-green-500' :
          websocketStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-400 animate-pulse'
        }`}></div>
        <span className={`text-sm font-medium ${getWebsocketColor()}`}>
          WebSocket: {getWebsocketText()}
        </span>
      </div>

      {serverStatus === 'offline' && (
        <div className="flex items-center space-x-2">
          <button
            onClick={startServer}
            disabled={isStarting}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {isStarting ? 'Starting...' : '🚀 Start Server'}
          </button>
          <div className="text-xs text-gray-500">
            Need to run: <code className="bg-gray-100 px-1 rounded">npm run dev:server</code>
          </div>
        </div>
      )}

      {serverStatus === 'online' && (
        <button
          onClick={stopServer}
          className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
        >
          🛑 Stop Server
        </button>
      )}

      <button
        onClick={checkServerStatus}
        className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
        title="Check server status"
      >
        🔄
      </button>
    </div>
  );
};

export default ServerStatus;
