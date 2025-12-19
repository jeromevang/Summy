import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Sessions from './pages/Sessions';
import ContextEditor from './pages/ContextEditor';
import Tooly from './pages/Tooly';
import Debug from './pages/Debug';
import Layout from './components/Layout';
import { ToastProvider, useToast } from './components/Toast';

// Component to handle WebSocket notifications
const NotificationListener: React.FC = () => {
  const { addToast } = useToast();

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:3001/ws`);

    ws.onmessage = (event) => {
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

    ws.onerror = () => {
      // WebSocket error - silently ignore
    };

    return () => {
      ws.close();
    };
  }, [addToast]);

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
