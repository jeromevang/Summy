import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Settings from './pages/Settings';
import Sessions from './pages/Sessions';
import ContextEditor from './pages/ContextEditor';
import Debug from './pages/Debug';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Sessions />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/debug" element={<Debug />} />
          <Route path="/session/:sessionId" element={<ContextEditor />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
