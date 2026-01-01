import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Sources from './pages/Sources';
import TeamBuilder from './pages/TeamBuilder';
import Sessions from './pages/Sessions';
import ContextEditor from './pages/ContextEditor';
import Tooly from './pages/tooly';
import ModelDetailsPage from './pages/tooly/ModelDetailPage/ModelDetailsPage'; // Corrected import
import AgenticReadiness from './pages/tooly/AgenticReadiness';
import ComboTest from './pages/tooly/ComboTest';
import { ProstheticManager } from './pages/tooly/ProstheticManager';
import Controller from './pages/tooly/Controller/SystemControllerPage';
import Debug from './pages/Debug';
import RAG from './pages/RAG/RAGNavigatorPage';
import Layout from './components/Layout';
import { ToastProvider, useToast } from './components/Toast';
import { useWebSocketConnection } from './hooks/useWebSocketManager';

// Component to handle WebSocket notifications
const NotificationListener: React.FC = () => {
  const { addToast } = useToast();
  const ws = useWebSocketConnection(`ws://${window.location.hostname}:3001/ws`);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          const notifType = data.notificationType || 'info';
          addToast(data.message, notifType as 'info' | 'success' | 'warning' | 'error');
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.addEventListener('message', handleMessage);
    
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, addToast]);

  return null;
};

function App() {
  return (
    <ToastProvider>
      <Router>
        <NotificationListener />
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/tooly" element={<Tooly />} />
            <Route path="/tooly/model/:modelId" element={<ModelDetailsPage />} />
            {/* OptimalSetup deprecated - redirect to readiness */}
            <Route path="/tooly/optimal-setup" element={<Navigate to="/tooly/readiness" replace />} />
            <Route path="/tooly/readiness" element={<AgenticReadiness />} />
            <Route path="/tooly/combo-test" element={<ComboTest />} />
            <Route path="/tooly/prosthetics" element={<ProstheticManager />} />
            <Route path="/tooly/controller" element={<Controller />} />
            <Route path="/rag" element={<RAG />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/team-builder" element={<TeamBuilder />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/debug" element={<Debug />} />
            <Route path="/session/:sessionId" element={<ContextEditor />} />
          </Routes>
        </Layout>
      </Router>
    </ToastProvider>
  );
}

export default App;
