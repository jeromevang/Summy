import React from 'react';
import { Link, useLocation } from 'react-router-dom';
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

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* Navigation */}
      <nav className="bg-[#1a1a1a] border-b border-[#2d2d2d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center">
              <Link to="/" className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                ✨ Summy
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <ServerStatus />
              <NotificationBell />
              <div className="flex space-x-1">
                <Link
                  to="/"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === '/'
                      ? 'bg-[#2d2d2d] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/sessions"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === '/sessions'
                      ? 'bg-[#2d2d2d] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  Sessions
                </Link>
                <Link
                  to="/tooly"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === '/tooly'
                      ? 'bg-[#2d2d2d] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  Tooly
                </Link>
                <Link
                  to="/rag"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === '/rag'
                      ? 'bg-[#2d2d2d] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  RAG
                </Link>
                <Link
                  to="/debug"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === '/debug'
                      ? 'bg-[#2d2d2d] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  Debug
                </Link>
                <Link
                  to="/settings"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === '/settings'
                      ? 'bg-[#2d2d2d] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className={`${isToolyPage ? 'w-full px-4' : 'max-w-7xl mx-auto'} py-6 sm:px-6 lg:px-8`}>
        {children}
      </main>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
};

export default Layout;
