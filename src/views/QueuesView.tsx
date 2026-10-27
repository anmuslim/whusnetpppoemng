import React, { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { useRouterContext } from '../context/RouterContext.tsx';
import { api } from '../api/client.ts';
import { SimpleQueue } from '../types/index.ts';
import { DataTable, bandwidthComparator } from '../components/common/DataTable.tsx';
import { Modal } from '../components/common/Modal.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { useToast } from '../components/common/Toast.tsx';
import {
  GitFork,
  Plus,
  Edit2,
  Trash2,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  FolderTree,
} from 'lucide-react';

export const QueuesView: React.FC = () => {
  const { selectedRouterId, isMultiRouter, refreshTick, routers } = useRouterContext();
  const { success, error } = useToast();

  const [queues, setQueues] = useState<SimpleQueue[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<SimpleQueue | null>(null);
  const [queueToDelete, setQueueToDelete] = useState<SimpleQueue | null>(null);

  const [formData, setFormData] = useState<Partial<SimpleQueue>>({
    name: '',
    target: '0.0.0.0/0',
    maxLimit: '1G/1G',
    limitAt: '500M/500M',
    priority: '8',
    parent: 'none',
    comment: '',
    routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.queues.getAll(selectedRouterId);
      if (res.success && Array.isArray(res.data)) {
        setQueues(res.data);
      }
    } catch (err: any) {
      error('Gagal Memuat Queue', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedRouterId, refreshTick]);

  const handleCreateOpen = () => {
    setEditingQueue(null);
    setFormData({
      name: '',
      target: '0.0.0.0/0',
      maxLimit: '500M/500M',
      limitAt: '200M/200M',
      priority: '8',
      parent: 'none',
      comment: '',
      routerId: selectedRouterId === 'all' ? routers[0]?.id : selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleEditOpen = (q: SimpleQueue) => {
    setEditingQueue(q);
    setFormData({
      ...q,
      parent: q.parent || 'none',
      routerId: q.routerId || selectedRouterId,
    });
    setIsFormOpen(true);
  };

  const handleSaveQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const targetRouter = formData.routerId || selectedRouterId;
    const payload = {
      ...formData,
      parent: formData.parent === 'none' ? undefined : formData.parent,
    };

    try {
      if (editingQueue) {
        await api.queues.update(targetRouter, editingQueue.name, payload);
        success('Berhasil', `Queue '${formData.name}' berhasil diperbarui.`);
      } else {
        await api.queues.create(targetRouter, payload);
        success('Berhasil', `Queue '${formData.name}' berhasil dibuat.`);
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      error('Gagal Menyimpan Queue', err.message);
    }
  };

  const handleDeleteQueue = async () => {
    if (!queueToDelete) return;
    const targetRouter = queueToDelete.routerId || selectedRouterId;
    try {
      await api.queues.delete(targetRouter, queueToDelete.name);
      success('Dihapus', `Queue '${queueToDelete.name}' berhasil dihapus.`);
      setQueueToDelete(null);
      fetchData();
    } catch (err: any) {
      error('Gagal Menghapus Queue', err.message);
    }
  };

  const columns = useMemo<ColumnDef<SimpleQueue>[]>(() => {
    const cols: ColumnDef<SimpleQueue>[] = [
      {
        accessorKey: 'name',
        header: 'Nama Simple Queue',
        cell: ({ row }) => {
          const q = row.original;
          const isChild = Boolean(q.parent && q.parent !== 'none');
          return (
            <div className={`flex items-center gap-2 ${isChild ? 'pl-4' : ''}`}>
              <GitFork className={`w-3.5 h-3.5 ${isChild ? 'text-slate-400 rotate-90' : 'text-sky-500'}`} />
              <span className="font-semibold text-slate-900 dark:text-white font-mono">{q.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'parent',
        header: 'Parent Queue',
        cell: ({ getValue }) => {
          const val = String(getValue() || '');
          return val && val !== 'none' ? (
            <span className="px-1.5 py-0.5 rounded-sm bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-mono text-[11px]">
              {val}
            </span>
          ) : (
            <span className="text-slate-400 font-mono text-[11px]">— (Root Parent)</span>
          );
        },
      },
      {
        accessorKey: 'target',
        header: 'Target IP / Subnet',
        cell: ({ getValue }) => (
          <span className="font-mono text-slate-700 dark:text-zinc-300">{String(getValue() || '0.0.0.0/0')}</span>
        ),
      },
      {
        accessorKey: 'maxLimit',
        header: 'Max Limit (Tx/Rx)',
        sortingFn: bandwidthComparator,
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            {String(getValue() || 'unlimited')}
          </span>
        ),
      },
      {
        accessorKey: 'limitAt',
        header: 'Limit At (CIR Garansi)',
        cell: ({ getValue }) => (
          <span className="font-mono text-slate-500 dark:text-zinc-400">{String(getValue() || '—')}</span>
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        size: 70,
        cell: ({ getValue }) => (
          <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">
            {String(getValue() || '8')}
          </span>
        ),
      },
      {
        accessorKey: 'childCount',
        header: 'Jumlah Child',
        cell: ({ getValue }) => {
          const count = Number(getValue()) || 0;
          return (
            <span className="text-slate-600 dark:text-zinc-400 font-mono">
              {count > 0 ? `${count} child queue` : '0'}
            </span>
          );
        },
      },
      {
        accessorKey: 'comment',
        header: 'Comment',
        cell: ({ getValue }) => (
          <span className="text-slate-500 dark:text-zinc-400 truncate max-w-[180px] block">
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
            title="Edit Queue"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setQueueToDelete(row.original);
            }}
            className="p-1 text-slate-500 hover:text-rose-600 rounded-md"
            title="Hapus Queue"
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
            <GitFork className="w-5 h-5 text-purple-500" />
            <span>Simple Queues (Parent Queue Bandwidth)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Kelola hierarki bandwidth parent-child untuk alokasi kapasitas agregat
          </p>
        </div>

        <button
          onClick={handleCreateOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Simple Queue</span>
        </button>
      </div>

      {/* DataTable */}
      <DataTable
        data={queues}
        columns={columns}
        tableId="simple_queues"
        loading={loading}
        searchPlaceholder="Cari nama queue, target subnet, parent..."
        getRowId={(q) => q.name}
        onRowDoubleClick={(q) => handleEditOpen(q)}
      />

      {/* Modal Tambah / Edit Queue */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingQueue ? `Edit Queue: ${editingQueue.name}` : 'Buat Simple Queue Baru'}
        subtitle="Konfigurasi target subnet, limit-at, dan hierarki parent"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveQueue} className="space-y-4 text-xs">
          {/* Router Target Selection */}
          {isMultiRouter && (
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Target Router MikroTik *
              </label>
              <select
                value={formData.routerId}
                onChange={(e) => setFormData({ ...formData, routerId: e.target.value })}
                disabled={Boolean(editingQueue)}
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
              Nama Queue *
            </label>
            <input
              type="text"
              required
              disabled={Boolean(editingQueue)}
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: parent-total-idc atau parent-broadband"
              className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Target Subnet / IP
              </label>
              <input
                type="text"
                value={formData.target || ''}
                onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                placeholder="10.10.0.0/16 atau 0.0.0.0/0"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Parent Queue
              </label>
              <select
                value={formData.parent || 'none'}
                onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              >
                <option value="none">-- Tidak Ada (Jadikan Root Parent) --</option>
                {queues
                  .filter((q) => q.name !== editingQueue?.name)
                  .map((q) => (
                    <option key={q.name} value={q.name}>
                      {q.name} ({q.maxLimit})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Max Limit (Upload/Download) *
              </label>
              <input
                type="text"
                required
                value={formData.maxLimit || ''}
                onChange={(e) => setFormData({ ...formData, maxLimit: e.target.value })}
                placeholder="Contoh: 1G/1G atau 500M/500M"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Limit At (CIR Garansi)
              </label>
              <input
                type="text"
                value={formData.limitAt || ''}
                onChange={(e) => setFormData({ ...formData, limitAt: e.target.value })}
                placeholder="Contoh: 200M/200M"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Priority (1 Tertinggi - 8 Terendah)
              </label>
              <select
                value={formData.priority || '8'}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden font-mono"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                  <option key={p} value={String(p)}>
                    Priority {p} {p === 1 ? '(VIP / Realtime)' : p === 8 ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Komentar
              </label>
              <input
                type="text"
                value={formData.comment || ''}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                placeholder="Catatan administrasi queue"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
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
              {editingQueue ? 'Simpan Perubahan' : 'Buat Queue'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(queueToDelete)}
        onClose={() => setQueueToDelete(null)}
        onConfirm={handleDeleteQueue}
        title="Hapus Simple Queue"
        itemName={queueToDelete?.name || ''}
        description={
          (queueToDelete?.childCount || 0) > 0
            ? `Peringatan: Queue ini memiliki ${queueToDelete?.childCount} child queue. Anda harus memindahkan atau menghapus child queue terlebih dahulu.`
            : 'Pastikan tidak ada PPP Profile yang memakai queue ini sebagai parent.'
        }
        confirmLabel="Hapus Queue"
      />
    </div>
  );
};
