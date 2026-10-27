import { Router, Response } from 'express';
import { routerManager } from '../drivers/manager.js';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';
import { PppProfile } from '../drivers/types.js';

const router = Router({ mergeParams: true });

// GET profiles with accurate secret and active connection counts
router.get('/', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  try {
    const [profilesRes, secretsRes, activeRes] = await Promise.all([
      routerManager.executeOnRouters<PppProfile>(routerId, async (driver) => driver.getProfiles()),
      routerManager.executeOnRouters<any>(routerId, async (driver) => driver.getSecrets()).catch(() => ({ data: [], errors: {} })),
      routerManager.executeOnRouters<any>(routerId, async (driver) => driver.getActive()).catch(() => ({ data: [], errors: {} })),
    ]);

    const secrets = secretsRes.data || [];
    const active = activeRes.data || [];

    // Map secret username to profile
    const userToProfile = new Map<string, string>();
    for (const s of secrets) {
      const profName = s.profile || 'default';
      userToProfile.set(`${s.routerId || ''}:::${s.name}`, profName);
      userToProfile.set(s.name, profName);
    }

    // Tally secret counts by router+profile and by profile
    const secretCountsByRouterAndProfile = new Map<string, number>();
    const secretCountsByProfile = new Map<string, number>();

    for (const s of secrets) {
      const profName = s.profile || 'default';
      secretCountsByProfile.set(profName, (secretCountsByProfile.get(profName) || 0) + 1);
      const compositeKey = `${s.routerId || ''}:::${profName}`;
      secretCountsByRouterAndProfile.set(compositeKey, (secretCountsByRouterAndProfile.get(compositeKey) || 0) + 1);
    }

    // Tally active session counts by profile
    const activeCountsByRouterAndProfile = new Map<string, number>();
    const activeCountsByProfile = new Map<string, number>();

    for (const a of active) {
      const profName =
        userToProfile.get(`${a.routerId || ''}:::${a.name}`) ||
        userToProfile.get(a.name) ||
        'default';
      activeCountsByProfile.set(profName, (activeCountsByProfile.get(profName) || 0) + 1);
      const compositeKey = `${a.routerId || ''}:::${profName}`;
      activeCountsByRouterAndProfile.set(compositeKey, (activeCountsByRouterAndProfile.get(compositeKey) || 0) + 1);
    }

    const enrichedProfiles = profilesRes.data.map((p) => {
      const compositeKey = `${p.routerId || ''}:::${p.name}`;
      const secCount = secretCountsByRouterAndProfile.has(compositeKey)
        ? (secretCountsByRouterAndProfile.get(compositeKey) || 0)
        : (secretCountsByProfile.get(p.name) || 0);

      const actCount = activeCountsByRouterAndProfile.has(compositeKey)
        ? (activeCountsByRouterAndProfile.get(compositeKey) || 0)
        : (activeCountsByProfile.get(p.name) || 0);

      return {
        ...p,
        secretCount: secCount,
        activeCount: actCount,
      };
    });

    res.json({
      success: true,
      data: enrichedProfiles,
      errors: Object.keys(profilesRes.errors).length > 0 ? profilesRes.errors : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil data profile' });
  }
});

// Helper to find driver for a profile when router is 'all'
async function resolveProfileTarget(routerId: string, profileName: string, explicitRouterId?: string) {
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
      const list = await t.driver.getProfiles();
      if (list.some((p) => p.name === profileName)) {
        return t;
      }
    } catch {}
  }
  return all[0];
}

// POST create profile
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const routerIdParam = (req.params as any).routerId;
  const targetRouterId = (req.body.routerId && req.body.routerId !== 'all') ? req.body.routerId : routerIdParam;
  const { name, localAddress, remoteAddress, rateLimit, parentQueue, onlyOne, dnsServer, comment } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Nama profile wajib diisi.' });
  }

  try {
    const targets = await routerManager.getTargetDrivers(targetRouterId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    const newProfile = await driver.createProfile({
      name: name.trim(),
      localAddress: localAddress?.trim() || undefined,
      remoteAddress: remoteAddress?.trim() || undefined,
      rateLimit: rateLimit?.trim() || undefined,
      parentQueue: parentQueue?.trim() || undefined,
      onlyOne: onlyOne !== undefined ? Boolean(onlyOne) : true,
      dnsServer: dnsServer?.trim() || undefined,
      comment: comment?.trim() || undefined,
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'CREATE',
      targetType: 'PROFILE',
      targetName: newProfile.name,
      details: `Membuat PPP profile baru '${newProfile.name}' (Rate: ${newProfile.rateLimit || 'unlimited'})`,
    });

    res.status(201).json({ success: true, data: newProfile });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal membuat profile' });
  }
});

// PUT update profile
router.put('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const profileName = req.params.name;
  const patch = req.body;
  const explicitRouter = (patch.routerId && patch.routerId !== 'all') ? patch.routerId : (req.query.routerId as string);

  try {
    const target = await resolveProfileTarget(routerId, profileName, explicitRouter);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = target;

    const updated = await driver.updateProfile(profileName, patch);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'UPDATE',
      targetType: 'PROFILE',
      targetName: profileName,
      details: `Memperbarui profile '${profileName}'`,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memperbarui profile' });
  }
});

// DELETE profile
router.delete('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const profileName = req.params.name;
  const explicitRouter = (req.query.routerId as string) || (req.body?.routerId && req.body.routerId !== 'all' ? req.body.routerId : undefined);

  try {
    const target = await resolveProfileTarget(routerId, profileName, explicitRouter);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = target;

    await driver.deleteProfile(profileName);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'DELETE',
      targetType: 'PROFILE',
      targetName: profileName,
      details: `Menghapus profile '${profileName}'`,
    });

    res.json({ success: true, message: `Profile '${profileName}' berhasil dihapus.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal menghapus profile' });
  }
});

// POST bulk action on profiles
router.post('/bulk-action', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const { action, items, dnsServer, rateLimit, localAddress, remoteAddress } = req.body; // items: Array<{ name: string; routerId?: string }>

  if (!action || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Aksi dan daftar profile wajib diisi.' });
  }

  try {
    let successCount = 0;
    const errors: Record<string, string> = {};

    for (const item of items) {
      const targetRouterId = item.routerId || routerId;
      try {
        const target = await resolveProfileTarget(targetRouterId, item.name, item.routerId);
        if (!target) throw new Error('Router tidak ditemukan');
        const { driver } = target;

        if (action === 'change_dns') {
          if (dnsServer === undefined) throw new Error('DNS Server tidak ditentukan');
          await driver.updateProfile(item.name, { dnsServer: dnsServer.trim() });
          successCount++;
        } else if (action === 'change_rate_limit') {
          if (!rateLimit) throw new Error('Limitasi bandwidth tidak ditentukan');
          await driver.updateProfile(item.name, { rateLimit: rateLimit.trim() });
          successCount++;
        } else if (action === 'change_local_address') {
          if (localAddress === undefined) throw new Error('Local Address tidak ditentukan');
          await driver.updateProfile(item.name, { localAddress: localAddress.trim() });
          successCount++;
        } else if (action === 'change_remote_address') {
          if (remoteAddress === undefined) throw new Error('Remote Address (Pool) tidak ditentukan');
          await driver.updateProfile(item.name, { remoteAddress: remoteAddress.trim() });
          successCount++;
        } else if (action === 'delete') {
          await driver.deleteProfile(item.name);
          successCount++;
        }
      } catch (err: any) {
        errors[item.name] = err.message || 'Gagal memproses';
      }
    }

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: routerId,
      routerName: routerId === 'all' ? 'Semua Router' : routerId,
      action: action === 'delete' ? 'DELETE' : 'UPDATE',
      targetType: 'PROFILE',
      targetName: `${items.length} profiles`,
      details: `Aksi massal [${action}] pada ${successCount} dari ${items.length} profile`,
    });

    res.json({
      success: true,
      successCount,
      total: items.length,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal menjalankan aksi massal profile' });
  }
});

export default router;
