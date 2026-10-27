import { Router, Response } from 'express';
import { routerManager } from '../drivers/manager.js';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';
import { IpPool } from '../drivers/types.js';

const router = Router({ mergeParams: true });

// Helper to validate IP range format (e.g., 10.10.0.2-10.10.0.254 or 192.168.1.100-192.168.1.200)
function validateIpRange(rangeStr: string): boolean {
  if (!rangeStr) return false;
  const parts = rangeStr.split(',').map((p) => p.trim());
  const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((s) => s.trim());
      if (!ipRegex.test(start) || !ipRegex.test(end)) return false;
    } else {
      if (!ipRegex.test(part)) return false;
    }
  }
  return true;
}

// GET pools
router.get('/', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  try {
    const { data, errors } = await routerManager.executeOnRouters<IpPool>(
      routerId,
      async (driver) => {
        return driver.getPools();
      }
    );
    res.json({ success: true, data, errors: Object.keys(errors).length > 0 ? errors : undefined });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil data IP Pool' });
  }
});

// Helper to find driver for a pool when router is 'all'
async function resolvePoolTarget(routerId: string, poolName: string, explicitRouterId?: string) {
  if (explicitRouterId && explicitRouterId !== 'all') {
    const targets = await routerManager.getTargetDrivers(explicitRouterId);
    if (targets.length > 0) return targets[0];
  }
  if (routerId !== 'all') {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length > 0) return targets[0];
  }
  const all = await routerManager.getTargetDrivers('all');
  for (const t of all) {
    try {
      const list = await t.driver.getPools();
      if (list.some((p) => p.name === poolName)) {
        return t;
      }
    } catch {}
  }
  return all[0];
}

// POST create pool
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const routerIdParam = (req.params as any).routerId;
  const targetRouterId = (req.body.routerId && req.body.routerId !== 'all') ? req.body.routerId : routerIdParam;
  const { name, ranges, nextPool, comment } = req.body;

  if (!name || !ranges) {
    return res.status(400).json({ success: false, error: 'Nama pool dan IP Range wajib diisi.' });
  }

  if (!validateIpRange(ranges)) {
    return res.status(400).json({
      success: false,
      error: 'Format IP Range tidak valid. Contoh format yang benar: 10.10.0.2-10.10.0.254 atau 192.168.1.50-192.168.1.150',
    });
  }

  try {
    const targets = await routerManager.getTargetDrivers(targetRouterId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    // Check overlap with existing pools on this router
    const existingPools = await driver.getPools();
    const overlaps = existingPools.filter((p) => p.ranges === ranges.trim());
    if (overlaps.length > 0) {
      // Return note/warning in response
      console.warn(`Peringatan: Range IP identik dengan pool '${overlaps[0].name}'`);
    }

    const newPool = await driver.createPool({
      name: name.trim(),
      ranges: ranges.trim(),
      nextPool: nextPool && nextPool !== 'none' ? nextPool.trim() : undefined,
      comment: comment?.trim() || undefined,
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'CREATE',
      targetType: 'POOL',
      targetName: newPool.name,
      details: `Membuat IP Pool '${newPool.name}' dengan range '${newPool.ranges}'`,
    });

    res.status(201).json({ success: true, data: newPool });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal membuat IP Pool' });
  }
});

// PUT update pool
router.put('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const poolName = req.params.name;
  const patch = req.body;
  const explicitRouter = (patch.routerId && patch.routerId !== 'all') ? patch.routerId : (req.query.routerId as string);

  if (patch.ranges && !validateIpRange(patch.ranges)) {
    return res.status(400).json({
      success: false,
      error: 'Format IP Range tidak valid. Contoh format yang benar: 10.10.0.2-10.10.0.254',
    });
  }

  try {
    const target = await resolvePoolTarget(routerId, poolName, explicitRouter);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = target;

    const updated = await driver.updatePool(poolName, patch);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'UPDATE',
      targetType: 'POOL',
      targetName: poolName,
      details: `Memperbarui IP Pool '${poolName}'`,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memperbarui IP Pool' });
  }
});

// DELETE pool
router.delete('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const poolName = req.params.name;
  const explicitRouter = (req.query.routerId as string) || (req.body?.routerId && req.body.routerId !== 'all' ? req.body.routerId : undefined);

  try {
    const target = await resolvePoolTarget(routerId, poolName, explicitRouter);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = target;

    await driver.deletePool(poolName);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'DELETE',
      targetType: 'POOL',
      targetName: poolName,
      details: `Menghapus IP Pool '${poolName}'`,
    });

    res.json({ success: true, message: `IP Pool '${poolName}' berhasil dihapus.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal menghapus IP Pool' });
  }
});

export default router;
