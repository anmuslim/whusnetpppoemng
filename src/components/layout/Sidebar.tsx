import React from 'react';
import {
  LayoutDashboard,
  Router as RouterIcon,
  KeyRound,
  Activity,
  Sliders,
  GitFork,
  Database,
  History,
  X,
  Radio,
  Server,
  Users,
} from 'lucide-react';
import { useRouterContext } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

export type NavTab =
  | 'dashboard'
  | 'routers'
  | 'secrets'
  | 'active'
  | 'profiles'
  | 'queues'
  | 'pools'
  | 'audit'
  | 'users';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}) => {
  const { routers, selectedRouterId } = useRouterContext();

  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      sublabel: 'Ringkasan & Metrik',
    },
    {
      id: 'routers' as NavTab,
      label: 'Router MikroTik',
      icon: <RouterIcon className="w-4 h-4" />,
      sublabel: `${routers.length} Terdaftar`,
    },
    {
      id: 'secrets' as NavTab,
      label: 'PPP Secrets',
      icon: <KeyRound className="w-4 h-4" />,
      sublabel: '/ppp/secret',
    },
    {
      id: 'active' as NavTab,
      label: 'PPP Active',
      icon: <Activity className="w-4 h-4" />,
      sublabel: 'Monitoring Realtime',
      pulse: true,
    },
    {
      id: 'profiles' as NavTab,
      label: 'PPP Profiles',
      icon: <Sliders className="w-4 h-4" />,
      sublabel: '/ppp/profile',
    },
    {
      id: 'queues' as NavTab,
      label: 'Simple Queues',
      icon: <GitFork className="w-4 h-4" />,
      sublabel: '/queue/simple',
    },
    {
      id: 'pools' as NavTab,
      label: 'IP Pool',
      icon: <Database className="w-4 h-4" />,
      sublabel: '/ip/pool',
    },
    {
      id: 'audit' as NavTab,
      label: 'Riwayat Aktivitas',
      icon: <History className="w-4 h-4" />,
      sublabel: 'Audit Log & Catatan',
    },
    {
      id: 'users' as NavTab,
      label: 'Manajemen User',
      icon: <Users className="w-4 h-4" />,
      sublabel: 'Hak Akses & Akun',
    },
  ];

  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const allowedMenus = user?.allowedMenus || ['dashboard'];

  const visibleNavItems = navItems.filter((item) => {
    if (isSuperadmin) return true;
    return allowedMenus.includes(item.id);
  });

  const content = (
    <div className="h-full flex flex-col justify-between p-3 select-none">
      <div className="space-y-1">
        {/* Mobile close button */}
        <div className="lg:hidden flex items-center justify-between pb-3 mb-2 border-b border-slate-200 dark:border-zinc-800">
          <span className="font-semibold text-sm text-slate-800 dark:text-zinc-200">Menu Utama</span>
          <button
            onClick={onCloseMobile}
            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/80 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`${isActive ? 'text-white' : 'text-slate-400 dark:text-zinc-500'}`}>
                    {item.icon}
                  </span>
                  <div>
                    <span className="block leading-tight font-semibold">{item.label}</span>
                    <span
                      className={`text-[10px] block mt-0.5 leading-tight ${
                        isActive ? 'text-sky-100' : 'text-slate-500 dark:text-zinc-400 font-mono'
                      }`}
                    >
                      {item.sublabel}
                    </span>
                  </div>
                </div>

                {item.pulse && (
                  <span className="relative flex h-2 w-2">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        isActive ? 'bg-white' : 'bg-emerald-400'
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        isActive ? 'bg-white' : 'bg-emerald-500'
                      }`}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Router Status Widget at bottom */}
      <div className="pt-3 border-t border-slate-200 dark:border-zinc-800">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800 dark:text-zinc-200">
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-sky-500" />
              <span>Target Router</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold">
              {selectedRouterId === 'all' ? 'SEMUA' : 'SINGLE'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 dark:text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>Router Online:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {routers.filter((r) => r.status === 'online').length} / {routers.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Mode Demo:</span>
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                {routers.some((r) => r.isDemo) ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
