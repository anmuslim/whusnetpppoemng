import React, { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useRouterContext } from '../context/RouterContext.tsx';
import { api } from '../api/client.ts';
import { PppProfile, IpPool, SimpleQueue } from '../types/index.ts';
import { DataTable, bandwidthComparator } from '../components/common/DataTable.tsx';
import { Modal } from '../components/common/Modal.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { useToast } from '../components/common/Toast.tsx';
import {
  Sliders,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Users,
  Layers,
  Zap,
  Globe,
  Network,
  CheckSquare,
  Check,
  RotateCw,
} from 'lucide-react';

export const ProfilesView: React.FC = () => {
  const { selectedRouterId, isMultiRouter, refreshTick, routers } = useRouterContext();
  const { success, error, info } = useToast();

  const [profiles, setProfiles] = useState<PppProfile[]>([]);
  const [pools, setPools] = useState<IpPool[]>([]);
  const [queues, setQueues] = useState<SimpleQueue[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & Bulk actions
  const [selectedProfiles, setSelectedProfiles] = useState<PppProfile[]>([]);
  const [bulkActionType, setBulkActionType] = useState<
    'dns' | 'rate_limit' | 'local_address' | 'remote_address' | 'delete' | null
  >(null);
  const [bulkDnsValue, setBulkDnsValue] = useState('1.1.1.1,8.8.8.8');
  const [bulkRateLimitValue, setBulkRateLimitValue] = useState('20M/20M');
  const [bulkLocalAddressValue, setBulkLocalAddressValue] = useState('10.10.10.1');
  const [bulkRemoteAddressValue, setBulkRemoteAddressValue] = useState('');
  const [isBulkExecuting, setIsBulkExecuting] = useState(false);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PppProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<PppProfile | null>(null);

  // Rate-limit builder helper state
  const [enableBurst, setEnableBurst] = useState(false);
  const [rateLimitForm, setRateLimitForm] = useState({
    uploadVal: '10',
    uploadUnit: 'M',
    downloadVal: '20',
    downloadUnit: 'M',
    burstUpVal: '15',
    burstUpUnit: 'M',
    burstDownVal: '30',
    burstDownUnit: 'M',
    thresholdUpVal: '8',
    thresholdUpUnit: 'M',
    thresholdDownVal: '16',
    thresholdDownUnit: 'M',
    burstTimeUp: '16',
    burstTimeDown: '16',
    priority: '8',
  });

  const [formData, setFormData] = useState<Partial<PppProfile>>({
    name: '',
    localAddress: '',
    remoteAddress: '',
    rateLimit: '',
    parentQueue: '',
    onlyOne: true,
    dnsServer: '1.1.1.1,8.8.8.8',
    comment: '',
    routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profRes, poolRes, queueRes] = await Promise.all([
        api.profiles.getAll(selectedRouterId),
        api.pools.getAll(selectedRouterId).catch(() => ({ data: [] })),
        api.queues.getAll(selectedRouterId).catch(() => ({ data: [] })),
      ]);
      setProfiles(profRes.data || []);
      setPools(poolRes.data || []);
      setQueues(queueRes.data || []);
    } catch (err: any) {
      error('Gagal Memuat Profile', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedRouterId, refreshTick]);

  // Parse existing rate limit string into builder fields
  const parseRateLimitToForm = (rl?: string) => {
    if (!rl) {
      setEnableBurst(false);
      return;
    }
    const parts = rl.trim().split(/\s+/);
    if (parts.length >= 1 && parts[0].includes('/')) {
      const [up, down] = parts[0].split('/');
      const upUnit = up.slice(-1);
      const downUnit = down.slice(-1);
      setRateLimitForm((prev) => ({
        ...prev,
        uploadVal: up.slice(0, -1),
        uploadUnit: ['k', 'M', 'G'].includes(upUnit) ? upUnit : 'M',
        downloadVal: down.slice(0, -1),
        downloadUnit: ['k', 'M', 'G'].includes(downUnit) ? downUnit : 'M',
      }));
    }
    if (parts.length >= 4) {
      setEnableBurst(true);
    } else {
      setEnableBurst(false);
    }
  };

  const computeRateLimitString = () => {
    const rxTx = `${rateLimitForm.uploadVal}${rateLimitForm.uploadUnit}/${rateLimitForm.downloadVal}${rateLimitForm.downloadUnit}`;
    if (!enableBurst) return rxTx;

    const burst = `${rateLimitForm.burstUpVal}${rateLimitForm.burstUpUnit}/${rateLimitForm.burstDownVal}${rateLimitForm.burstDownUnit}`;
    const threshold = `${rateLimitForm.thresholdUpVal}${rateLimitForm.thresholdUpUnit}/${rateLimitForm.thresholdDownVal}${rateLimitForm.thresholdDownUnit}`;
    const burstTime = `${rateLimitForm.burstTimeUp}/${rateLimitForm.burstTimeDown}`;
    const prio = rateLimitForm.priority || '8';

    return `${rxTx} ${burst} ${threshold} ${burstTime} ${prio}`;
  };

  const handleCreateOpen = () => {
    setEditingProfile(null);
    setEnableBurst(false);
    setRateLimitForm({
      uploadVal: '10',
      uploadUnit: 'M',
      downloadVal: '20',
      downloadUnit: 'M',
      burstUpVal: '15',
      burstUpUnit: 'M',
      burstDownVal: '30',
      burstDownUnit: 'M',
      thresholdUpVal: '8',
      thresholdUpUnit: 'M',
      thresholdDownVal: '16',
      thresholdDownUnit: 'M',
      burstTimeUp: '16',
      burstTimeDown: '16',
      priority: '8',
    });
    setFormData({
      name: '',
      localAddress: '',
      remoteAddress: pools[0]?.name || '',
      rateLimit: '10M/20M',
      parentQueue: queues[0]?.name || '',
      onlyOne: true,
      dnsServer: '1.1.1.1,8.8.8.8',
      comment: '',
      routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleEditOpen = (profile: PppProfile) => {
    setEditingProfile(profile);
    parseRateLimitToForm(profile.rateLimit);
    setFormData({
      ...profile,
      routerId: profile.routerId || selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const finalRate = computeRateLimitString();
    const payload = {
      ...formData,
      rateLimit: finalRate,
    };

    const targetRouter = formData.routerId || selectedRouterId;
    try {
      if (editingProfile) {
        await api.profiles.update(targetRouter, editingProfile.name, payload);
        success('Berhasil', `Profile '${formData.name}' berhasil diperbarui.`);
      } else {
        await api.profiles.create(targetRouter, payload);
        success('Berhasil', `Profile '${formData.name}' berhasil dibuat.`);
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      error('Gagal Menyimpan Profile', err.message);
    }
  };

  const handleDeleteProfile = async () => {
    if (!profileToDelete) return;
    const targetRouter = profileToDelete.routerId || selectedRouterId;
    try {
      await api.profiles.delete(targetRouter, profileToDelete.name);
      success('Dihapus', `Profile '${profileToDelete.name}' berhasil dihapus.`);
      setProfileToDelete(null);
      fetchData();
    } catch (err: any) {
      error('Gagal Menghapus Profile', err.message);
    }
  };

  const columns = useMemo<ColumnDef<PppProfile>[]>(() => {
    const cols: ColumnDef<PppProfile>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
            aria-label="Pilih semua profile"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
            aria-label="Pilih profile"
          />
        ),
        size: 38,
      },
      {
        accessorKey: 'name',
        header: 'Nama Profile',
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-sky-500" />
              <span>{p.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'rateLimit',
        header: 'Rate Limit (Tx/Rx)',
        sortingFn: bandwidthComparator,
        cell: ({ getValue }) => {
          const val = String(getValue() || 'Unlimited');
          return (
            <span className="font-mono font-semibold px-2 py-0.5 rounded-sm bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs">
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: 'remoteAddress',
        header: 'Remote Address (Pool)',
        cell: ({ getValue }) => (
          <span className="font-mono text-slate-700 dark:text-zinc-300">{String(getValue() || '—')}</span>
        ),
      },
      {
        accessorKey: 'localAddress',
        header: 'Local Address (Gateway)',
        cell: ({ getValue }) => (
          <span className="font-mono text-slate-500 dark:text-zinc-400">{String(getValue() || '—')}</span>
        ),
      },
      {
        accessorKey: 'parentQueue',
        header: 'Parent Queue',
        cell: ({ getValue }) => (
          <span className="text-slate-600 dark:text-zinc-300 font-mono text-[11px]">
            {String(getValue() || 'none')}
          </span>
        ),
      },
      {
        accessorKey: 'secretCount',
        header: 'Pemakai (Total / Online)',
        cell: ({ row }) => {
          const count = Number(row.original.secretCount) || 0;
          const active = Number(row.original.activeCount) || 0;
          return (
            <div className="flex items-center gap-1.5 font-mono">
              <div className="flex items-center gap-1 text-slate-800 dark:text-zinc-200 font-semibold" title="Total akun PPP Secrets dengan profile ini">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>{count}</span>
              </div>
              {active > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold" title="Pengguna aktif online sekarang">
                  {active} online
                </span>
              ) : (
                <span className="text-[10px] text-slate-400" title="Tidak ada yang sedang online">
                  (0 online)
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'onlyOne',
        header: 'Only One',
        cell: ({ getValue }) => (
          <span className={`text-[10px] font-semibold ${getValue() ? 'text-emerald-500' : 'text-slate-400'}`}>
            {getValue() ? 'YES' : 'NO'}
          </span>
        ),
      },
      {
        accessorKey: 'dnsServer',
        header: 'DNS Server',
        cell: ({ getValue }) => (
          <span className="font-mono text-[10px] text-slate-400">{String(getValue() || '—')}</span>
        ),
      },
      {
        accessorKey: 'comment',
        header: 'Comment',
        cell: ({ getValue }) => (
          <span className="text-slate-500 dark:text-zinc-400 truncate max-w-[150px] block">
            {String(getValue() || '—')}
          </span>
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
      size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditOpen(row.original);
            }}
            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-md"
            title="Edit Profile"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setProfileToDelete(row.original);
            }}
            className="p-1 text-slate-500 hover:text-rose-600 rounded-md"
            title="Hapus Profile"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    });

    return cols;
  }, [isMultiRouter]);

  const handleExecuteBulkAction = async () => {
    if (!bulkActionType) return;
    const targetProfiles = selectedProfiles.length > 0 ? selectedProfiles : profiles;
    if (targetProfiles.length === 0) {
      error('Tidak ada profile', 'Pilih minimal satu profile untuk diproses.');
      return;
    }

    try {
      setIsBulkExecuting(true);
      const items = targetProfiles.map((p) => ({ name: p.name, routerId: p.routerId }));
      const payload: any = {
        action:
          bulkActionType === 'dns'
            ? 'change_dns'
            : bulkActionType === 'rate_limit'
            ? 'change_rate_limit'
            : bulkActionType === 'local_address'
            ? 'change_local_address'
            : bulkActionType === 'remote_address'
            ? 'change_remote_address'
            : 'delete',
        items,
      };
      if (bulkActionType === 'dns') payload.dnsServer = bulkDnsValue.trim();
      if (bulkActionType === 'rate_limit') payload.rateLimit = bulkRateLimitValue.trim();
      if (bulkActionType === 'local_address') payload.localAddress = bulkLocalAddressValue.trim();
      if (bulkActionType === 'remote_address') payload.remoteAddress = bulkRemoteAddressValue.trim();

      const res = await api.profiles.bulkAction(selectedRouterId, payload);
      success(
        'Aksi Massal Selesai',
        `Berhasil memproses ${res.successCount} dari ${items.length} profile.`
      );
      setBulkActionType(null);
      fetchData();
    } catch (err: any) {
      error('Gagal Aksi Massal', err.message);
    } finally {
      setIsBulkExecuting(false);
    }
  };

  const getContextMenuItems = (p: PppProfile) => [
    {
      label: 'Edit Profile',
      icon: <Edit2 className="w-3.5 h-3.5" />,
      action: () => handleEditOpen(p),
    },
    {
      label: 'Salin Nama Profile',
      icon: <Copy className="w-3.5 h-3.5" />,
      action: () => {
        navigator.clipboard.writeText(p.name);
        info('Tersalin', `Nama profile '${p.name}' disalin.`);
      },
    },
    {
      label: 'Salin Rate Limit',
      icon: <Zap className="w-3.5 h-3.5" />,
      action: () => {
        navigator.clipboard.writeText(p.rateLimit || '');
        info('Tersalin', `Rate limit '${p.rateLimit || 'unlimited'}' disalin.`);
      },
      divider: true,
    },
    {
      label: 'Hapus Profile',
      icon: <Trash2 className="w-3.5 h-3.5" />,
      destructive: true,
      action: () => setProfileToDelete(p),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-sky-500" />
            <span>PPP Profiles (Paket Bandwidth & IP Pool)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Konfigurasi paket kecepatan, pool IP remote, parent queue, dan batasan sesi PPPoE
          </p>
        </div>

        <button
          onClick={handleCreateOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Profile Baru</span>
        </button>
      </div>

      {/* DataTable */}
      <DataTable
        data={profiles}
        columns={columns}
        tableId="ppp_profiles"
        loading={loading}
        searchPlaceholder="Cari nama profile, rate limit, pool..."
        getRowId={(p) => p.name}
        onSelectionChange={setSelectedProfiles}
        getContextMenuItems={getContextMenuItems}
        onRowDoubleClick={(p) => handleEditOpen(p)}
        topToolbarActions={
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => {
                const action = e.target.value;
                if (!action) return;
                if (action === 'bulk_dns') {
                  setBulkActionType('dns');
                } else if (action === 'bulk_rate') {
                  setBulkActionType('rate_limit');
                } else if (action === 'bulk_local') {
                  setBulkActionType('local_address');
                } else if (action === 'bulk_remote') {
                  setBulkActionType('remote_address');
                  setBulkRemoteAddressValue(pools[0]?.name || '');
                } else if (action === 'bulk_delete') {
                  setBulkActionType('delete');
                }
                e.target.value = '';
              }}
              defaultValue=""
              className="py-1 px-2.5 text-xs font-medium bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-700 dark:text-zinc-200 focus:outline-hidden"
            >
              <option value="" disabled>
                Aksi Massal Profiles {selectedProfiles.length > 0 ? `(${selectedProfiles.length} dipilih)` : '...'}
              </option>
              <option value="bulk_dns">Ganti DNS Server Massal</option>
              <option value="bulk_rate">Ganti Limitasi (Rate Limit) Massal</option>
              <option value="bulk_local">Ganti Local Address (Gateway) Massal</option>
              <option value="bulk_remote">Ganti Remote Address (IP Pool) Massal</option>
              <option value="bulk_delete">Hapus Profile Terpilih</option>
            </select>
          </div>
        }
      />

      {/* Modal Tambah / Edit Profile */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingProfile ? `Edit Profile: ${editingProfile.name}` : 'Buat PPP Profile Baru'}
        subtitle="Konfigurasi parameter bandwidth dan network untuk pelanggan"
        maxWidth="xl"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
          {/* Router Target Selection */}
          {isMultiRouter && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Target Router MikroTik *
              </label>
              <select
                value={formData.routerId}
                onChange={(e) => setFormData({ ...formData, routerId: e.target.value })}
                disabled={Boolean(editingProfile)}
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

          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Nama Profile *
            </label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: 20M-Family atau VIP-Dedicated"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
          </div>

          {/* User-Friendly Rate Limit Builder */}
          <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Pengaturan Kecepatan (Rate Limit)</span>
              </span>
              <span className="font-mono text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                Output: {computeRateLimitString()}
              </span>
            </div>

            {/* Standard Limit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-zinc-400 font-medium mb-1">Batas Upload (Rx)</label>
                <div className="flex">
                  <input
                    type="number"
                    min="1"
                    value={rateLimitForm.uploadVal}
                    onChange={(e) => setRateLimitForm({ ...rateLimitForm, uploadVal: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-l-lg font-mono text-slate-900 dark:text-white focus:outline-hidden"
                  />
                  <select
                    value={rateLimitForm.uploadUnit}
                    onChange={(e) => setRateLimitForm({ ...rateLimitForm, uploadUnit: e.target.value })}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-zinc-700 border border-l-0 border-slate-300 dark:border-zinc-700 rounded-r-lg font-mono text-slate-800 dark:text-zinc-200"
                  >
                    <option value="k">kbps</option>
                    <option value="M">Mbps</option>
                    <option value="G">Gbps</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-zinc-400 font-medium mb-1">Batas Download (Tx)</label>
                <div className="flex">
                  <input
                    type="number"
                    min="1"
                    value={rateLimitForm.downloadVal}
                    onChange={(e) => setRateLimitForm({ ...rateLimitForm, downloadVal: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-l-lg font-mono text-slate-900 dark:text-white focus:outline-hidden"
                  />
                  <select
                    value={rateLimitForm.downloadUnit}
                    onChange={(e) => setRateLimitForm({ ...rateLimitForm, downloadUnit: e.target.value })}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-zinc-700 border border-l-0 border-slate-300 dark:border-zinc-700 rounded-r-lg font-mono text-slate-800 dark:text-zinc-200"
                  >
                    <option value="k">kbps</option>
                    <option value="M">Mbps</option>
                    <option value="G">Gbps</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Burst Options Toggle */}
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={enableBurst}
                  onChange={(e) => setEnableBurst(e.target.checked)}
                  className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                />
                <span className="font-semibold">Aktifkan Konfigurasi Burst (Lonjakan Kecepatan Awal)</span>
              </label>

              {enableBurst && (
                <div className="mt-3 p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-750 rounded-lg space-y-3 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-zinc-400 font-medium mb-1">Burst Limit Upload</label>
                      <div className="flex">
                        <input
                          type="number"
                          value={rateLimitForm.burstUpVal}
                          onChange={(e) => setRateLimitForm({ ...rateLimitForm, burstUpVal: e.target.value })}
                          className="w-full px-2.5 py-1 font-mono border border-slate-300 dark:border-zinc-700 rounded-l-md bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
                        />
                        <span className="px-2 py-1 bg-slate-100 dark:bg-zinc-700 border border-l-0 border-slate-300 dark:border-zinc-700 rounded-r-md text-slate-800 dark:text-zinc-200">M</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-zinc-400 font-medium mb-1">Burst Limit Download</label>
                      <div className="flex">
                        <input
                          type="number"
                          value={rateLimitForm.burstDownVal}
                          onChange={(e) => setRateLimitForm({ ...rateLimitForm, burstDownVal: e.target.value })}
                          className="w-full px-2.5 py-1 font-mono border border-slate-300 dark:border-zinc-700 rounded-l-md bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
                        />
                        <span className="px-2 py-1 bg-slate-100 dark:bg-zinc-700 border border-l-0 border-slate-300 dark:border-zinc-700 rounded-r-md text-slate-800 dark:text-zinc-200">M</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-zinc-400 font-medium mb-1">Burst Threshold (Up / Down)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={`${rateLimitForm.thresholdUpVal}M`}
                          onChange={(e) => setRateLimitForm({ ...rateLimitForm, thresholdUpVal: e.target.value.replace('M', '') })}
                          className="w-1/2 px-2 py-1 font-mono border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={`${rateLimitForm.thresholdDownVal}M`}
                          onChange={(e) => setRateLimitForm({ ...rateLimitForm, thresholdDownVal: e.target.value.replace('M', '') })}
                          className="w-1/2 px-2 py-1 font-mono border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-zinc-400 font-medium mb-1">Burst Time (Detik)</label>
                      <input
                        type="text"
                        value={`${rateLimitForm.burstTimeUp}/${rateLimitForm.burstTimeDown}`}
                        onChange={(e) => {
                          const [u, d] = e.target.value.split('/');
                          setRateLimitForm({ ...rateLimitForm, burstTimeUp: u || '16', burstTimeDown: d || '16' });
                        }}
                        className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
                        placeholder="16/16"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Remote Address IP Pool Dropdown */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Remote Address (IP Pool) *
              </label>
              <select
                value={formData.remoteAddress || ''}
                onChange={(e) => setFormData({ ...formData, remoteAddress: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              >
                <option value="">-- Pilih IP Pool --</option>
                {pools.map((pool) => (
                  <option key={pool.name} value={pool.name}>
                    {pool.name} ({pool.ranges})
                  </option>
                ))}
              </select>
            </div>

            {/* Parent Queue Dropdown */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Parent Queue (Opsional)
              </label>
              <select
                value={formData.parentQueue || ''}
                onChange={(e) => setFormData({ ...formData, parentQueue: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              >
                <option value="">-- Tanpa Parent (none) --</option>
                {queues.map((q) => (
                  <option key={q.name} value={q.name}>
                    {q.name} ({q.maxLimit || 'unlimited'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Local Address (IP Gateway PPPoE)
              </label>
              <input
                type="text"
                value={formData.localAddress || ''}
                onChange={(e) => setFormData({ ...formData, localAddress: e.target.value })}
                placeholder="Contoh: 10.10.10.1"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                DNS Server Pelanggan
              </label>
              <input
                type="text"
                value={formData.dnsServer || ''}
                onChange={(e) => setFormData({ ...formData, dnsServer: e.target.value })}
                placeholder="1.1.1.1,8.8.8.8"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Catatan / Komentar
            </label>
            <input
              type="text"
              value={formData.comment || ''}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              placeholder="Contoh: Paket promo 20Mbps diskon 10%"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={formData.onlyOne !== false}
                onChange={(e) => setFormData({ ...formData, onlyOne: e.target.checked })}
                className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
              />
              <span className="font-semibold">Only One (Cegah satu akun login ganda simultan)</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-2xs"
            >
              {editingProfile ? 'Simpan Perubahan' : 'Buat Profile'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(profileToDelete)}
        onClose={() => setProfileToDelete(null)}
        onConfirm={handleDeleteProfile}
        title="Hapus PPP Profile"
        itemName={profileToDelete?.name || ''}
        description={
          (profileToDelete?.secretCount || 0) > 0
            ? `Peringatan: Profile ini sedang digunakan oleh ${profileToDelete?.secretCount} akun secret. MikroTik akan menolak penghapusan sampai secret dipindahkan.`
            : 'Profile ini akan dihapus dari router MikroTik.'
        }
        confirmLabel="Hapus Profile"
      />

      {/* Bulk Action Modal */}
      <Modal
        isOpen={Boolean(bulkActionType)}
        onClose={() => setBulkActionType(null)}
        title={
          bulkActionType === 'dns'
            ? 'Ganti DNS Server Massal'
            : bulkActionType === 'rate_limit'
            ? 'Ganti Limitasi (Rate Limit) Massal'
            : bulkActionType === 'local_address'
            ? 'Ganti Local Address (Gateway) Massal'
            : bulkActionType === 'remote_address'
            ? 'Ganti Remote Address (IP Pool) Massal'
            : 'Hapus Profile Massal'
        }
        subtitle={`Akan diterapkan pada ${
          selectedProfiles.length > 0 ? `${selectedProfiles.length} profile terpilih` : `seluruh ${profiles.length} profile`
        }`}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {/* Target Profiles Badges */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Profile Sasaran ({selectedProfiles.length > 0 ? selectedProfiles.length : profiles.length} item):
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-50 dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
              {(selectedProfiles.length > 0 ? selectedProfiles : profiles).map((p) => (
                <span
                  key={p.name}
                  className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 font-mono text-[11px]"
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          {/* Action Specific Fields */}
          {bulkActionType === 'dns' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Pilih Preset DNS Server Cepat:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Cloudflare', val: '1.1.1.1,1.0.0.1' },
                    { label: 'Google', val: '8.8.8.8,8.8.4.4' },
                    { label: 'OpenDNS', val: '208.67.222.222,208.67.220.220' },
                    { label: 'Quad9', val: '9.9.9.9,149.112.112.112' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setBulkDnsValue(preset.val)}
                      className={`px-2 py-1.5 text-[11px] rounded-lg border text-left transition-colors font-mono ${
                        bulkDnsValue === preset.val
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold'
                          : 'border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="font-semibold text-xs font-sans">{preset.label}</div>
                      <div className="text-[10px] opacity-75 truncate">{preset.val}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  DNS Server (Pisahkan dengan koma) *
                </label>
                <input
                  type="text"
                  required
                  value={bulkDnsValue}
                  onChange={(e) => setBulkDnsValue(e.target.value)}
                  placeholder="1.1.1.1,8.8.8.8"
                  className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {bulkActionType === 'rate_limit' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Preset Kecepatan Cepat:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['5M/5M', '10M/10M', '20M/20M', '30M/30M', '50M/50M', '100M/100M', '150M/150M'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkRateLimitValue(preset)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-mono transition-colors ${
                        bulkRateLimitValue === preset
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold'
                          : 'border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Nilai Rate Limit (Tx/Rx) *
                </label>
                <input
                  type="text"
                  required
                  value={bulkRateLimitValue}
                  onChange={(e) => setBulkRateLimitValue(e.target.value)}
                  placeholder="Contoh: 10M/10M atau 20M/20M 30M/30M ..."
                  className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {bulkActionType === 'local_address' && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Local Address Baru (Gateway PPPoE) *
              </label>
              <input
                type="text"
                required
                value={bulkLocalAddressValue}
                onChange={(e) => setBulkLocalAddressValue(e.target.value)}
                placeholder="Contoh: 10.10.10.1 atau 192.168.100.1"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                IP ini akan menjadi default gateway bagi seluruh klien PPPoE yang menggunakan profile target.
              </p>
            </div>
          )}

          {bulkActionType === 'remote_address' && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Pilih IP Pool Remote Address Baru *
              </label>
              <select
                value={bulkRemoteAddressValue}
                onChange={(e) => setBulkRemoteAddressValue(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              >
                <option value="">-- Pilih IP Pool --</option>
                {pools.map((pool) => (
                  <option key={pool.name} value={pool.name}>
                    {pool.name} ({pool.ranges})
                  </option>
                ))}
              </select>
            </div>
          )}

          {bulkActionType === 'delete' && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-300">
              <p className="font-semibold text-xs">Peringatan Penghapusan Massal:</p>
              <p className="text-[11px] mt-1">
                Profil yang dipilih akan dihapus permanen dari router MikroTik. Profil yang masih digunakan oleh akun secret tidak akan dihapus demi mencegah gangguan koneksi klien.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setBulkActionType(null)}
              className="px-4 py-2 font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleExecuteBulkAction}
              disabled={isBulkExecuting}
              className={`px-4 py-2 font-semibold text-white rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 ${
                bulkActionType === 'delete' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'
              }`}
            >
              {isBulkExecuting ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <span>Terapkan Perubahan</span>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
