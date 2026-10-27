import React, { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useRouterContext } from '../context/RouterContext.tsx';
import { api } from '../api/client.ts';
import { IpPool } from '../types/index.ts';
import { DataTable } from '../components/common/DataTable.tsx';
import { Modal } from '../components/common/Modal.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { useToast } from '../components/common/Toast.tsx';
import {
  Database,
  Plus,
  Edit2,
  Trash2,
  Layers,
  AlertCircle,
  Network,
  Activity,
} from 'lucide-react';

export const PoolsView: React.FC = () => {
  const { selectedRouterId, isMultiRouter, refreshTick, routers } = useRouterContext();
  const { success, error, info } = useToast();

  const [pools, setPools] = useState<IpPool[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<IpPool | null>(null);
  const [poolToDelete, setPoolToDelete] = useState<IpPool | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<IpPool>>({
    name: '',
    ranges: '',
    nextPool: 'none',
    comment: '',
    routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
  });

  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.pools.getAll(selectedRouterId);
      if (res.success && Array.isArray(res.data)) {
        setPools(res.data);
      }
    } catch (err: any) {
      error('Gagal Memuat IP Pool', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedRouterId, refreshTick]);

  // Client-side IP Range validation
  const validateRanges = (r: string): boolean => {
    if (!r.trim()) return false;
    const parts = r.split(',').map((p) => p.trim());
    const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((s) => s.trim());
        if (!ipPattern.test(start) || !ipPattern.test(end)) return false;
      } else {
        if (!ipPattern.test(part)) return false;
      }
    }
    return true;
  };

  const handleCreateOpen = () => {
    setEditingPool(null);
    setValidationError(null);
    setFormData({
      name: '',
      ranges: '10.10.10.2-10.10.10.254',
      nextPool: 'none',
      comment: '',
      routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleEditOpen = (p: IpPool) => {
    setEditingPool(p);
    setValidationError(null);
    setFormData({
      ...p,
      nextPool: p.nextPool || 'none',
      routerId: p.routerId || selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleSavePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.ranges) return;

    if (!validateRanges(formData.ranges)) {
      setValidationError('Format IP range tidak valid. Contoh format: 10.10.10.2-10.10.10.254');
      return;
    }

    const targetRouter = formData.routerId || selectedRouterId;
    const payload = {
      ...formData,
      nextPool: formData.nextPool === 'none' ? undefined : formData.nextPool,
    };

    try {
      if (editingPool) {
        await api.pools.update(targetRouter, editingPool.name, payload);
        success('Berhasil', `IP Pool '${formData.name}' berhasil diperbarui.`);
      } else {
        await api.pools.create(targetRouter, payload);
        success('Berhasil', `IP Pool '${formData.name}' berhasil dibuat.`);
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      error('Gagal Menyimpan Pool', err.message);
    }
  };

  const handleDeletePool = async () => {
    if (!poolToDelete) return;
    const targetRouter = poolToDelete.routerId || selectedRouterId;
    try {
      await api.pools.delete(targetRouter, poolToDelete.name);
      success('Dihapus', `IP Pool '${poolToDelete.name}' berhasil dihapus.`);
      setPoolToDelete(null);
      fetchData();
    } catch (err: any) {
      error('Gagal Menghapus IP Pool', err.message);
    }
  };

  const columns = useMemo<ColumnDef<IpPool>[]>(() => {
    const cols: ColumnDef<IpPool>[] = [
      {
        accessorKey: 'name',
        header: 'Nama IP Pool',
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-sky-500" />
              <span className="font-semibold text-slate-900 dark:text-white font-mono">{p.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'ranges',
        header: 'Rentang Alamat IP (Ranges)',
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-sm">
            {String(getValue() || '—')}
          </span>
        ),
      },
      {
        accessorKey: 'usedCount',
        header: 'IP Terpakai',
        cell: ({ getValue }) => {
          const count = Number(getValue()) || 0;
          return (
            <div className="flex items-center gap-1.5 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-slate-800 dark:text-zinc-200">{count} IP aktif</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'nextPool',
        header: 'Next Pool',
        cell: ({ getValue }) => {
          const val = String(getValue() || '');
          return val && val !== 'none' ? (
            <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">{val}</span>
          ) : (
            <span className="text-slate-400 font-mono text-[11px]">— (None)</span>
          );
        },
      },
      {
        accessorKey: 'comment',
        header: 'Comment',
        cell: ({ getValue }) => (
          <span className="text-slate-500 dark:text-zinc-400 truncate max-w-[200px] block">
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
            title="Edit Pool"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPoolToDelete(row.original);
            }}
            className="p-1 text-slate-500 hover:text-rose-600 rounded-md"
            title="Hapus Pool"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    });

    return cols;
  }, [isMultiRouter]);

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" />
            <span>IP Pool (Alokasi IP Dinamis PPPoE)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Daftar rentang IP address yang dialokasikan otomatis kepada klien PPPoE saat dial-up
          </p>
        </div>

        <button
          onClick={handleCreateOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah IP Pool Baru</span>
        </button>
      </div>

      {/* DataTable */}
      <DataTable
        data={pools}
        columns={columns}
        tableId="ip_pools"
        loading={loading}
        searchPlaceholder="Cari nama pool, range IP, next pool..."
        getRowId={(p) => p.name}
        onRowDoubleClick={(p) => handleEditOpen(p)}
      />

      {/* Modal Tambah / Edit Pool */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingPool ? `Edit IP Pool: ${editingPool.name}` : 'Buat IP Pool Baru'}
        subtitle="Pastikan range IP tidak bentrok dengan IP statik router atau subnet lain"
        maxWidth="lg"
      >
        <form onSubmit={handleSavePool} className="space-y-4 text-xs">
          {/* Router Target Selection */}
          {isMultiRouter && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Target Router MikroTik *
              </label>
              <select
                value={formData.routerId}
                onChange={(e) => setFormData({ ...formData, routerId: e.target.value })}
                disabled={Boolean(editingPool)}
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
              Nama Pool *
            </label>
            <input
              type="text"
              required
              disabled={Boolean(editingPool)}
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: pool-pppoe-bronze"
              className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Rentang Alamat IP (Ranges) *
            </label>
            <input
              type="text"
              required
              value={formData.ranges || ''}
              onChange={(e) => {
                setFormData({ ...formData, ranges: e.target.value });
                if (validationError) setValidationError(null);
              }}
              placeholder="Contoh: 10.10.10.2-10.10.10.254 atau 192.168.100.50-192.168.100.200"
              className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
            {validationError && (
              <p className="mt-1 text-rose-500 text-[11px] font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{validationError}</span>
              </p>
            )}
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
              Dapat berupa rentang tunggal (IP1-IP2) atau kombinasi koma (IP1-IP2, IP3-IP4)
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Next Pool (Rantai Alokasi Saat Pool Penuh)
            </label>
            <select
              value={formData.nextPool || 'none'}
              onChange={(e) => setFormData({ ...formData, nextPool: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden font-mono"
            >
              <option value="none">-- (None) Tidak Ada --</option>
              {pools
                .filter((p) => p.name !== editingPool?.name)
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.ranges})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Komentar / Catatan
            </label>
            <input
              type="text"
              value={formData.comment || ''}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              placeholder="Catatan pool"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
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
              {editingPool ? 'Simpan Perubahan' : 'Buat IP Pool'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(poolToDelete)}
        onClose={() => setPoolToDelete(null)}
        onConfirm={handleDeletePool}
        title="Hapus IP Pool"
        itemName={poolToDelete?.name || ''}
        description="Pastikan tidak ada PPP Profile yang menggunakan pool ini sebagai Remote Address. MikroTik akan menolak penghapusan pool yang sedang terikat."
        confirmLabel="Hapus Pool"
      />
    </div>
  );
};
