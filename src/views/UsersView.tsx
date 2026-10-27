import React, { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { User } from '../types/index.ts';
import { api } from '../api/client.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { DataTable } from '../components/common/DataTable.tsx';
import { Modal } from '../components/common/Modal.tsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx';
import { useToast } from '../components/common/Toast.tsx';
import {
  Users as UsersIcon,
  UserCheck,
  UserX,
  Shield,
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  LayoutDashboard,
  Router as RouterIcon,
  Activity,
  Sliders,
  GitFork,
  Database,
  History,
  Lock,
} from 'lucide-react';

export const ALL_MENUS = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Ringkasan & Metrik', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'routers', label: 'Router MikroTik', desc: 'Kelola Router & Tes', icon: <RouterIcon className="w-3.5 h-3.5" /> },
  { id: 'secrets', label: 'PPP Secrets', desc: 'Pengguna PPPoE & Isolir', icon: <KeyRound className="w-3.5 h-3.5" /> },
  { id: 'active', label: 'PPP Active', desc: 'Sesi Online Realtime & Kick', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'profiles', label: 'PPP Profiles', desc: 'Paket Bandwidth & IP', icon: <Sliders className="w-3.5 h-3.5" /> },
  { id: 'queues', label: 'Simple Queues', desc: 'Manajemen Queue & Limit', icon: <GitFork className="w-3.5 h-3.5" /> },
  { id: 'pools', label: 'IP Pool', desc: 'Alokasi IP Address Pool', icon: <Database className="w-3.5 h-3.5" /> },
  { id: 'audit', label: 'Riwayat Aktivitas', desc: 'Audit Log & Jejak Aksi', icon: <History className="w-3.5 h-3.5" /> },
  { id: 'users', label: 'Manajemen User', desc: 'Kelola User & Hak Akses', icon: <UsersIcon className="w-3.5 h-3.5" /> },
];

export const UsersView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { success, error, info } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    username: string;
    name: string;
    password?: string;
    role: 'superadmin' | 'operator' | 'technician';
    allowedMenus: string[];
    status: 'active' | 'suspended';
  }>({
    username: '',
    name: '',
    password: '',
    role: 'operator',
    allowedMenus: ['dashboard', 'secrets', 'active'],
    status: 'active',
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.users.getAll();
      if (res.success && Array.isArray(res.data)) {
        setUsers(res.data);
      }
    } catch (err: any) {
      error('Gagal Memuat Pengguna', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateOpen = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      name: '',
      password: '',
      role: 'operator',
      allowedMenus: ['dashboard', 'secrets', 'active', 'queues'],
      status: 'active',
    });
    setIsFormOpen(true);
  };

  const handleEditOpen = (u: User) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      name: u.name,
      password: '',
      role: (u.role as any) || 'operator',
      allowedMenus: u.allowedMenus || ['dashboard'],
      status: u.status || 'active',
    });
    setIsFormOpen(true);
  };

  const handleToggleMenu = (menuId: string) => {
    setFormData((prev) => {
      const exists = prev.allowedMenus.includes(menuId);
      const next = exists
        ? prev.allowedMenus.filter((m) => m !== menuId)
        : [...prev.allowedMenus, menuId];
      return { ...prev, allowedMenus: next };
    });
  };

  const handleSelectAllMenus = () => {
    setFormData((prev) => ({
      ...prev,
      allowedMenus: ALL_MENUS.map((m) => m.id),
    }));
  };

  const handleClearAllMenus = () => {
    setFormData((prev) => ({
      ...prev,
      allowedMenus: ['dashboard'],
    }));
  };

  const handleRoleChange = (newRole: 'superadmin' | 'operator' | 'technician') => {
    if (newRole === 'superadmin') {
      setFormData((prev) => ({
        ...prev,
        role: newRole,
        allowedMenus: ALL_MENUS.map((m) => m.id),
      }));
    } else if (newRole === 'operator') {
      setFormData((prev) => ({
        ...prev,
        role: newRole,
        allowedMenus: ['dashboard', 'secrets', 'active', 'queues', 'audit'],
      }));
    } else if (newRole === 'technician') {
      setFormData((prev) => ({
        ...prev,
        role: newRole,
        allowedMenus: ['dashboard', 'routers', 'active', 'pools'],
      }));
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username) return;

    if (!editingUser && (!formData.password || formData.password.length < 6)) {
      error('Password Tidak Valid', 'Password baru minimal 6 karakter.');
      return;
    }

    try {
      if (editingUser) {
        await api.users.update(editingUser.id, formData);
        success('User Diperbarui', `Akun '${formData.username}' berhasil diperbarui.`);
      } else {
        await api.users.create(formData);
        success('User Dibuat', `Akun baru '${formData.username}' berhasil ditambahkan.`);
      }
      setIsFormOpen(false);
      fetchUsers();
    } catch (err: any) {
      error('Gagal Menyimpan User', err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await api.users.delete(userToDelete.id);
      success('User Dihapus', `Akun '${userToDelete.username}' berhasil dihapus.`);
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      error('Gagal Menghapus User', err.message);
    }
  };

  const columns = useMemo<ColumnDef<User>[]>(() => {
    return [
      {
        accessorKey: 'username',
        header: 'Username',
        cell: ({ row }) => {
          const u = row.original;
          const isMe = currentUser?.username === u.username;
          return (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 flex items-center justify-center font-bold font-mono text-sky-700 dark:text-sky-300 uppercase text-xs">
                {u.username.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-900 dark:text-white">
                  <span>{u.username}</span>
                  {isMe && (
                    <span className="text-[10px] bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 px-1.5 py-0.2 rounded-full font-sans font-bold">
                      Anda
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-sans block">{u.name}</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'role',
        header: 'Peran (Role)',
        cell: ({ getValue }) => {
          const r = String(getValue() || 'operator');
          const isSuper = r === 'superadmin';
          const isTeknisi = r === 'technician';
          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                isSuper
                  ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                  : isTeknisi
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  : 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
              }`}
            >
              <Shield className="w-3 h-3" />
              <span className="capitalize">{r}</span>
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status Akun',
        cell: ({ getValue }) => {
          const st = getValue() === 'suspended' ? 'suspended' : 'active';
          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                st === 'active'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${st === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="capitalize">{st === 'active' ? 'Aktif' : 'Suspended'}</span>
            </span>
          );
        },
      },
      {
        accessorKey: 'allowedMenus',
        header: 'Hak Akses Menu',
        cell: ({ row }) => {
          const u = row.original;
          const isSuper = u.role === 'superadmin';
          if (isSuper) {
            return (
              <span className="text-purple-600 dark:text-purple-400 font-semibold text-[11px] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Seluruh Menu (Akses Penuh)</span>
              </span>
            );
          }

          const menus = u.allowedMenus || [];
          return (
            <div className="flex flex-wrap gap-1 max-w-sm">
              {menus.map((m) => {
                const item = ALL_MENUS.find((x) => x.id === m);
                return (
                  <span
                    key={m}
                    className="px-1.5 py-0.5 rounded-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-[10px] font-medium border border-slate-200 dark:border-zinc-700"
                  >
                    {item?.label || m}
                  </span>
                );
              })}
              {menus.length === 0 && <span className="text-slate-400 text-[10px]">Tanpa akses menu</span>}
            </div>
          );
        },
      },
      {
        accessorKey: 'lastLogin',
        header: 'Login Terakhir',
        cell: ({ getValue }) => {
          const val = getValue();
          if (!val) return <span className="text-slate-400 text-[10px]">—</span>;
          return (
            <span className="text-[11px] font-mono text-slate-600 dark:text-zinc-400">
              {new Date(String(val)).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: 'Aksi',
        size: 90,
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = currentUser?.username === u.username;
          const isDefaultAdmin = u.username === 'admin';

          return (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditOpen(u);
                }}
                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-md"
                title="Edit Pengguna & Hak Akses"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              {!isDefaultAdmin && !isSelf && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserToDelete(u);
                  }}
                  className="p-1 text-slate-500 hover:text-rose-600 rounded-md"
                  title="Hapus Pengguna"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        },
      },
    ];
  }, [currentUser]);

  return (
    <div className="space-y-4">
      {/* Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-indigo-500" />
            <span>Manajemen Pengguna & Pembatasan Akses Menu</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>Kelola akun operator/teknisi dengan pembatasan akses per menu.</span>
            <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold">
              Setiap aksi user otomatis tercatat dalam Riwayat Aktivitas
            </span>
          </p>
        </div>

        <button
          onClick={handleCreateOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah User Baru</span>
        </button>
      </div>

      {/* Info Card */}
      <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 rounded-xl flex items-start gap-3 text-xs text-indigo-900 dark:text-indigo-200">
        <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Keamanan Multi-User & Audit Trail</p>
          <p className="text-indigo-700 dark:text-indigo-300 text-[11px] leading-relaxed">
            Pengguna yang login hanya dapat melihat menu yang telah Anda izinkan. Saat pengguna melakukan penambahan, perubahan, isolir pelanggan, pemutusan sesi aktif, maupun manipulasi queue, nama dan username mereka akan dicatat secara permanen di audit log.
          </p>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={users}
        columns={columns}
        tableId="app_users"
        loading={loading}
        searchPlaceholder="Cari username, nama lengkap, role..."
        getRowId={(u) => u.id}
        onRowDoubleClick={(u) => handleEditOpen(u)}
      />

      {/* Modal Tambah / Edit User */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingUser ? `Edit Pengguna: ${editingUser.username}` : 'Tambah Pengguna Baru'}
        subtitle="Atur kredensial login, peran, status, dan menu yang dapat diakses"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Username Login *
              </label>
              <input
                type="text"
                required
                disabled={Boolean(editingUser)}
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                placeholder="misal: operator1"
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Nama Lengkap *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Bpk. Rahmat (Staf NOC)"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                {editingUser ? 'Password Baru (Opsional)' : 'Password Login *'}
              </label>
              <input
                type="password"
                required={!editingUser}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 6 karakter'}
                className="w-full px-3 py-2 font-mono bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Status Akun
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-hidden"
              >
                <option value="active">Aktif (Dapat Login)</option>
                <option value="suspended">Suspended / Nonaktif</option>
              </select>
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Peran Akun (Role Preset)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleRoleChange('superadmin')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.role === 'superadmin'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200'
                    : 'border-slate-200 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                  <span>Superadmin</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">Semua menu & kelola user</p>
              </button>

              <button
                type="button"
                onClick={() => handleRoleChange('operator')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.role === 'operator'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
                    : 'border-slate-200 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <UsersIcon className="w-3.5 h-3.5 text-sky-500" />
                  <span>Operator</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">Secrets, Active, Queues</p>
              </button>

              <button
                type="button"
                onClick={() => handleRoleChange('technician')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.role === 'technician'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                    : 'border-slate-200 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <RouterIcon className="w-3.5 h-3.5 text-amber-500" />
                  <span>Teknisi</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">Router, Pool, Monitoring</p>
              </button>
            </div>
          </div>

          {/* Menu Permissions Checkboxes */}
          <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-zinc-750">
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-200 block">
                  Pembatasan Menu (Hak Akses)
                </span>
                <span className="text-[10px] text-slate-400">
                  Pilih menu yang diizinkan untuk dibuka oleh pengguna ini
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllMenus}
                  className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Pilih Semua
                </button>
                <span className="text-slate-300 dark:text-zinc-600">|</span>
                <button
                  type="button"
                  onClick={handleClearAllMenus}
                  className="text-[10px] font-semibold text-slate-500 hover:underline"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_MENUS.map((menu) => {
                const isChecked = formData.allowedMenus.includes(menu.id);
                return (
                  <label
                    key={menu.id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-sky-300 dark:border-sky-800 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-zinc-750 bg-slate-100/50 dark:bg-zinc-900/40 text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleMenu(menu.id)}
                      className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5 mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <span className={isChecked ? 'text-sky-500' : 'text-slate-400'}>{menu.icon}</span>
                        <span>{menu.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{menu.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
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
              {editingUser ? 'Simpan Perubahan' : 'Buat User Baru'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete User Confirm */}
      <ConfirmDialog
        isOpen={Boolean(userToDelete)}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleDeleteUser}
        title="Hapus Pengguna"
        itemName={userToDelete?.username || ''}
        description={`Akun '${userToDelete?.username}' (${userToDelete?.name}) akan dihapus permanen. Pengguna tidak akan dapat login lagi.`}
        confirmLabel="Hapus Pengguna"
      />
    </div>
  );
};
