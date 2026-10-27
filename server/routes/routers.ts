import { Router, Response } from 'express';
import { storage } from '../storage.js';
import { routerManager } from '../drivers/manager.js';
import { encrypt } from '../crypto.js';
import { AuthenticatedRequest } from '../auth.js';
import { RouterConfig } from '../drivers/types.js';

const router = Router();

// GET all routers
router.get('/', (_req, res: Response) => {
  const list = routerManager.getRouterSummaries();
  res.json({ success: true, data: list });
});

// POST create router
router.post('/', (req: AuthenticatedRequest, res: Response) => {
  const { name, host, port, username, password, mode, notes, isDemo } = req.body;

  if (!name || !host || !username) {
    return res.status(400).json({ success: false, error: 'Nama router, host/IP, dan username wajib diisi.' });
  }

  const existing = storage.getRouters().find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ success: false, error: `Router dengan nama '${name}' sudah terdaftar.` });
  }

  const defaultPort = mode === 'API-SSL' ? 8729 : mode === 'REST' ? 443 : 8728;
  const newRouter: RouterConfig = {
    id: `router-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    host: host.trim(),
    port: Number(port) || defaultPort,
    username: username.trim(),
    encryptedPassword: password ? encrypt(password) : undefined,
    mode: mode || 'API',
    notes: notes?.trim() || '',
    isDemo: Boolean(isDemo),
    status: 'checking',
    lastSeen: new Date().toISOString(),
  };

  storage.addRouter(newRouter);

  storage.addAuditLog({
    username: req.user?.username || 'admin',
    routerId: newRouter.id,
    routerName: newRouter.name,
    action: 'CREATE',
    targetType: 'ROUTER',
    targetName: newRouter.name,
    details: `Menambahkan router baru ${newRouter.name} (${newRouter.host}:${newRouter.port}) dengan mode ${newRouter.mode}`,
  });

  res.status(201).json({
    success: true,
    data: {
      id: newRouter.id,
      name: newRouter.name,
      host: newRouter.host,
      port: newRouter.port,
      mode: newRouter.mode,
      notes: newRouter.notes,
      isDemo: newRouter.isDemo,
      hasPassword: Boolean(newRouter.encryptedPassword),
      status: newRouter.status,
    },
  });
});

// PUT update router
router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, host, port, username, password, mode, notes, isDemo } = req.body;

  const current = storage.getRouter(id);
  if (!current) {
    return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
  }

  const patch: Partial<RouterConfig> = {};
  if (name) patch.name = name.trim();
  if (host) patch.host = host.trim();
  if (port) patch.port = Number(port);
  if (username) patch.username = username.trim();
  if (password) patch.encryptedPassword = encrypt(password);
  if (mode) patch.mode = mode;
  if (notes !== undefined) patch.notes = notes.trim();
  if (isDemo !== undefined) patch.isDemo = Boolean(isDemo);

  const updated = storage.updateRouter(id, patch);
  routerManager.invalidateRouter(id);

  storage.addAuditLog({
    username: req.user?.username || 'admin',
    routerId: updated.id,
    routerName: updated.name,
    action: 'UPDATE',
    targetType: 'ROUTER',
    targetName: updated.name,
    details: `Memperbarui konfigurasi router ${updated.name}`,
  });

  res.json({
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      host: updated.host,
      port: updated.port,
      mode: updated.mode,
      notes: updated.notes,
      isDemo: Boolean(updated.isDemo),
      hasPassword: Boolean(updated.encryptedPassword),
      status: updated.status,
    },
  });
});

// DELETE router
router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const current = storage.getRouter(id);
  if (!current) {
    return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
  }

  storage.deleteRouter(id);
  routerManager.invalidateRouter(id);

  storage.addAuditLog({
    username: req.user?.username || 'admin',
    routerId: current.id,
    routerName: current.name,
    action: 'DELETE',
    targetType: 'ROUTER',
    targetName: current.name,
    details: `Menghapus router ${current.name} dari sistem`,
  });

  res.json({ success: true, message: `Router '${current.name}' berhasil dihapus.` });
});

// POST test router connection
router.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const current = storage.getRouter(id);
  if (!current) {
    return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
  }

  try {
    const driver = routerManager.getDriver(current);
    const result = await driver.testConnection();

    if (result.success) {
      storage.updateRouter(id, {
        status: 'online',
        lastSeen: new Date().toISOString(),
        lastError: undefined,
        identity: result.identity,
        version: result.version,
        uptime: result.uptime,
        cpuLoad: result.cpuLoad,
        freeMemory: result.freeMemory,
        totalMemory: result.totalMemory,
        boardName: result.boardName,
      });

      storage.addAuditLog({
        username: req.user?.username || 'admin',
        routerId: current.id,
        routerName: current.name,
        action: 'TEST',
        targetType: 'ROUTER',
        targetName: current.name,
        details: `Uji koneksi sukses: ${result.identity} (${result.version}), CPU: ${result.cpuLoad}%`,
      });

      return res.json({ success: true, data: result });
    } else {
      storage.updateRouter(id, {
        status: 'offline',
        lastError: result.error,
      });

      return res.status(502).json({
        success: false,
        error: result.error || 'Uji koneksi gagal',
        data: result,
      });
    }
  } catch (err: any) {
    const errMsg = err.message || 'Gagal menghubungi router';
    storage.updateRouter(id, {
      status: 'offline',
      lastError: errMsg,
    });
    return res.status(502).json({ success: false, error: errMsg });
  }
});

export default router;
