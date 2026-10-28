import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useRouterContext } from '../context/RouterContext.tsx';
import { api } from '../api/client.ts';
import { PppActive } from '../types/index.ts';
import { DataTable, ipAddressComparator, uptimeComparator, bandwidthComparator } from '../components/common/DataTable.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { useToast } from '../components/common/Toast.tsx';
import { ActiveSessionDetailModal } from '../components/active/ActiveSessionDetailModal.tsx';
import {
  Activity,
  UserX,
  Radio,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Layers,
  Copy,
  Check,
  AlertTriangle,
  LineChart,
} from 'lucide-react';

export const ActiveView: React.FC = () => {
  const { selectedRouterId, isMultiRouter, refreshTick, refreshInterval } = useRouterContext();
  const { success, error, info } = useToast();

  const [activeSessions, setActiveSessions] = useState<PppActive[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Detail / Realtime Monitor modal
  const [selectedDetailSession, setSelectedDetailSession] = useState<PppActive | null>(null);

  // Disconnect modals
  const [sessionToKick, setSessionToKick] = useState<PppActive | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  const [isBulkDisconnectOpen, setIsBulkDisconnectOpen] = useState(false);
  const [isBulkKicking, setIsBulkKicking] = useState(false);
  const isInitialMount = useRef(true);

  const fetchActive = async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.active.getAll(selectedRouterId);
      if (res.success && Array.isArray(res.data)) {
        setActiveSessions(res.data);
      }
    } catch (err: any) {
      if (!silent) {
        error('Gagal Mengambil Sesi Aktif', err.message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchActive(false);
    } else {
      fetchActive(true); // background silent poll
    }
  }, [selectedRouterId, refreshTick]);

  const handleDisconnect = async () => {
    if (!sessionToKick) return;
    try {
      setIsKicking(true);
      await api.active.disconnect(selectedRouterId, sessionToKick.name, sessionToKick.routerId);
      success('Sesi Diputus', `Pengguna '${sessionToKick.name}' berhasil di-disconnect.`);
      setSessionToKick(null);
      fetchActive();
    } catch (err: any) {
      error('Gagal Memutus Sesi', err.message);
    } finally {
      setIsKicking(false);
    }
  };

  const handleBulkDisconnectAll = async () => {
    try {
      setIsBulkKicking(true);
      const items = activeSessions.map((s) => ({ name: s.name, routerId: s.routerId }));
      const res = await api.active.bulkDisconnect(selectedRouterId, items);
      success('Bulk Disconnect', `${res.disconnectedCount} sesi berhasil diputus.`);
      setIsBulkDisconnectOpen(false);
      fetchActive();
    } catch (err: any) {
      error('Gagal Bulk Disconnect', err.message);
    } finally {
      setIsBulkKicking(false);
    }
  };

  const handleCopy = (text: string, key: string, label: string) => {
    if (!text || text === '—') return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    info('Tersalin', `${label} '${text}' disalin ke clipboard.`);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  const columns = useMemo<ColumnDef<PppActive>[]>(() => {
    const cols: ColumnDef<PppActive>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
            aria-label="Pilih semua baris"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
            aria-label="Pilih baris"
          />
        ),
        size: 38,
      },
      {
        accessorKey: 'name',
        header: 'Username (PPPoE)',
        cell: ({ row }) => {
          const s = row.original;
          const isCopied = copiedKey === `user-${s.name}`;
          return (
            <div className="flex items-center gap-1.5 group/user">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-white font-mono">{s.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(s.name, `user-${s.name}`, 'Username');
                }}
                className={`p-1 rounded-md transition-all ${
                  isCopied
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
                title={isCopied ? 'Username Tersalin!' : 'Salin Username'}
                aria-label={`Salin Username ${s.name}`}
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          );
        },
      },
      {
        accessorKey: 'address',
        header: 'IP Address',
        sortingFn: ipAddressComparator,
        cell: ({ row, getValue }) => {
          const ip = String(getValue() || '');
          const s = row.original;
          const isCopied = copiedKey === `ip-${s.name}-${ip}`;
          if (!ip || ip === '—') {
            return <span className="font-mono text-slate-400 dark:text-zinc-500">—</span>;
          }
          return (
            <div className="flex items-center gap-1.5 group/ip">
              <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">
                {ip}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(ip, `ip-${s.name}-${ip}`, 'IP Address');
                }}
                className={`p-1 rounded-md transition-all ${
                  isCopied
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
                title={isCopied ? 'IP Tersalin!' : 'Salin IP Address'}
                aria-label={`Salin IP Address ${ip}`}
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          );
        },
      },
      {
        accessorKey: 'callerId',
        header: 'Caller ID / MAC',
        cell: ({ getValue }) => (
          <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-400">
            {String(getValue() || '—')}
          </span>
        ),
      },
      {
        accessorKey: 'uptime',
        header: 'Uptime Sesi',
        sortingFn: uptimeComparator,
        cell: ({ getValue }) => (
          <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-zinc-300 tabular-nums">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{String(getValue() || '—')}</span>
          </div>
        ),
      },
      {
        accessorKey: 'txRate',
        header: 'Download (Tx)',
        sortingFn: bandwidthComparator,
        cell: ({ row }) => {
          const s = row.original;
          const val = s.downloadRate || s.txRate || '—';
          return (
            <div
              className="flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums"
              title="Download menuju klien (MikroTik Tx Rate)"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>{val}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'rxRate',
        header: 'Upload (Rx)',
        sortingFn: bandwidthComparator,
        cell: ({ row }) => {
          const s = row.original;
          const val = s.uploadRate || s.rxRate || '—';
          return (
            <div
              className="flex items-center gap-1 font-mono text-sky-600 dark:text-sky-400 font-semibold tabular-nums"
              title="Upload dari klien (MikroTik Rx Rate)"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{val}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'encoding',
        header: 'Encoding / Enkripsi',
        cell: ({ getValue }) => (
          <span className="text-[10px] text-slate-500 font-mono">{String(getValue() || '—')}</span>
        ),
      },
      {
        accessorKey: 'service',
        header: 'Service',
        size: 70,
        cell: ({ getValue }) => (
          <span className="uppercase text-[10px] font-mono text-slate-500">{String(getValue() || 'pppoe')}</span>
        ),
      },
    ];

    if (isMultiRouter) {
      cols.push({
        accessorKey: 'routerName',
        header: 'Router',
        cell: ({ getValue }) => (
          <span className="font-semibold text-sky-600 dark:text-sky-400 font-mono text-[11px]">
            {String(getValue() || 'Unknown')}
          </span>
        ),
      });
    }

    cols.push({
      id: 'actions',
      header: 'Aksi',
      size: 80,
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSessionToKick(row.original);
          }}
          className="px-2 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-md transition-colors"
          title="Kick Sesi"
        >
          Disconnect
        </button>
      ),
    });

    return cols;
  }, [isMultiRouter, copiedKey]);

  const getContextMenuItems = (s: PppActive) => [
    {
      label: 'Monitor Realtime & Riwayat',
      icon: <LineChart className="w-3.5 h-3.5 text-sky-500" />,
      action: () => setSelectedDetailSession(s),
    },
    {
      label: 'Putuskan Sesi (Kick)',
      icon: <UserX className="w-3.5 h-3.5 text-rose-500" />,
      destructive: true,
      action: () => setSessionToKick(s),
    },
    {
      label: 'Salin IP Address',
      icon: <Copy className="w-3.5 h-3.5" />,
      action: () => {
        handleCopy(s.address || '', `ip-${s.name}-${s.address}`, 'IP Address');
      },
    },
    {
      label: 'Salin Username',
      icon: <Copy className="w-3.5 h-3.5" />,
      action: () => {
        handleCopy(s.name, `user-${s.name}`, 'Username');
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Title & Live Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            <span>PPP Active Connections</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex flex-wrap items-center gap-2">
            <span>Monitoring sesi pelanggan yang sedang online realtime.</span>
            <span className="font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800 text-[11px]">
              Klik 2x pada baris untuk grafik trafik realtime & riwayat
            </span>
            {refreshInterval > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>Polling: {refreshInterval}s</span>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBulkDisconnectOpen(true)}
            disabled={activeSessions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-40"
          >
            <UserX className="w-4 h-4" />
            <span>Kick Semua Sesi Aktif</span>
          </button>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={activeSessions}
        columns={columns}
        tableId="ppp_active"
        loading={loading}
        searchPlaceholder="Cari username aktif, IP, caller ID..."
        getRowId={(s) => s.name}
        getContextMenuItems={getContextMenuItems}
        onRowDoubleClick={(s) => setSelectedDetailSession(s)}
      />

      {/* Realtime Traffic & Session Detail Modal */}
      <ActiveSessionDetailModal
        session={selectedDetailSession}
        isOpen={Boolean(selectedDetailSession)}
        onClose={() => setSelectedDetailSession(null)}
        onKick={(s) => setSessionToKick(s)}
        routerId={selectedRouterId}
      />

      {/* Disconnect Single Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(sessionToKick)}
        onClose={() => setSessionToKick(null)}
        onConfirm={handleDisconnect}
        title="Putuskan Sesi Pelanggan (Kick)"
        itemName={sessionToKick?.name || ''}
        description={`Koneksi PPPoE dengan IP ${sessionToKick?.address || '—'} akan segera diputus dari router MikroTik.`}
        confirmLabel="Ya, Kick Sesi Ini"
        loading={isKicking}
      />

      {/* Bulk Kick Confirm Dialog */}
      <ConfirmDialog
        isOpen={isBulkDisconnectOpen}
        onClose={() => setIsBulkDisconnectOpen(false)}
        onConfirm={handleBulkDisconnectAll}
        title="Putuskan Seluruh Sesi Aktif"
        itemName={`${activeSessions.length} sesi pengguna aktif`}
        description="Semua klien PPPoE yang sedang terhubung akan di-disconnect secara bersamaan. Klien biasanya akan mencoba reconnect otomatis."
        confirmLabel="Putuskan Seluruh Sesi"
        loading={isBulkKicking}
      />
    </div>
  );
};
