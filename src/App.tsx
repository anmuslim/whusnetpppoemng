import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { RouterProvider } from './context/RouterContext.tsx';
import { ToastProvider } from './components/common/Toast.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar, NavTab } from './components/layout/Sidebar.tsx';
import { DashboardView } from './views/DashboardView.tsx';
import { RoutersView } from './views/RoutersView.tsx';
import { SecretsView } from './views/SecretsView.tsx';
import { ActiveView } from './views/ActiveView.tsx';
import { ProfilesView } from './views/ProfilesView.tsx';
import { QueuesView } from './views/QueuesView.tsx';
import { PoolsView } from './views/PoolsView.tsx';
import { AuditLogView } from './views/AuditLogView.tsx';
import { UsersView } from './views/UsersView.tsx';
import { LoginView } from './views/LoginView.tsx';
import { Loader2 } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);

  const handleSelectTab = (tab: NavTab) => {
    if (tab !== currentTab) {
      setTabLoading(true);
      setCurrentTab(tab);
      setTimeout(() => setTabLoading(false), 450);
    }
  };

  // Auto redirect if current tab is restricted for this user
  React.useEffect(() => {
    if (user && user.role !== 'superadmin' && user.allowedMenus && user.allowedMenus.length > 0) {
      if (!user.allowedMenus.includes(currentTab)) {
        setCurrentTab(user.allowedMenus[0] as NavTab);
      }
    }
  }, [user, currentTab]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-200">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
          <p className="text-xs font-medium">Memuat PPPoE Manager...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <RouterProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col font-sans transition-colors">
        <Header onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)} />

        {/* Global Menu Loading Progress Bar */}
        <div
          className={`h-0.5 w-full bg-slate-100 dark:bg-zinc-900 overflow-hidden relative z-40 transition-opacity duration-200 ${
            tabLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {tabLoading && (
            <div className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 animate-progress-indeterminate" />
          )}
        </div>

        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            currentTab={currentTab}
            onSelectTab={handleSelectTab}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-[1600px] w-full mx-auto">
            {currentTab === 'dashboard' && <DashboardView onNavigateTo={handleSelectTab} />}
            {currentTab === 'routers' && <RoutersView />}
            {currentTab === 'secrets' && <SecretsView />}
            {currentTab === 'active' && <ActiveView />}
            {currentTab === 'profiles' && <ProfilesView />}
            {currentTab === 'queues' && <QueuesView />}
            {currentTab === 'pools' && <PoolsView />}
            {currentTab === 'audit' && <AuditLogView />}
            {currentTab === 'users' && <UsersView />}
          </main>
        </div>
      </div>
    </RouterProvider>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <MainLayout />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
