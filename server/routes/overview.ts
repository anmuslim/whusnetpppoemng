import { Router, Response } from 'express';
import { storage } from '../storage.js';
import { routerManager } from '../drivers/manager.js';

const router = Router();

router.get('/', async (_req, res: Response) => {
  const routers = storage.getRouters();
  let onlineRoutersCount = 0;
  let offlineRoutersCount = 0;

  let totalSecrets = 0;
  let totalActive = 0;
  let totalDisabled = 0;
  let totalTrafficRxMbps = 0;
  let totalTrafficTxMbps = 0;

  const routerSummaries: Array<{
    id: string;
    name: string;
    status: 'online' | 'offline' | 'checking';
    activeCount: number;
    secretCount: number;
    disabledCount: number;
    cpuLoad: number;
    freeMemory: number;
    totalMemory: number;
    uptime: string;
    version: string;
    boardName: string;
    error?: string;
  }> = [];

  // Query each router concurrently with timeout
  const promises = routers.map(async (r) => {
    try {
      const driver = routerManager.getDriver(r);
      const [res, secrets, active] = await Promise.all([
        driver.getSystemResource().catch((err) => ({
          identity: r.name,
          version: r.version || 'RouterOS',
          uptime: r.uptime || 'Unknown',
          cpuLoad: r.cpuLoad || 0,
          freeMemory: r.freeMemory || 0,
          totalMemory: r.totalMemory || 0,
          boardName: r.boardName || 'MikroTik',
          err: err.message,
        })),
        driver.getSecrets().catch(() => []),
        driver.getActive().catch(() => []),
      ]);

      const disabled = secrets.filter((s) => s.disabled).length;

      // Calculate traffic
      active.forEach((a) => {
        if (a.rxRate) {
          const rxNum = parseFloat(a.rxRate);
          if (!isNaN(rxNum)) totalTrafficRxMbps += rxNum;
        }
        if (a.txRate) {
          const txNum = parseFloat(a.txRate);
          if (!isNaN(txNum)) totalTrafficTxMbps += txNum;
        }
      });

      onlineRoutersCount++;
      totalSecrets += secrets.length;
      totalActive += active.length;
      totalDisabled += disabled;

      routerSummaries.push({
        id: r.id,
        name: r.name,
        status: 'online',
        activeCount: active.length,
        secretCount: secrets.length,
        disabledCount: disabled,
        cpuLoad: res.cpuLoad,
        freeMemory: res.freeMemory,
        totalMemory: res.totalMemory,
        uptime: res.uptime,
        version: res.version,
        boardName: res.boardName,
      });

      storage.updateRouter(r.id, {
        status: 'online',
        lastSeen: new Date().toISOString(),
        cpuLoad: res.cpuLoad,
        uptime: res.uptime,
      });
    } catch (err: any) {
      offlineRoutersCount++;
      routerSummaries.push({
        id: r.id,
        name: r.name,
        status: 'offline',
        activeCount: 0,
        secretCount: 0,
        disabledCount: 0,
        cpuLoad: 0,
        freeMemory: 0,
        totalMemory: 0,
        uptime: '-',
        version: '-',
        boardName: '-',
        error: err.message || 'Router tidak dapat dihubungi',
      });
      storage.updateRouter(r.id, {
        status: 'offline',
        lastError: err.message,
      });
    }
  });

  await Promise.allSettled(promises);

  res.json({
    success: true,
    data: {
      stats: {
        totalRouters: routers.length,
        onlineRouters: onlineRoutersCount,
        offlineRouters: offlineRoutersCount,
        totalSecrets,
        totalActive,
        totalDisabled,
        totalTrafficRx: `${totalTrafficRxMbps.toFixed(1)} Mbps`,
        totalTrafficTx: `${totalTrafficTxMbps.toFixed(1)} Mbps`,
        totalTraffic: `${(totalTrafficRxMbps + totalTrafficTxMbps).toFixed(1)} Mbps`,
      },
      routerSummaries,
      recentEvents: storage.getRecentEvents(),
    },
  });
});

export default router;
