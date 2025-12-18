import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Sessions from './pages/Sessions';
import ContextEditor from './pages/ContextEditor';
import Tooly from './pages/Tooly';
import Debug from './pages/Debug';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
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
  );
}

export default App;
