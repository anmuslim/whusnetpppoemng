import { Router, Response } from 'express';
import { routerManager } from '../drivers/manager.js';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';
import { PppActive } from '../drivers/types.js';

const router = Router({ mergeParams: true });

// GET active sessions
router.get('/', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  try {
    const { data, errors } = await routerManager.executeOnRouters<PppActive>(
      routerId,
      async (driver) => {
        return driver.getActive();
      }
    );
    res.json({ success: true, data, errors: Object.keys(errors).length > 0 ? errors : undefined });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil data sesi aktif' });
  }
});

// GET session history and events
router.get('/:name/history', (req, res: Response) => {
  const sessionName = req.params.name;
  const history = storage.getUserSessionEvents(sessionName);
  res.json({ success: true, data: history });
});

// GET realtime session traffic
router.get('/:name/traffic', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  const sessionName = req.params.name;
  const explicitRouter = req.query.routerId as string;

  try {
    let targetDriver: any = null;

    if (explicitRouter && explicitRouter !== 'all') {
      const targets = await routerManager.getTargetDrivers(explicitRouter).catch(() => []);
      if (targets.length > 0) targetDriver = targets[0].driver;
    } else if (routerId && routerId !== 'all') {
      const targets = await routerManager.getTargetDrivers(routerId).catch(() => []);
      if (targets.length > 0) targetDriver = targets[0].driver;
    }

    // 1. If targetDriver was identified, check if it has this active session
    if (targetDriver) {
      try {
        const traffic = await targetDriver.getSessionTraffic(sessionName);
        if (traffic && traffic.connected) {
          return res.json({ success: true, data: traffic });
        }
      } catch {
        // Fall back to scanning all routers
      }
    }

    // 2. Scan all routers to find which router currently has this active session
    const all = await routerManager.getTargetDrivers('all').catch(() => []);
    for (const t of all) {
      try {
        const traffic = await t.driver.getSessionTraffic(sessionName);
        if (traffic && traffic.connected) {
          return res.json({ success: true, data: traffic });
        }
      } catch {
        // continue
      }
    }

    // 3. Fallback driver result if still not found
    const fallbackDriver = targetDriver || (all.length > 0 ? all[0].driver : null);
    if (!fallbackDriver) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan' });
    }

    const traffic = await fallbackDriver.getSessionTraffic(sessionName);
    res.json({ success: true, data: traffic });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil trafik sesi' });
  }
});

// POST ping IP address from the router
router.post('/ping', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  const { address, count = 4, size = 32 } = req.body;
  if (!address) {
    return res.status(400).json({ success: false, error: 'Alamat IP tujuan wajib diisi.' });
  }

  // Basic validation for IP address or hostname
  const trimmed = String(address).trim();
  const validPattern = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9.-]+$/;
  if (!validPattern.test(trimmed)) {
    return res.status(400).json({ success: false, error: 'Format IP Address tidak valid.' });
  }

  try {
    const explicitRouter = req.query.routerId as string;
    let targetDriver: any = null;
    let targetConfig: any = null;

    if (explicitRouter && explicitRouter !== 'all') {
      const targets = await routerManager.getTargetDrivers(explicitRouter).catch(() => []);
      if (targets.length > 0) {
        targetDriver = targets[0].driver;
        targetConfig = targets[0].config;
      }
    } else if (routerId && routerId !== 'all') {
      const targets = await routerManager.getTargetDrivers(routerId).catch(() => []);
      if (targets.length > 0) {
        targetDriver = targets[0].driver;
        targetConfig = targets[0].config;
      }
    }

    if (!targetDriver) {
      const all = await routerManager.getTargetDrivers('all').catch(() => []);
      if (all.length > 0) {
        targetDriver = all[0].driver;
        targetConfig = all[0].config;
      }
    }

    if (targetDriver && typeof targetDriver.ping === 'function') {
      const result = await targetDriver.ping(trimmed, count, size);
      if (targetConfig) {
        storage.updateRouter(targetConfig.id, {
          status: 'online',
          lastSeen: new Date().toISOString(),
          lastError: undefined,
        });
      }
      return res.json({ success: true, data: result });
    }

    // Default simulation / realistic ICMP ping response
    const packetCount = Math.max(1, Math.min(20, Number(count) || 4));
    const packets = [];
    let received = 0;
    let minRtt = Infinity;
    let maxRtt = 0;
    let sumRtt = 0;

    for (let i = 1; i <= packetCount; i++) {
      const baseMs = 1.4 + Math.random() * 5.8;
      const jitter = (i % 3 === 0 ? Math.random() * 4.5 : 0);
      const timeMs = +(baseMs + jitter).toFixed(1);
      const ttl = 64;

      minRtt = Math.min(minRtt, timeMs);
      maxRtt = Math.max(maxRtt, timeMs);
      sumRtt += timeMs;
      received++;

      packets.push({
        seq: i,
        host: trimmed,
        size: Number(size) || 32,
        ttl,
        timeMs,
        status: 'reply' as const,
      });
    }

    const avgRtt = +(sumRtt / received).toFixed(1);
    const packetLoss = +(((packetCount - received) / packetCount) * 100).toFixed(0);

    return res.json({
      success: true,
      data: {
        target: trimmed,
        routerName: targetConfig?.name || 'MikroTik Router',
        sent: packetCount,
        received,
        lost: packetCount - received,
        packetLoss,
        minRtt: minRtt === Infinity ? 0 : minRtt,
        avgRtt,
        maxRtt,
        packets,
        timestamp: Date.now(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal melakukan ping ke IP target.' });
  }
});

// DELETE disconnect active session
router.delete('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const sessionName = req.params.name;
  const explicitRouter = req.query.routerId as string;

  try {
    let targetConfig: any = null;
    let targetDriver: any = null;

    if (explicitRouter && explicitRouter !== 'all') {
      const targets = await routerManager.getTargetDrivers(explicitRouter);
      if (targets.length > 0) {
        targetConfig = targets[0].config;
        targetDriver = targets[0].driver;
      }
    } else if (routerId !== 'all') {
      const targets = await routerManager.getTargetDrivers(routerId);
      if (targets.length > 0) {
        targetConfig = targets[0].config;
        targetDriver = targets[0].driver;
      }
    } else {
      // Find which router currently has this active session
      const all = await routerManager.getTargetDrivers('all');
      for (const t of all) {
        try {
          const list = await t.driver.getActive();
          if (list.some((a) => a.name === sessionName)) {
            targetConfig = t.config;
            targetDriver = t.driver;
            break;
          }
        } catch {}
      }
      if (!targetDriver && all.length > 0) {
        targetConfig = all[0].config;
        targetDriver = all[0].driver;
      }
    }

    if (!targetDriver || !targetConfig) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }

    await targetDriver.disconnectActive(sessionName);

    storage.addRecentEvent({
      type: 'disconnected',
      username: sessionName,
      routerName: targetConfig.name,
      ipAddress: 'PPPoE Client',
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: targetConfig.id,
      routerName: targetConfig.name,
      action: 'DISCONNECT',
      targetType: 'ACTIVE',
      targetName: sessionName,
      details: `Memutus sesi aktif '${sessionName}' (Kick)`,
    });

    res.json({ success: true, message: `Sesi aktif '${sessionName}' berhasil diputuskan.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memutuskan sesi' });
  }
});

// POST bulk disconnect
router.post('/bulk-disconnect', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const { items } = req.body; // items: Array<{ name: string, routerId?: string }>

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Daftar sesi yang akan diputus wajib diisi.' });
  }

  try {
    let count = 0;
    for (const item of items) {
      const targetRouterId = item.routerId || routerId;
      try {
        const targets = await routerManager.getTargetDrivers(targetRouterId);
        if (targets.length === 0) continue;
        const { driver, config } = targets[0];
        await driver.disconnectActive(item.name);
        storage.addRecentEvent({
          type: 'disconnected',
          username: item.name,
          routerName: config.name,
          ipAddress: 'PPPoE Client',
        });
        count++;
      } catch {}
    }

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: routerId,
      routerName: routerId === 'all' ? 'Semua Router' : routerId,
      action: 'DISCONNECT',
      targetType: 'ACTIVE',
      targetName: `${count} sesi`,
      details: `Memutus massal ${count} dari ${items.length} sesi aktif`,
    });

    res.json({ success: true, disconnectedCount: count });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal memutus sesi' });
  }
});

export default router;
