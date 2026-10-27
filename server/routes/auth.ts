import { Router, Response } from 'express';
import { storage } from '../storage.js';
import { hashPassword, generateToken, AuthenticatedRequest } from '../auth.js';

const router = Router();

router.post('/login', (req, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username dan password wajib diisi.' });
  }

  const user = storage.getUser(username);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Username atau password salah.' });
  }

  const hashed = hashPassword(password);
  if (user.passwordHash !== hashed) {
    return res.status(401).json({ success: false, error: 'Username atau password salah.' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ success: false, error: 'Akun Anda telah dinonaktifkan (suspended). Hubungi Superadmin.' });
  }

  // Update last login
  storage.updateUser(user.id, { lastLogin: new Date().toISOString() });

  const token = generateToken({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    allowedMenus: user.allowedMenus || [],
  });

  storage.addAuditLog({
    username: user.username,
    routerId: 'system',
    routerName: 'Sistem',
    action: 'TEST',
    targetType: 'ROUTER',
    targetName: user.username,
    details: `Pengguna '${user.username}' (${user.name}) berhasil masuk ke sistem`,
  });

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      allowedMenus: user.allowedMenus || [],
      status: user.status || 'active',
    },
  });
});

router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Tidak terotentikasi' });
  }
  const user = storage.getUser(req.user.username);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ success: false, error: 'Akun dinonaktifkan.' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      allowedMenus: user.allowedMenus || [],
      status: user.status || 'active',
      lastLogin: user.lastLogin,
    },
  });
});

router.post('/change-password', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Tidak terotentikasi' });
  }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Password saat ini dan password baru wajib diisi.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Password baru minimal 6 karakter.' });
  }

  const user = storage.getUser(req.user.username);
  if (!user) return res.status(404).json({ success: false, error: 'User tidak ditemukan.' });

  if (user.passwordHash !== hashPassword(currentPassword)) {
    return res.status(400).json({ success: false, error: 'Password saat ini salah.' });
  }

  storage.updateUserPassword(user.username, hashPassword(newPassword));

  storage.addAuditLog({
    username: user.username,
    routerId: 'system',
    routerName: 'Sistem',
    action: 'UPDATE',
    targetType: 'ROUTER',
    targetName: user.username,
    details: 'Pengguna memperbarui kata sandi akun',
  });

  res.json({ success: true, message: 'Password berhasil diperbarui.' });
});

export default router;
