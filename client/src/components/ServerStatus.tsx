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
