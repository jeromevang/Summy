import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  isActive: boolean;
  isSubItem?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, isActive, isSubItem = false }) => (
  <Link
    to={to}
    className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
      isSubItem ? 'ml-9 py-2' : ''
    } ${
      isActive
        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-lg shadow-purple-500/5'
        : 'text-gray-400 hover:text-white hover:bg-white/5'
    }`}
  >
    <span className="text-lg">{icon}</span>
    <span>{label}</span>
  </Link>
);

const Sidebar: React.FC = () => {
  const location = useLocation();
  const [isToolyOpen, setIsToolyOpen] = useState(location.pathname.startsWith('/tooly'));

  const isNavItemActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-[#141414] border-r border-white/5 flex flex-col h-screen sticky top-0 overflow-y-auto custom-scrollbar">
      {/* Brand */}
      <div className="p-6">
        <Link to="/" className="flex items-center space-x-3">
          <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            ✨ Summy
          </span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        <NavItem
          to="/"
          icon="🏠"
          label="Dashboard"
          isActive={isNavItemActive('/') && location.pathname === '/'}
        />
        <NavItem
          to="/sessions"
          icon="💬"
          label="Sessions"
          isActive={isNavItemActive('/sessions')}
        />
        
        {/* Tooly Group */}
        <div className="pt-2">
          <button
            onClick={() => setIsToolyOpen(!isToolyOpen)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              location.pathname.startsWith('/tooly')
                ? 'text-purple-400'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🛠️</span>
              <span>Tooly</span>
            </div>
            <span className={`transition-transform duration-200 ${isToolyOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {isToolyOpen && (
            <div className="mt-1 space-y-1">
              <NavItem
                to="/tooly/readiness"
                icon="🚀"
                label="Readiness"
                isActive={location.pathname === '/tooly/readiness'}
                isSubItem
              />
              <NavItem
                to="/tooly/combo-test"
                icon="🧪"
                label="Combo Test"
                isActive={location.pathname === '/tooly/combo-test'}
                isSubItem
              />
              <NavItem
                to="/tooly/controller"
                icon="🎮"
                label="Controller"
                isActive={location.pathname === '/tooly/controller'}
                isSubItem
              />
              <NavItem
                to="/tooly/prosthetics"
                icon="🧠"
                label="Prosthetics"
                isActive={location.pathname === '/tooly/prosthetics'}
                isSubItem
              />
            </div>
          )}
        </div>

        <NavItem
          to="/rag"
          icon="🔍"
          label="RAG"
          isActive={isNavItemActive('/rag')}
        />
      </nav>

      {/* Footer Navigation */}
      <div className="p-4 border-t border-white/5 space-y-1">
        <NavItem
          to="/debug"
          icon="🐛"
          label="Debug"
          isActive={isNavItemActive('/debug')}
        />
        <NavItem
          to="/settings"
          icon="⚙️"
          label="Settings"
          isActive={isNavItemActive('/settings')}
        />
      </div>
    </aside>
  );
};

export default Sidebar;
