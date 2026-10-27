import React, { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { api } from '../api/client.ts';
import { AuditLogItem } from '../types/index.ts';
import { DataTable } from '../components/common/DataTable.tsx';
import { useToast } from '../components/common/Toast.tsx';
import {
  History,
  Shield,
  RotateCw,
  PlusCircle,
  Edit,
  Trash2,
  UserX,
  ToggleRight,
  Server,
  Activity,
} from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { error } = useToast();

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.audit.getAll();
      if (res.success && Array.isArray(res.data)) {
        setLogs(res.data);
      }
    } catch (err: any) {
      error('Gagal Memuat Riwayat', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-mono text-[10px] font-bold">
            <PlusCircle className="w-3 h-3" />
            <span>CREATE</span>
          </span>
        );
      case 'UPDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 font-mono text-[10px] font-bold">
            <Edit className="w-3 h-3" />
            <span>UPDATE</span>
          </span>
        );
      case 'DELETE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-mono text-[10px] font-bold">
            <Trash2 className="w-3 h-3" />
            <span>DELETE</span>
          </span>
        );
      case 'DISCONNECT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-mono text-[10px] font-bold">
            <UserX className="w-3 h-3" />
            <span>DISCONNECT</span>
          </span>
        );
      case 'ENABLE':
      case 'DISABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 font-mono text-[10px] font-bold">
            <ToggleRight className="w-3 h-3" />
            <span>{action}</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 font-mono text-[10px] font-bold">
            {action}
          </span>
        );
    }
  };

  const columns = useMemo<ColumnDef<AuditLogItem>[]>(() => {
    return [
      {
        accessorKey: 'timestamp',
        header: 'Waktu Aktivitas',
        cell: ({ getValue }) => {
          const val = String(getValue() || '');
          const d = new Date(val);
          return (
            <div className="font-mono text-slate-700 dark:text-zinc-300 tabular-nums">
              <span>{d.toLocaleDateString('id-ID')} </span>
              <span className="text-slate-500 dark:text-zinc-400">{d.toLocaleTimeString('id-ID')}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'username',
        header: 'Operator (Admin)',
        cell: ({ getValue }) => (
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-200">
            <Shield className="w-3.5 h-3.5 text-sky-500" />
            <span>{String(getValue() || 'admin')}</span>
          </div>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Tindakan',
        size: 110,
        cell: ({ getValue }) => getActionBadge(String(getValue() || '')),
      },
      {
        accessorKey: 'targetType',
        header: 'Objek',
        size: 90,
        cell: ({ getValue }) => (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-xs bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-semibold">
            {String(getValue() || 'RESOURCE')}
          </span>
        ),
      },
      {
        accessorKey: 'targetName',
        header: 'Nama Target',
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold text-slate-900 dark:text-white">
            {String(getValue() || '—')}
          </span>
        ),
      },
      {
        accessorKey: 'routerName',
        header: 'Router Target',
        cell: ({ getValue }) => (
          <div className="flex items-center gap-1.5 font-mono text-sky-600 dark:text-sky-400 font-medium">
            <Server className="w-3 h-3" />
            <span>{String(getValue() || 'Sistem')}</span>
          </div>
        ),
      },
      {
        accessorKey: 'details',
        header: 'Keterangan Detail',
        cell: ({ getValue }) => (
          <span className="text-slate-600 dark:text-zinc-400 text-xs">
            {String(getValue() || '—')}
          </span>
        ),
      },
    ];
  }, []);

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            <span>Riwayat Aktivitas & Audit Log</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Log jejak audit keamanan seluruh tindakan administrator pada router
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 rounded-lg transition-colors shadow-2xs self-start sm:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-sky-500" />
          <span>Segarkan Log</span>
        </button>
      </div>

      {/* DataTable */}
      <DataTable
        data={logs}
        columns={columns}
        tableId="audit_logs"
        loading={loading}
        searchPlaceholder="Cari riwayat, nama target, operator, atau keterangan..."
        getRowId={(l) => l.id}
      />
    </div>
  );
};
