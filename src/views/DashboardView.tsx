import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client.ts';
import { OverviewData } from '../types/index.ts';
import { useRouterContext } from '../context/RouterContext.tsx';
import {
  Server,
  KeyRound,
  Users,
  UserX,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Cpu,
  Clock,
  ExternalLink,
  RotateCw,
  TrendingUp,
} from 'lucide-react';

export const DashboardView: React.FC<{ onNavigateTo: (tab: any) => void }> = ({ onNavigateTo }) => {
  const { refreshTick, setSelectedRouterId, triggerManualRefresh } = useRouterContext();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // History for active user chart polling
  const [userHistory, setUserHistory] = useState<Array<{ time: string; count: number }>>([]);

  const fetchOverview = async () => {
    try {
      const res = await api.overview.get();
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
        // Append to user history (keep last 20 data points)
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        setUserHistory((prev) => {
          const next = [...prev, { time: timeStr, count: res.data.stats.totalActive }];
          return next.slice(-20);
        });
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [refreshTick]);

  // Initial seed of history if empty
  useEffect(() => {
    if (data && userHistory.length === 0) {
      const initial: Array<{ time: string; count: number }> = [];
      const base = data.stats.totalActive;
      for (let i = 10; i >= 0; i--) {
        const d = new Date(Date.now() - i * 10000);
        const t = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
        const jitter = Math.floor(Math.sin(i) * 4);
        initial.push({ time: t, count: Math.max(0, base + jitter) });
      }
      setUserHistory(initial);
    }
  }, [data]);

  const stats = data?.stats;

  // SVG Chart Calculations
  const chartSvg = useMemo(() => {
    if (userHistory.length < 2) return null;
    const counts = userHistory.map((h) => h.count);
    const min = Math.max(0, Math.min(...counts) - 5);
    const max = Math.max(...counts) + 5;
    const range = max - min || 1;

    const width = 600;
    const height = 140;
    const padding = 20;

    const points = userHistory.map((h, i) => {
      const x = padding + (i / (userHistory.length - 1)) * (width - padding * 2);
      const y = height - padding - ((h.count - min) / range) * (height - padding * 2);
      return { x, y, count: h.count, time: h.time };
    });

    // Generate smooth bezier path
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { points, pathD, areaD, min, max, width, height };
  }, [userHistory]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dashboard PPPoE Central
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Monitoring performa jaringan dan status router MikroTik terpusat
          </p>
        </div>

        <button
          onClick={triggerManualRefresh}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700 rounded-lg transition-colors shadow-2xs"
        >
          <RotateCw className="w-3.5 h-3.5 text-sky-500" />
          <span>Refresh Sekarang</span>
        </button>
      </div>

      {/* Top Progress Loading Indicator */}
      {loading && (
        <div className="h-1 w-full bg-sky-100/40 dark:bg-zinc-850 rounded-full overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 animate-progress-indeterminate" />
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {/* Router Online / Offline */}
        <div
          onClick={() => onNavigateTo('routers')}
          className="p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs cursor-pointer hover:border-sky-500/50 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-medium">Status Router</span>
            <Server className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {stats?.onlineRouters ?? 0}
            </span>
            <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
              / {stats?.totalRouters ?? 0} Online
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400">
            {stats && stats.offlineRouters > 0 ? (
              <span className="text-rose-500 font-semibold">{stats.offlineRouters} router offline</span>
            ) : (
              <span className="text-emerald-500 font-medium">Semua router normal</span>
            )}
          </div>
        </div>

        {/* Total Secret PPPoE */}
        <div
          onClick={() => onNavigateTo('secrets')}
          className="p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs cursor-pointer hover:border-sky-500/50 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-medium">Total Secrets</span>
            <KeyRound className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {stats?.totalSecrets ?? 0}
            </span>
            <span className="text-xs text-slate-400 dark:text-zinc-500">akun</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">Terdaftar di seluruh router</p>
        </div>

        {/* Active Users */}
        <div
          onClick={() => onNavigateTo('active')}
          className="p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs cursor-pointer hover:border-sky-500/50 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-medium">User Aktif</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {stats?.totalActive ?? 0}
            </span>
            <span className="text-xs text-slate-400 dark:text-zinc-500">sesi</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {stats?.totalSecrets
                ? `${Math.round(((stats.totalActive || 0) / stats.totalSecrets) * 100)}% online`
                : '0%'}
            </span>
          </div>
        </div>

        {/* User Disabled */}
        <div
          onClick={() => onNavigateTo('secrets')}
          className="p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs cursor-pointer hover:border-sky-500/50 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-medium">User Disabled</span>
            <UserX className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {stats?.totalDisabled ?? 0}
            </span>
            <span className="text-xs text-slate-400 dark:text-zinc-500">user</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">Isolir / nonaktif</p>
        </div>

        {/* Total Traffic */}
        <div className="col-span-2 md:col-span-1 p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-medium">Total Traffic</span>
            <Activity className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-600 dark:text-purple-400 font-mono tabular-nums">
              {stats?.totalTraffic ?? '0 Mbps'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold" title="Total Download pelanggan (MikroTik Tx)">
              <ArrowDownLeft className="w-3 h-3" /> DL: {stats?.totalTrafficTx || '0 bps'}
            </span>
            <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold" title="Total Upload pelanggan (MikroTik Rx)">
              <ArrowUpRight className="w-3 h-3" /> UL: {stats?.totalTrafficRx || '0 bps'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Active Users Line Chart & Recent Activity Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Realtime Active Users Chart */}
        <div className="lg:col-span-2 p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-500" />
                <span>Tren Sesi PPPoE Aktif Realtime</span>
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                Diperbarui secara berkala sesuai interval auto-refresh
              </p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold font-mono text-emerald-500 tabular-nums">
                {stats?.totalActive || 0}
              </span>
              <span className="text-[11px] text-slate-400 ml-1">Klien</span>
            </div>
          </div>

          {/* SVG Line Chart */}
          <div className="relative w-full h-44 bg-slate-50 dark:bg-zinc-850/60 rounded-lg p-2 border border-slate-200 dark:border-zinc-750 overflow-hidden">
            {chartSvg ? (
              <svg
                viewBox={`0 0 ${chartSvg.width} ${chartSvg.height}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Subtle horizontal grid lines */}
                <line
                  x1="20"
                  y1="35"
                  x2="580"
                  y2="35"
                  stroke="currentColor"
                  className="text-slate-300 dark:text-zinc-700"
                  strokeDasharray="3 3"
                />
                <line
                  x1="20"
                  y1="85"
                  x2="580"
                  y2="85"
                  stroke="currentColor"
                  className="text-slate-300 dark:text-zinc-700"
                  strokeDasharray="3 3"
                />

                {/* Area under curve */}
                <path d={chartSvg.areaD} fill="url(#chartGradient)" />

                {/* Smooth Curve */}
                <path
                  d={chartSvg.pathD}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Points */}
                {chartSvg.points.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={idx === chartSvg.points.length - 1 ? 4.5 : 3}
                    className={
                      idx === chartSvg.points.length - 1
                        ? 'fill-sky-400 stroke-white dark:stroke-zinc-900 stroke-2'
                        : 'fill-sky-500'
                    }
                  />
                ))}
              </svg>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-zinc-400">
                Mengumpulkan data tren realtime...
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
            <span>{userHistory[0]?.time || 'T-start'}</span>
            <span className="text-slate-600 dark:text-zinc-400 font-sans">Rentang Waktu Terakhir</span>
            <span>{userHistory[userHistory.length - 1]?.time || 'Sekarang'}</span>
          </div>
        </div>

        {/* Recent Session Events */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-purple-500" />
              <span>Log Sesi Terkini</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mb-4">
              Aktivitas koneksi dan pemutusan sesi terbaru
            </p>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {data?.recentEvents && data.recentEvents.length > 0 ? (
                data.recentEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700 text-xs flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            evt.type === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-semibold text-slate-900 dark:text-zinc-100 truncate font-mono">
                          {evt.username}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                        {evt.routerName} · {evt.ipAddress}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-xs ${
                          evt.type === 'connected'
                            ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'text-rose-700 bg-rose-100 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {evt.type === 'connected' ? 'Terhubung' : 'Terputus'}
                      </span>
                      <p className="text-[9px] text-slate-500 dark:text-zinc-400 mt-1 font-mono">
                        {new Date(evt.timestamp).toLocaleTimeString('id-ID')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500 dark:text-zinc-400">Belum ada aktivitas sesi tercatat.</div>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTo('audit')}
            className="mt-4 w-full py-2 text-center text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 rounded-lg transition-colors border border-sky-200 dark:border-sky-900"
          >
            Lihat Riwayat Audit Lengkap →
          </button>
        </div>
      </div>

      {/* Summary Table Per Router */}
      <div className="p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Ringkasan Beban & Kapasitas Tiap Router
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Pantau utilisasi CPU, rasio pelanggan aktif, memori, dan uptime RouterOS
            </p>
          </div>
          <button
            onClick={() => onNavigateTo('routers')}
            className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
          >
            <span>Kelola Router</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-[11px] font-semibold bg-slate-50/50 dark:bg-zinc-850/50">
                <th className="py-2.5 px-3">Nama Router</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">User Aktif / Secret</th>
                <th className="py-2.5 px-3">Beban CPU</th>
                <th className="py-2.5 px-3">Free RAM</th>
                <th className="py-2.5 px-3">Uptime</th>
                <th className="py-2.5 px-3 text-right">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-mono text-slate-700 dark:text-zinc-200">
              {data?.routerSummaries && data.routerSummaries.length > 0 ? (
                data.routerSummaries.map((r) => {
                  const isOnline = r.status === 'online';
                  const activePercent = r.secretCount > 0 ? Math.round((r.activeCount / r.secretCount) * 100) : 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{r.boardName || 'RouterOS'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isOnline
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        <div>
                          <strong>{r.activeCount}</strong> / {r.secretCount} ({activePercent}%)
                        </div>
                        <div className="w-28 bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, activePercent)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-slate-400" />
                          <span>{r.cpuLoad}%</span>
                        </div>
                        <div className="w-20 bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              r.cpuLoad > 75 ? 'bg-rose-500' : r.cpuLoad > 50 ? 'bg-amber-500' : 'bg-sky-500'
                            }`}
                            style={{ width: `${Math.min(100, r.cpuLoad)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        {r.freeMemory} MB / {r.totalMemory} MB
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-600 dark:text-zinc-400">{r.uptime}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedRouterId(r.id);
                            onNavigateTo('secrets');
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-md border border-sky-200 dark:border-sky-800 transition-colors"
                        >
                          Kelola Secrets
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Memuat data router...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
