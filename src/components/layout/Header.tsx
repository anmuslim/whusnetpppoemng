import React, { useState } from 'react';
import { useRouterContext, RefreshInterval } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import {
  Network,
  RotateCw,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Check,
  Server,
  Layers,
  Menu,
  Shield,
} from 'lucide-react';

interface HeaderProps {
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const {
    routers,
    selectedRouterId,
    setSelectedRouterId,
    refreshInterval,
    setRefreshInterval,
    triggerManualRefresh,
    loadingRouters,
  } = useRouterContext();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isRouterDropdownOpen, setIsRouterDropdownOpen] = useState(false);
  const [isIntervalDropdownOpen, setIsIntervalDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const handleManualRefresh = () => {
    setIsSpinning(true);
    triggerManualRefresh();
    setTimeout(() => setIsSpinning(false), 700);
  };

  const selectedRouter = routers.find((r) => r.id === selectedRouterId);
  const onlineCount = routers.filter((r) => r.status === 'online').length;

  return (
    <header className="sticky top-0 z-30 h-14 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-3 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Toggle & Brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-1.5 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg"
          aria-label="Menu navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-600 text-white shadow-xs">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-none">
              PPPoE Manager
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-none">
              MikroTik RouterOS Central
            </p>
          </div>
        </div>
      </div>

      {/* Center: Router Switcher Dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setIsRouterDropdownOpen(!isRouterDropdownOpen);
            setIsIntervalDropdownOpen(false);
            setIsUserMenuOpen(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-sky-500/50 rounded-lg text-xs font-medium text-slate-900 dark:text-zinc-100 transition-colors"
        >
          {selectedRouterId === 'all' ? (
            <Layers className="w-4 h-4 text-sky-500 shrink-0" />
          ) : (
            <Server className="w-4 h-4 text-emerald-500 shrink-0" />
          )}

          <div className="text-left max-w-[130px] sm:max-w-[200px] truncate">
            <span className="font-semibold">
              {selectedRouterId === 'all' ? 'Semua Router' : selectedRouter?.name || 'Pilih Router'}
            </span>
            <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-zinc-400 ml-1.5">
              ({selectedRouterId === 'all' ? `${onlineCount}/${routers.length} Online` : selectedRouter?.host})
            </span>
          </div>

          <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1 shrink-0" />
        </button>

        {isRouterDropdownOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsRouterDropdownOpen(false)} />
            <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 z-40 w-72 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-800 p-1.5 text-xs">
              <div className="px-3 py-2 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Pilih Target Router
              </div>

              {/* Option: Semua Router */}
              <button
                onClick={() => {
                  setSelectedRouterId('all');
                  setIsRouterDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${
                  selectedRouterId === 'all'
                    ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                    : 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-sky-500 shrink-0" />
                  <div>
                    <p className="font-medium">Semua Router</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                      Agregasi multi-router ({routers.length} router terdaftar)
                    </p>
                  </div>
                </div>
                {selectedRouterId === 'all' && <Check className="w-4 h-4 text-sky-500" />}
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-zinc-800" />

              {/* Individual Routers */}
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {routers.map((r) => {
                  const isSelected = selectedRouterId === r.id;
                  const isOnline = r.status === 'online';
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelectedRouterId(r.id);
                        setIsRouterDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${
                        isSelected
                          ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                          : 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <div className="truncate">
                          <p className="font-medium truncate">{r.name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                            {r.host}:{r.port} · {r.mode}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-sky-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Controls: Auto-refresh, Manual Refresh, Theme, User Menu */}
      <div className="flex items-center gap-2">
        {/* Polling Interval Selector */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => {
              setIsIntervalDropdownOpen(!isIntervalDropdownOpen);
              setIsRouterDropdownOpen(false);
              setIsUserMenuOpen(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/90 shadow-2xs"
            title="Interval Auto Refresh"
          >
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">Refresh:</span>
            <span className="font-semibold text-slate-800 dark:text-zinc-200">
              {refreshInterval === 0 ? 'Mati' : `${refreshInterval}d`}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
          </button>

          {isIntervalDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsIntervalDropdownOpen(false)} />
              <div className="absolute right-0 mt-1.5 z-40 w-36 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-slate-200 dark:border-zinc-800 p-1 text-xs">
                {([0, 5, 10, 30] as RefreshInterval[]).map((intVal) => (
                  <button
                    key={intVal}
                    onClick={() => {
                      setRefreshInterval(intVal);
                      setIsIntervalDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-left ${
                      refreshInterval === intVal
                        ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200'
                    }`}
                  >
                    <span>{intVal === 0 ? 'Mati' : `${intVal} detik`}</span>
                    {refreshInterval === intVal && <Check className="w-3.5 h-3.5 text-sky-500" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={handleManualRefresh}
          className="p-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/90 shadow-2xs"
          title="Segarkan Data Sekarang"
        >
          <RotateCw className={`w-4 h-4 ${isSpinning ? 'animate-spin text-sky-500' : ''}`} />
        </button>

        {/* Theme Switcher */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/90 shadow-2xs"
          title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
          aria-label={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden md:inline text-[11px] font-medium text-zinc-300">Gelap</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-sky-600 shrink-0" />
              <span className="hidden md:inline text-[11px] font-medium text-slate-700">Terang</span>
            </>
          )}
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsRouterDropdownOpen(false);
              setIsIntervalDropdownOpen(false);
            }}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 text-xs text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/90 shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center font-bold text-[10px]">
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <span className="hidden md:inline font-medium">{user?.username}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
          </button>

          {isUserMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsUserMenuOpen(false)} />
              <div className="absolute right-0 mt-1.5 z-40 w-52 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-800 p-1.5 text-xs">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800">
                  <p className="font-semibold text-slate-900 dark:text-white">{user?.name || user?.username}</p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5">
                    <Shield className="w-3 h-3 text-emerald-500" />
                    <span>Role: {user?.role || 'Admin'}</span>
                  </p>
                </div>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full mt-1 flex items-center gap-2 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors text-left font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Keluar Sistem</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
