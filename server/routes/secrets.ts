import { Router, Response } from 'express';
import { routerManager } from '../drivers/manager.js';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';
import { PppSecret } from '../drivers/types.js';

const router = Router({ mergeParams: true });

// GET secrets
router.get('/', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  try {
    const { data, errors } = await routerManager.executeOnRouters<PppSecret>(
      routerId,
      async (driver) => {
        return driver.getSecrets();
      }
    );
    res.json({ success: true, data, errors: Object.keys(errors).length > 0 ? errors : undefined });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal memuat daftar secret' });
  }
});

// POST create secret
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const routerIdParam = (req.params as any).routerId;
  const targetRouterId = (req.body.routerId && req.body.routerId !== 'all') ? req.body.routerId : routerIdParam;
  const { name, password, service, profile, localAddress, remoteAddress, callerId, disabled, comment } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Nama secret (username PPPoE) wajib diisi.' });
  }

  try {
    const targets = await routerManager.getTargetDrivers(targetRouterId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    const newSecret = await driver.createSecret({
      name: name.trim(),
      password: password || '',
      service: service || 'pppoe',
      profile: profile || 'default',
      localAddress: localAddress?.trim() || undefined,
      remoteAddress: remoteAddress?.trim() || undefined,
      callerId: callerId?.trim() || undefined,
      disabled: Boolean(disabled),
      comment: comment?.trim() || undefined,
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'CREATE',
      targetType: 'SECRET',
      targetName: newSecret.name,
      details: `Membuat secret baru '${newSecret.name}' dengan profile '${newSecret.profile}'`,
    });

    res.status(201).json({ success: true, data: newSecret });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal membuat secret' });
  }
});

// Helper to find driver for an item when router is 'all'
async function resolveSecretTarget(routerId: string, secretName: string, explicitRouterId?: string) {
  if (explicitRouterId && explicitRouterId !== 'all') {
    const targets = await routerManager.getTargetDrivers(explicitRouterId);
    if (targets.length > 0) return targets[0];
  }
  if (routerId !== 'all') {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length > 0) return targets[0];
  }
  // Search across all routers
  const all = await routerManager.getTargetDrivers('all');
  for (const t of all) {
    try {
      const list = await t.driver.getSecrets();
      if (list.some((s) => s.name === secretName)) {
        return t;
      }
    } catch {}
  }
  return all[0];
}

// PUT update secret
router.put('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const secretName = req.params.name;
  const patch = req.body;
  const explicitRouter = (patch.routerId && patch.routerId !== 'all') ? patch.routerId : (req.query.routerId as string);

  try {
    const target = await resolveSecretTarget(routerId, secretName, explicitRouter);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = target;

    const updated = await driver.updateSecret(secretName, patch);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'UPDATE',
      targetType: 'SECRET',
      targetName: secretName,
      details: `Memperbarui secret '${secretName}'`,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memperbarui secret' });
  }
});

// DELETE secret
router.delete('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const secretName = req.params.name;
  const explicitRouter = (req.query.routerId as string) || (req.body?.routerId && req.body.routerId !== 'all' ? req.body.routerId : undefined);

  try {
    const target = await resolveSecretTarget(routerId, secretName, explicitRouter);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = target;

    await driver.deleteSecret(secretName);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'DELETE',
      targetType: 'SECRET',
      targetName: secretName,
      details: `Menghapus secret '${secretName}'`,
    });

    res.json({ success: true, message: `Secret '${secretName}' berhasil dihapus.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal menghapus secret' });
  }
});

// POST bulk action
router.post('/bulk-action', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const { action, items, targetProfile } = req.body; // items: Array<{ name: string, routerId?: string }>

  if (!action || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Aksi dan daftar secret wajib diisi.' });
  }

  try {
    let successCount = 0;
    const errors: Record<string, string> = {};

    // Group items by routerId if specified or use target routerId
    for (const item of items) {
      const targetRouterId = item.routerId || routerId;
      try {
        const targets = await routerManager.getTargetDrivers(targetRouterId);
        if (targets.length === 0) continue;
        const { driver } = targets[0];

        if (action === 'enable') {
          await driver.setSecretDisabled(item.name, false);
          successCount++;
        } else if (action === 'disable') {
          await driver.setSecretDisabled(item.name, true);
          successCount++;
        } else if (action === 'delete') {
          await driver.deleteSecret(item.name);
          successCount++;
        } else if (action === 'change_profile') {
          if (!targetProfile) throw new Error('Target profile tidak ditentukan');
          await driver.updateSecret(item.name, { profile: targetProfile });
          successCount++;
        }
      } catch (err: any) {
        errors[item.name] = err.message || 'Gagal';
      }
    }

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: routerId,
      routerName: routerId === 'all' ? 'Semua Router' : routerId,
      action: action === 'delete' ? 'DELETE' : 'UPDATE',
      targetType: 'SECRET',
      targetName: `${items.length} secrets`,
      details: `Aksi massal [${action}] pada ${successCount} dari ${items.length} secret`,
    });

    res.json({
      success: true,
      successCount,
      total: items.length,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal menjalankan aksi massal' });
  }
});

export default router;
