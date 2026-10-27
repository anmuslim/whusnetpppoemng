import React, { useState } from 'react';
import { useRouterContext } from '../context/RouterContext.tsx';
import { api } from '../api/client.ts';
import { RouterSummary, RouterConnectionTestResult } from '../types/index.ts';
import { Modal } from '../components/common/Modal.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { useToast } from '../components/common/Toast.tsx';
import {
  Server,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Activity,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';

export const RoutersView: React.FC = () => {
  const { routers, refreshRouters, setSelectedRouterId, selectedRouterId, loadingRouters } = useRouterContext();
  const { success, error, info } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<RouterSummary | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 8728,
    username: '',
    password: '',
    mode: 'API' as 'API' | 'API-SSL' | 'REST',
    notes: '',
    isDemo: false,
  });

  // Test Connection Modal
  const [testingRouter, setTestingRouter] = useState<RouterSummary | null>(null);
  const [testResult, setTestResult] = useState<RouterConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Delete Confirm
  const [routerToDelete, setRouterToDelete] = useState<RouterSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Demo Reset Confirm
  const [isResetDemoOpen, setIsResetDemoOpen] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);

  const openCreateModal = () => {
    setEditingRouter(null);
    setFormData({
      name: '',
      host: '',
      port: 8728,
      username: '',
      password: '',
      mode: 'API',
      notes: '',
      isDemo: false,
    });
    setIsFormOpen(true);
  };

  const openEditModal = (r: RouterSummary) => {
    setEditingRouter(r);
    setFormData({
      name: r.name,
      host: r.host,
      port: r.port,
      username: '',
      password: '',
      mode: r.mode === 'DEMO' ? 'API' : r.mode,
      notes: r.notes || '',
      isDemo: r.isDemo,
    });
    setIsFormOpen(true);
  };

  const handleModeChange = (newMode: 'API' | 'API-SSL' | 'REST') => {
    const defaultPort = newMode === 'API-SSL' ? 8729 : newMode === 'REST' ? 443 : 8728;
    setFormData((prev) => ({ ...prev, mode: newMode, port: defaultPort }));
  };

  const handleSaveRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRouter) {
        await api.routers.update(editingRouter.id, formData);
        success('Berhasil', `Router '${formData.name}' berhasil diperbarui.`);
      } else {
        await api.routers.create(formData);
        success('Berhasil', `Router '${formData.name}' berhasil ditambahkan.`);
      }
      setIsFormOpen(false);
      refreshRouters();
    } catch (err: any) {
      error('Gagal Menyimpan Router', err.message);
    }
  };

  const handleDeleteRouter = async () => {
    if (!routerToDelete) return;
    try {
      setIsDeleting(true);
      await api.routers.delete(routerToDelete.id);
      success('Dihapus', `Router '${routerToDelete.name}' berhasil dihapus.`);
      setRouterToDelete(null);
      refreshRouters();
      if (selectedRouterId === routerToDelete.id) {
        setSelectedRouterId('all');
      }
    } catch (err: any) {
      error('Gagal Menghapus', err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTestConnection = async (r: RouterSummary) => {
    setTestingRouter(r);
    setTestResult(null);
    setIsTesting(true);

    try {
      const res = await api.routers.testConnection(r.id);
      if (res.success && res.data) {
        setTestResult(res.data);
        success('Koneksi Sukses', `Terhubung ke ${res.data.identity} (${res.data.version})`);
        refreshRouters();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        identity: r.name,
        version: '',
        uptime: '',
        cpuLoad: 0,
        freeMemory: 0,
        totalMemory: 0,
        boardName: '',
        error: err.message || 'Gagal tersambung ke router MikroTik',
      });
      error('Uji Koneksi Gagal', err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetDemoData = async () => {
    try {
      setIsResettingDemo(true);
      await api.audit.resetDemo();
      success('Reset Berhasil', 'Data demo telah dikembalikan ke kondisi awal.');
      setIsResetDemoOpen(false);
      refreshRouters();
    } catch (err: any) {
      error('Gagal Reset Demo', err.message);
    } finally {
      setIsResettingDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Manajemen Router MikroTik
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Daftarkan dan monitor router MikroTik dengan mode API, API-SSL, atau REST v7
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsResetDemoOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo</span>
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Router Baru</span>
          </button>
        </div>
      </div>

      {/* Loading Progress Indicator */}
      {loadingRouters && (
        <div className="h-1 w-full bg-sky-100/40 dark:bg-zinc-800 rounded-full overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 animate-progress-indeterminate" />
        </div>
      )}

      {/* Router Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {routers.map((r) => {
          const isOnline = r.status === 'online';
          const isSelected = selectedRouterId === r.id;

          return (
            <div
              key={r.id}
              className={`p-5 rounded-xl bg-white dark:bg-zinc-900 border transition-all shadow-xs flex flex-col justify-between ${
                isSelected
                  ? 'border-sky-500 ring-2 ring-sky-500/20'
                  : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              <div>
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-lg ${
                        isOnline
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{r.name}</span>
                        {r.isDemo && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                            DEMO
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        {r.host}:{r.port}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      isOnline
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Details specs */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                    <span>Driver Koneksi:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">{r.mode}</span>
                  </div>

                  <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                    <span>Versi OS:</span>
                    <span className="font-mono text-slate-800 dark:text-zinc-200">{r.version || 'RouterOS v7'}</span>
                  </div>

                  <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                    <span>Hardware:</span>
                    <span className="font-mono text-slate-800 dark:text-zinc-200">{r.boardName || 'MikroTik'}</span>
                  </div>

                  <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                    <span>Uptime:</span>
                    <span className="font-mono text-slate-800 dark:text-zinc-200">{r.uptime || '-'}</span>
                  </div>

                  {r.cpuLoad !== undefined && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px] text-slate-600 dark:text-zinc-400">
                        <span>CPU Load:</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-zinc-100">{r.cpuLoad}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            r.cpuLoad > 75 ? 'bg-rose-500' : r.cpuLoad > 50 ? 'bg-amber-500' : 'bg-sky-500'
                          }`}
                          style={{ width: `${r.cpuLoad}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {r.notes && (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 p-2 rounded-md">
                      {r.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleTestConnection(r)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors border border-slate-200 dark:border-zinc-700"
                >
                  <Activity className="w-3.5 h-3.5 text-sky-500" />
                  <span>Test Koneksi</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setSelectedRouterId(r.id);
                      info('Target Diubah', `Konteks aktif dialihkan ke ${r.name}`);
                    }}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {isSelected ? 'Terpilih' : 'Pilih'}
                  </button>

                  <button
                    onClick={() => openEditModal(r)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                    title="Edit Router"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setRouterToDelete(r)}
                    className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
                    title="Hapus Router"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Tambah / Edit Router */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingRouter ? `Edit Router: ${editingRouter.name}` : 'Tambah Router MikroTik'}
        subtitle="Kredensial disimpan terenkripsi AES-256 di server dan tidak pernah dikirim ke browser"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveRouter} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Nama Pengenal Router *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: Router-Core-IDC atau RB4011-BSD"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
          </div>

          {/* Mode Selector */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Metode Koneksi Driver *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['API', 'API-SSL', 'REST'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  className={`p-2.5 rounded-lg border text-center font-semibold transition-all ${
                    formData.mode === m
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500'
                      : 'border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <p className="text-xs">{m}</p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                    {m === 'REST' ? 'Port 443 / 80' : m === 'API-SSL' ? 'Port 8729' : 'Port 8728'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Alamat Host / IP MikroTik *
              </label>
              <input
                type="text"
                required
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder="192.168.88.1 atau vpn.isp.net"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">Port</label>
              <input
                type="number"
                required
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Username API *
              </label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="api-user"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                {editingRouter ? 'Password Baru (Kosongkan bila tetap)' : 'Password API *'}
              </label>
              <input
                type="password"
                required={!editingRouter}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">Catatan Lokasi</label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Contoh: Gedung Cyber Lt 2, Rack 04"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
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
              {editingRouter ? 'Simpan Perubahan' : 'Daftarkan Router'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Test Koneksi */}
      <Modal
        isOpen={Boolean(testingRouter)}
        onClose={() => setTestingRouter(null)}
        title={`Hasil Uji Koneksi: ${testingRouter?.name}`}
        subtitle={`Target: ${testingRouter?.host}:${testingRouter?.port} (${testingRouter?.mode})`}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          {isTesting ? (
            <div className="py-10 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mx-auto" />
              <p className="font-medium text-slate-700 dark:text-zinc-300">
                Menghubungi RouterOS API...
              </p>
              <p className="text-[11px] text-slate-400">Melakukan otentikasi dan mengambil spesifikasi sistem</p>
            </div>
          ) : testResult ? (
            testResult.success ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300 font-medium">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Koneksi Berhasil! Router MikroTik merespons dengan normal.</span>
                </div>

                <div className="p-3.5 bg-slate-100/80 dark:bg-zinc-800/80 rounded-lg border border-slate-200 dark:border-zinc-700 space-y-2 font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-zinc-700">
                    <span className="text-slate-500 dark:text-zinc-400 font-sans">System Identity:</span>
                    <strong className="text-slate-900 dark:text-white">{testResult.identity}</strong>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-zinc-700">
                    <span className="text-slate-500 dark:text-zinc-400 font-sans">Versi RouterOS:</span>
                    <strong className="text-slate-900 dark:text-white">{testResult.version}</strong>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-zinc-700">
                    <span className="text-slate-500 dark:text-zinc-400 font-sans">Model Hardware:</span>
                    <strong className="text-slate-900 dark:text-white">{testResult.boardName}</strong>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-zinc-700">
                    <span className="text-slate-500 dark:text-zinc-400 font-sans">Uptime:</span>
                    <strong className="text-slate-900 dark:text-white">{testResult.uptime}</strong>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-zinc-700">
                    <span className="text-slate-500 dark:text-zinc-400 font-sans">Beban CPU:</span>
                    <strong className="text-slate-900 dark:text-white">{testResult.cpuLoad}%</strong>
                  </div>

                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 dark:text-zinc-400 font-sans">Memori Bebas:</span>
                    <strong className="text-slate-900 dark:text-white">
                      {testResult.freeMemory} MB / {testResult.totalMemory} MB
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg flex items-start gap-2.5 text-rose-800 dark:text-rose-300">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Koneksi Gagal</p>
                    <p className="text-xs mt-1 text-rose-700 dark:text-rose-400 font-mono">
                      {testResult.error || 'Router tidak dapat dihubungi'}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-100/80 dark:bg-zinc-800/80 rounded-lg text-slate-700 dark:text-zinc-300 space-y-1.5 border border-slate-200 dark:border-zinc-700">
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">Saran Pemecahan Masalah:</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-zinc-300">
                    <li>Pastikan service API aktif di MikroTik: <code className="font-mono bg-slate-200 dark:bg-zinc-700 px-1 rounded">/ip service enable api</code></li>
                    <li>Periksa port firewall dan pastikan port {testingRouter?.port} tidak diblokir</li>
                    <li>Pastikan user memiliki policy <code className="font-mono bg-slate-200 dark:bg-zinc-700 px-1 rounded">api, read, write</code></li>
                  </ul>
                </div>
              </div>
            )
          ) : null}

          <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setTestingRouter(null)}
              className="px-4 py-2 font-semibold text-white bg-slate-800 dark:bg-zinc-700 hover:bg-slate-700 rounded-lg"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Router */}
      <ConfirmDialog
        isOpen={Boolean(routerToDelete)}
        onClose={() => setRouterToDelete(null)}
        onConfirm={handleDeleteRouter}
        title="Hapus Router Dari Sistem"
        itemName={routerToDelete?.name || ''}
        description="Semua data monitoring lokal untuk router ini akan dihapus. Perangkat MikroTik fisik tidak akan terpengaruh."
        confirmLabel="Hapus Router"
        loading={isDeleting}
      />

      {/* Confirm Reset Demo */}
      <ConfirmDialog
        isOpen={isResetDemoOpen}
        onClose={() => setIsResetDemoOpen(false)}
        onConfirm={handleResetDemoData}
        title="Reset Data Demo"
        itemName="3 Router Demo & ~200 Secrets Simulasi"
        description="Data simulasi PPPoE demo akan dikembalikan ke konfigurasi awal bawaan."
        confirmLabel="Reset Data Demo"
        isDestructive={false}
        loading={isResettingDemo}
      />
    </div>
  );
};
