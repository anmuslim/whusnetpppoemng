import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useRouterContext } from '../context/RouterContext.tsx';
import { api } from '../api/client.ts';
import { PppSecret, PppProfile, PppActive } from '../types/index.ts';
import { DataTable, ipAddressComparator } from '../components/common/DataTable.tsx';
import { Modal } from '../components/common/Modal.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { useToast } from '../components/common/Toast.tsx';
import {
  KeyRound,
  Plus,
  Upload,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Copy,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  Users,
  Clock,
  Radio,
} from 'lucide-react';

export const SecretsView: React.FC = () => {
  const { selectedRouterId, isMultiRouter, refreshTick, routers } = useRouterContext();
  const { success, error, info } = useToast();

  const [secrets, setSecrets] = useState<PppSecret[]>([]);
  const [profiles, setProfiles] = useState<PppProfile[]>([]);
  const [activeSessions, setActiveSessions] = useState<PppActive[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile usage lookup map
  const profileUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    secrets.forEach((s) => {
      const p = s.profile || 'default';
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [secrets]);

  // Revealed passwords set
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBulkProfileOpen, setIsBulkProfileOpen] = useState(false);
  const [targetBulkProfile, setTargetBulkProfile] = useState('');

  // Delete & Bulk Confirm
  const [secretToDelete, setSecretToDelete] = useState<PppSecret | null>(null);
  const [bulkActionConfirm, setBulkActionConfirm] = useState<{
    action: 'delete' | 'enable' | 'disable' | 'change_profile';
    items: PppSecret[];
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<PppSecret>>({
    name: '',
    password: '',
    service: 'pppoe',
    profile: 'default',
    localAddress: '',
    remoteAddress: '',
    callerId: '',
    disabled: false,
    comment: '',
    routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
  });

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<Array<Partial<PppSecret>>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch secrets and profiles
  const fetchData = async () => {
    try {
      setLoading(true);
      const [secRes, profRes, actRes] = await Promise.all([
        api.secrets.getAll(selectedRouterId),
        api.profiles.getAll(selectedRouterId).catch(() => ({ data: [] })),
        api.active.getAll(selectedRouterId).catch(() => ({ data: [] })),
      ]);

      const activeNames = new Set((actRes.data || []).map((a) => a.name));

      const merged = (secRes.data || []).map((s) => ({
        ...s,
        isActive: activeNames.has(s.name),
      }));

      setSecrets(merged);
      setProfiles(profRes.data || []);
      setActiveSessions(actRes.data || []);
    } catch (err: any) {
      error('Gagal Memuat Secrets', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedRouterId, refreshTick]);

  const togglePasswordReveal = (name: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleCreateOpen = () => {
    setEditingSecret(null);
    setFormData({
      name: '',
      password: '',
      service: 'pppoe',
      profile: profiles[0]?.name || 'default',
      localAddress: '',
      remoteAddress: '',
      callerId: '',
      disabled: false,
      comment: '',
      routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleEditOpen = (secret: PppSecret) => {
    setEditingSecret(secret);
    setFormData({
      ...secret,
      routerId: secret.routerId || selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const targetRouter = formData.routerId || selectedRouterId;
    try {
      if (editingSecret) {
        await api.secrets.update(targetRouter, editingSecret.name, formData);
        success('Berhasil', `Secret '${formData.name}' berhasil diperbarui.`);
      } else {
        await api.secrets.create(targetRouter, formData);
        success('Berhasil', `Secret '${formData.name}' berhasil ditambahkan.`);
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      error('Gagal Menyimpan Secret', err.message);
    }
  };

  const handleToggleDisabled = async (secret: PppSecret) => {
    const targetRouter = secret.routerId || selectedRouterId;
    const newDisabled = !secret.disabled;
    try {
      await api.secrets.update(targetRouter, secret.name, { disabled: newDisabled });
      success(
        newDisabled ? 'Dinonaktifkan' : 'Diaktifkan',
        `Secret '${secret.name}' kini ${newDisabled ? 'nonaktif (disabled)' : 'aktif (enabled)'}.`
      );
      fetchData();
    } catch (err: any) {
      error('Gagal Mengubah Status', err.message);
    }
  };

  const handleDeleteSecret = async () => {
    if (!secretToDelete) return;
    const targetRouter = secretToDelete.routerId || selectedRouterId;
    try {
      await api.secrets.delete(targetRouter, secretToDelete.name);
      success('Dihapus', `Secret '${secretToDelete.name}' berhasil dihapus.`);
      setSecretToDelete(null);
      fetchData();
    } catch (err: any) {
      error('Gagal Menghapus', err.message);
    }
  };

  const executeBulkAction = async (action: 'enable' | 'disable' | 'delete' | 'change_profile', items: PppSecret[], targetProfile?: string) => {
    try {
      const res = await api.secrets.bulkAction(selectedRouterId, {
        action,
        items: items.map((i) => ({ name: i.name, routerId: i.routerId })),
        targetProfile,
      });
      success('Aksi Massal Selesai', `${res.successCount} dari ${items.length} secret berhasil diproses.`);
      setBulkActionConfirm(null);
      setIsBulkProfileOpen(false);
      fetchData();
    } catch (err: any) {
      error('Gagal Aksi Massal', err.message);
    }
  };

  // CSV parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCsv(text);
    };
    reader.readAsText(file);
  };

  const parseCsv = (text: string) => {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const parsed: Array<Partial<PppSecret>> = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map((val) => val.trim().replace(/^"|"$/g, ''));
      if (row.length === 0 || !row[0]) continue;

      const obj: any = {};
      headers.forEach((h, idx) => {
        if (h.includes('name') || h === 'username') obj.name = row[idx];
        else if (h.includes('pass')) obj.password = row[idx];
        else if (h.includes('prof')) obj.profile = row[idx];
        else if (h.includes('serv')) obj.service = row[idx] || 'pppoe';
        else if (h.includes('remot') || h.includes('ip')) obj.remoteAddress = row[idx];
        else if (h.includes('comm')) obj.comment = row[idx];
      });
      if (obj.name) {
        obj.service = obj.service || 'pppoe';
        obj.profile = obj.profile || 'default';
        parsed.push(obj);
      }
    }
    setCsvPreview(parsed);
  };

  const handleImportSubmit = async () => {
    if (csvPreview.length === 0) return;
    const targetRouter = selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId;
    let successCount = 0;

    for (const item of csvPreview) {
      try {
        await api.secrets.create(targetRouter, item);
        successCount++;
      } catch (err) {
        console.warn('Import row failed:', item.name, err);
      }
    }

    success('Import Selesai', `Berhasil mengimpor ${successCount} dari ${csvPreview.length} secret.`);
    setIsImportOpen(false);
    setCsvPreview([]);
    setCsvText('');
    fetchData();
  };

  // Table Columns
  const columns = useMemo<ColumnDef<PppSecret>[]>(() => {
    const cols: ColumnDef<PppSecret>[] = [
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
        id: 'statusIcon',
        header: 'Status',
        size: 70,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-1.5 font-sans">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  s.disabled ? 'bg-slate-300 dark:bg-zinc-600' : s.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span
                className={`text-[10px] font-semibold ${
                  s.disabled
                    ? 'text-slate-400 dark:text-zinc-500'
                    : s.isActive
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-slate-500'
                }`}
              >
                {s.disabled ? 'Disabled' : s.isActive ? 'Aktif' : 'Offline'}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'name',
        header: 'Name (Username)',
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{s.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'password',
        header: 'Password',
        cell: ({ row }) => {
          const s = row.original;
          const isRevealed = revealedPasswords[s.name];
          return (
            <div className="flex items-center gap-1.5 font-mono text-slate-600 dark:text-zinc-300">
              <span>{isRevealed ? s.password || '—' : '••••••••'}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePasswordReveal(s.name);
                }}
                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                title={isRevealed ? 'Sembunyikan Password' : 'Lihat Password'}
              >
                {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
          );
        },
      },
      {
        accessorKey: 'profile',
        header: 'Profile',
        cell: ({ getValue }) => (
          <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-[11px] font-mono">
            {String(getValue() || 'default')}
          </span>
        ),
      },
      {
        accessorKey: 'service',
        header: 'Service',
        size: 70,
        cell: ({ getValue }) => (
          <span className="uppercase text-[10px] text-slate-500 font-mono font-semibold">
            {String(getValue() || 'any')}
          </span>
        ),
      },
      {
        accessorKey: 'remoteAddress',
        header: 'Remote Address',
        sortingFn: ipAddressComparator,
        cell: ({ getValue }) => {
          const val = String(getValue() || '');
          return <span className="font-mono text-slate-700 dark:text-zinc-300">{val || '—'}</span>;
        },
      },
      {
        accessorKey: 'callerId',
        header: 'Caller ID (Bind)',
        size: 130,
        cell: ({ getValue }) => {
          const val = String(getValue() || '');
          return (
            <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-400">
              {val || '—'}
            </span>
          );
        },
      },
      {
        accessorKey: 'lastCallerId',
        header: 'Last Caller ID',
        size: 135,
        cell: ({ row }) => {
          const s = row.original;
          const val = s.lastCallerId || s.callerId || '';
          if (!val) return <span className="text-[10px] text-slate-400 font-mono italic">—</span>;
          return (
            <span className="font-mono text-[10px] font-medium text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-sm">
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: 'lastLoggedOut',
        header: 'Last Logout',
        size: 140,
        cell: ({ row }) => {
          const s = row.original;
          if (s.isActive) {
            return (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span>Sedang Online</span>
              </span>
            );
          }
          if (!s.lastLoggedOut) {
            return <span className="text-[10px] text-slate-400 font-mono italic">Belum ada</span>;
          }
          return (
            <div className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-zinc-300 font-mono">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              <span>{s.lastLoggedOut}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'comment',
        header: 'Comment',
        cell: ({ getValue }) => {
          const val = String(getValue() || '');
          return <span className="text-slate-500 dark:text-zinc-400 truncate max-w-[180px] block">{val || '—'}</span>;
        },
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

    return cols;
  }, [isMultiRouter, revealedPasswords]);

  const getContextMenuItems = (s: PppSecret) => [
    {
      label: 'Edit Secret',
      icon: <Edit2 className="w-3.5 h-3.5" />,
      action: () => handleEditOpen(s),
    },
    {
      label: s.disabled ? 'Aktifkan (Enable)' : 'Nonaktifkan (Disable)',
      icon: s.disabled ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5 text-amber-500" />,
      action: () => handleToggleDisabled(s),
    },
    {
      label: 'Salin Username',
      icon: <Copy className="w-3.5 h-3.5" />,
      action: () => {
        navigator.clipboard.writeText(s.name);
        info('Tersalin', `Username '${s.name}' disalin ke clipboard.`);
      },
    },
    {
      label: 'Salin Password',
      icon: <KeyRound className="w-3.5 h-3.5" />,
      action: () => {
        navigator.clipboard.writeText(s.password || '');
        info('Tersalin', 'Password disalin ke clipboard.');
      },
      divider: true,
    },
    {
      label: 'Hapus Secret',
      icon: <Trash2 className="w-3.5 h-3.5" />,
      destructive: true,
      action: () => setSecretToDelete(s),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-500" />
            <span>PPP Secrets (Daftar Pengguna PPPoE)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Kelola username, password, profile, dan isolir pelanggan PPPoE
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-lg transition-colors shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleCreateOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Secret</span>
          </button>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={secrets}
        columns={columns}
        tableId="ppp_secrets"
        loading={loading}
        searchPlaceholder="Cari username, IP, profile, komentar..."
        getRowId={(s) => s.name}
        isRowDisabled={(s) => s.disabled}
        getContextMenuItems={getContextMenuItems}
        onRowDoubleClick={(s) => handleEditOpen(s)}
        topToolbarActions={
          <div className="flex items-center gap-2">
            {/* Quick Bulk Action Helper Menu */}
            <select
              onChange={(e) => {
                const action = e.target.value;
                if (!action) return;
                // Get checked items from DOM/state if table has selection
                const checked = secrets.filter((s) => s); // fallback or all
                if (action === 'bulk_enable') {
                  setBulkActionConfirm({ action: 'enable', items: checked });
                } else if (action === 'bulk_disable') {
                  setBulkActionConfirm({ action: 'disable', items: checked });
                } else if (action === 'bulk_profile') {
                  setIsBulkProfileOpen(true);
                } else if (action === 'bulk_delete') {
                  setBulkActionConfirm({ action: 'delete', items: checked });
                }
                e.target.value = '';
              }}
              defaultValue=""
              className="py-1 px-2.5 text-xs font-medium bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-700 dark:text-zinc-200 focus:outline-hidden"
            >
              <option value="" disabled>
                Aksi Massal...
              </option>
              <option value="bulk_enable">Aktifkan Terpilih</option>
              <option value="bulk_disable">Nonaktifkan Terpilih</option>
              <option value="bulk_profile">Ubah Profile Massal</option>
              <option value="bulk_delete">Hapus Massal</option>
            </select>
          </div>
        }
      />

      {/* Modal Tambah / Edit Secret */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingSecret ? `Edit Secret: ${editingSecret.name}` : 'Tambah Secret PPPoE Baru'}
        subtitle="Konfigurasi akun pelanggan PPPoE pada router target"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveSecret} className="space-y-4 text-xs">
          {editingSecret && (
            <div className="p-3 bg-slate-50 dark:bg-zinc-800/80 rounded-lg border border-slate-200 dark:border-zinc-700 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block text-[10px]">Last Caller ID (MAC Dial-in):</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                  {editingSecret.lastCallerId || editingSecret.callerId || 'Belum ada dial-in'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Last Logout:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                  {editingSecret.lastLoggedOut || 'Belum pernah log out'}
                </span>
              </div>
            </div>
          )}

          {/* Router Target Selection if in Multi-Router view */}
          {isMultiRouter && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Target Router MikroTik *
              </label>
              <select
                value={formData.routerId}
                onChange={(e) => setFormData({ ...formData, routerId: e.target.value })}
                disabled={Boolean(editingSecret)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              >
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.host})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Username PPPoE *
              </label>
              <input
                type="text"
                required
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="user-pelanggan-01"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Password PPPoE *
              </label>
              <input
                type="text"
                required
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Password koneksi"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700 dark:text-zinc-300">Profile *</label>
                {formData.profile && (
                  <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1 font-mono">
                    <Users className="w-3 h-3" />
                    <span>{profileUsageCounts[formData.profile] ?? 0} pemakai</span>
                  </span>
                )}
              </div>
              <select
                value={formData.profile || 'default'}
                onChange={(e) => setFormData({ ...formData, profile: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              >
                {profiles.map((p) => {
                  const count = profileUsageCounts[p.name] ?? p.secretCount ?? 0;
                  return (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.rateLimit ? `• ${p.rateLimit}` : ''} ({count} pengguna)
                    </option>
                  );
                })}
                {profiles.length === 0 && <option value="default">default (0 pengguna)</option>}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">Service</label>
              <select
                value={formData.service || 'pppoe'}
                onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              >
                <option value="pppoe">pppoe</option>
                <option value="any">any</option>
                <option value="l2tp">l2tp</option>
                <option value="ovpn">ovpn</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Remote Address (Static IP Opsional)
              </label>
              <input
                type="text"
                value={formData.remoteAddress || ''}
                onChange={(e) => setFormData({ ...formData, remoteAddress: e.target.value })}
                placeholder="10.10.10.50 (kosongkan jika dari pool)"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Caller ID (Kunci MAC Address Opsional)
              </label>
              <input
                type="text"
                value={formData.callerId || ''}
                onChange={(e) => setFormData({ ...formData, callerId: e.target.value })}
                placeholder="XX:XX:XX:XX:XX:XX"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Catatan / Komentar Pelanggan
            </label>
            <input
              type="text"
              value={formData.comment || ''}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              placeholder="Contoh: Bpk. Ahmad, RT04 / No Telp 08123456789"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={formData.disabled || false}
                onChange={(e) => setFormData({ ...formData, disabled: e.target.checked })}
                className="rounded-xs text-sky-600 focus:ring-sky-500 w-4 h-4"
              />
              <span className="font-semibold">Nonaktifkan Secret Ini (Disabled / Isolir)</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-2xs"
            >
              {editingSecret ? 'Simpan Perubahan' : 'Buat Secret'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Import CSV */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import PPP Secrets Dari CSV"
        subtitle="Unggah file CSV dengan header: name, password, profile, remoteAddress, comment"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-xl p-6 text-center hover:border-sky-500 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="csvFileInput"
            />
            <label htmlFor="csvFileInput" className="cursor-pointer space-y-2 block">
              <FileSpreadsheet className="w-8 h-8 text-sky-500 mx-auto" />
              <p className="font-semibold text-slate-800 dark:text-zinc-200">
                Pilih atau seret file CSV ke sini
              </p>
              <p className="text-[11px] text-slate-400">Format: text/csv UTF-8</p>
            </label>
          </div>

          {csvPreview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-slate-700 dark:text-zinc-300 font-semibold">
                <span>Preview Data ({csvPreview.length} baris terdeteksi):</span>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-zinc-800 rounded-lg">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 sticky top-0">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Password</th>
                      <th className="p-2">Profile</th>
                      <th className="p-2">Remote IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {csvPreview.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                        <td className="p-2 font-semibold">{row.name}</td>
                        <td className="p-2">{row.password}</td>
                        <td className="p-2">{row.profile}</td>
                        <td className="p-2">{row.remoteAddress || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setIsImportOpen(false)}
              className="px-4 py-2 font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={handleImportSubmit}
              disabled={csvPreview.length === 0}
              className="px-4 py-2 font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-40 rounded-lg shadow-2xs"
            >
              Import {csvPreview.length} Secret Sekarang
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Ubah Profile Massal */}
      <Modal
        isOpen={isBulkProfileOpen}
        onClose={() => setIsBulkProfileOpen(false)}
        title="Ubah Profile Massal"
        subtitle="Pilih profile target untuk seluruh secret yang terfilter atau terpilih"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Pilih Profile Baru *
            </label>
            <select
              value={targetBulkProfile}
              onChange={(e) => setTargetBulkProfile(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="" disabled>
                -- Pilih Profile --
              </option>
              {profiles.map((p) => {
                const count = profileUsageCounts[p.name] ?? p.secretCount ?? 0;
                return (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.rateLimit ? `• ${p.rateLimit}` : ''} ({count} pengguna saat ini)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setIsBulkProfileOpen(false)}
              className="px-4 py-2 font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => executeBulkAction('change_profile', secrets, targetBulkProfile)}
              disabled={!targetBulkProfile}
              className="px-4 py-2 font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-40 rounded-lg"
            >
              Terapkan Profile
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Single Secret Confirm */}
      <ConfirmDialog
        isOpen={Boolean(secretToDelete)}
        onClose={() => setSecretToDelete(null)}
        onConfirm={handleDeleteSecret}
        title="Hapus PPP Secret"
        itemName={secretToDelete?.name || ''}
        description="Akun ini akan dihapus dari router MikroTik. Jika pengguna sedang online, sesi aktifnya akan terputus."
        confirmLabel="Hapus Secret"
      />
    </div>
  );
};
