import { ProjectSwitcher } from './ProjectSwitcher';
import { useGit } from '../hooks/useGit';

// ... other imports ...

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { status: git, safeMode, toggleSafeMode } = useGit();
  
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
    if (path === '/') return 'Command Center';
    if (path === '/sessions') return 'Conversations';
    if (path === '/rag') return 'Semantic Index';
    if (path === '/settings') return 'Configuration';
    if (path === '/debug') return 'System Diagnostics';
    if (path.startsWith('/tooly')) {
      if (path === '/tooly/readiness') return 'Agentic Readiness';
      if (path === '/tooly/combo-test') return 'Combo Optimizer';
      if (path === '/tooly/controller') return 'System Controller';
      if (path === '/tooly/prosthetics') return 'Prosthetic Manager';
      return 'Swarm Hub';
    }
    return '';
  };

  return (
    <div className="min-h-screen bg-obsidian text-gray-100 flex overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Context Bar */}
        <header className="h-16 flex items-center justify-between px-8 bg-obsidian/40 backdrop-blur-xl border-b border-white/5 sticky top-0 z-10">
          <div className="flex items-center gap-8">
            <ProjectSwitcher />
            <h1 className="text-sm font-bold text-white tracking-[0.2em] uppercase opacity-80">
              {getPageTitle()}
            </h1>
            
            <div className="h-4 w-[1px] bg-white/5" />
            
            <SystemHUD />
          </div>
          
          <div className="flex items-center space-x-6">
            {/* Git & Safe Mode Section */}
            <div className="flex items-center gap-4 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              {git?.isRepo && (
                <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                  <span className={`w-2 h-2 rounded-full ${git.isClean ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : git.conflicts ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-tighter">{git.branch}</span>
                </div>
              )}
              
              <button 
                onClick={toggleSafeMode}
                className="flex items-center gap-2 group"
                title={safeMode ? "Safe Mode: Modifications blocked if Git is dirty" : "Safe Mode: OFF"}
              >
                <span className={`text-xs font-bold uppercase tracking-widest transition-colors ${safeMode ? 'text-cyan-400' : 'text-gray-600'}`}>
                  Safe Mode
                </span>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${safeMode ? 'bg-cyan-500/20' : 'bg-gray-800'}`}>
                  <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${safeMode ? 'right-1 bg-cyan-400' : 'left-1 bg-gray-600'}`} />
                </div>
              </button>
            </div>

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
