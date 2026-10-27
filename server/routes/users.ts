import { Router, Response } from 'express';
import { storage } from '../storage.js';
import { hashPassword, AuthenticatedRequest, requireSuperadmin } from '../auth.js';

const router = Router();

// GET all users
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const users = storage.getUsers().map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    allowedMenus: u.allowedMenus || [],
    status: u.status || 'active',
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
  }));
  res.json({ success: true, data: users });
});

// POST create user (Superadmin only)
router.post('/', requireSuperadmin, (req: AuthenticatedRequest, res: Response) => {
  const { username, name, password, role, allowedMenus, status } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ success: false, error: 'Username, Nama Lengkap, dan Password wajib diisi.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password minimal 6 karakter.' });
  }

  try {
    const newUser = storage.createUser({
      username: username.trim(),
      name: name.trim(),
      role: role || 'operator',
      passwordHash: hashPassword(password),
      allowedMenus: Array.isArray(allowedMenus) && allowedMenus.length > 0 ? allowedMenus : ['dashboard'],
      status: status || 'active',
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: 'system',
      routerName: 'Sistem',
      action: 'CREATE',
      targetType: 'ROUTER',
      targetName: newUser.username,
      details: `Membuat akun user baru '${newUser.username}' (${newUser.name}) dengan peran '${newUser.role}' dan akses: [${newUser.allowedMenus.join(', ')}]`,
    });

    res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        role: newUser.role,
        allowedMenus: newUser.allowedMenus,
        status: newUser.status,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal membuat pengguna' });
  }
});

// PUT update user (Superadmin only)
router.put('/:id', requireSuperadmin, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;
  const { name, role, password, allowedMenus, status } = req.body;

  try {
    const patch: any = {};
    if (name) patch.name = name.trim();
    if (role) patch.role = role;
    if (status) patch.status = status;
    if (Array.isArray(allowedMenus)) patch.allowedMenus = allowedMenus;
    if (password && password.trim().length >= 6) {
      patch.passwordHash = hashPassword(password.trim());
    }

    const updated = storage.updateUser(userId, patch);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: 'system',
      routerName: 'Sistem',
      action: 'UPDATE',
      targetType: 'ROUTER',
      targetName: updated.username,
      details: `Memperbarui akun user '${updated.username}' (Status: ${updated.status}, Role: ${updated.role}, Menu: ${updated.allowedMenus.length} akses)`,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        username: updated.username,
        name: updated.name,
        role: updated.role,
        allowedMenus: updated.allowedMenus,
        status: updated.status,
        createdAt: updated.createdAt,
        lastLogin: updated.lastLogin,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memperbarui pengguna' });
  }
});

// DELETE user (Superadmin only)
router.delete('/:id', requireSuperadmin, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;
  const user = storage.getUserById(userId);

  if (!user) {
    return res.status(404).json({ success: false, error: 'User tidak ditemukan.' });
  }

  if (req.user?.userId === userId) {
    return res.status(400).json({ success: false, error: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif.' });
  }

  try {
    storage.deleteUser(userId);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: 'system',
      routerName: 'Sistem',
      action: 'DELETE',
      targetType: 'ROUTER',
      targetName: user.username,
      details: `Menghapus akun user '${user.username}' (${user.name}) dari sistem`,
    });

    res.json({ success: true, message: `User '${user.username}' berhasil dihapus.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal menghapus pengguna' });
  }
});

export default router;
