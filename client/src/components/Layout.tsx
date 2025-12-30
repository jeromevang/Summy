import React from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ServerStatus from './ServerStatus';
import { NotificationBell, ToastContainer } from './notifications';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  
  // Check if we're on the context editor page (dark theme)
  const isContextEditor = location.pathname.startsWith('/session/');
  
  // Check if we're on tooly pages (full width)
  const isToolyPage = location.pathname.startsWith('/tooly');

  if (isContextEditor) {
    // Render without layout for context editor (it has its own full-page layout)
    return <>{children}</>;
  }

  // Generate breadcrumbs/page title
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/sessions') return 'Conversations';
    if (path === '/rag') return 'Semantic Index';
    if (path === '/settings') return 'Configuration';
    if (path === '/debug') return 'System Diagnostics';
    if (path.startsWith('/tooly')) {
      if (path === '/tooly/readiness') return 'Agentic Readiness';
      if (path === '/tooly/combo-test') return 'Combo Optimizer';
      if (path === '/tooly/controller') return 'System Controller';
      if (path === '/tooly/prosthetics') return 'Prosthetic Manager';
      return 'Tooly Hub';
    }
    return '';
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-gray-100 flex overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Context Bar */}
        <header className="h-16 flex items-center justify-between px-8 bg-[#0d0d0d]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              {getPageTitle()}
            </h1>
          </div>
          
          <div className="flex items-center space-x-6">
            <ServerStatus />
            <div className="h-4 w-[1px] bg-white/10" />
            <NotificationBell />
          </div>
        </header>

        {/* Main Content Scroll Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className={`${isToolyPage ? 'w-full px-8' : 'max-w-7xl mx-auto px-8'} py-8`}>
            {children}
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
};

export default Layout;


export default Layout;
