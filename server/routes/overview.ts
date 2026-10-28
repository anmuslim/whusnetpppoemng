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
  let totalRxBps = 0; // Router Rx = Client Upload
  let totalTxBps = 0; // Router Tx = Client Download

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

      // Calculate precise traffic in bps without string parsing distortion
      active.forEach((a) => {
        let rx = typeof a.rxBps === 'number' ? a.rxBps : 0;
        let tx = typeof a.txBps === 'number' ? a.txBps : 0;

        if (rx === 0 && a.rxRate) {
          const s = String(a.rxRate).trim().toLowerCase();
          const num = parseFloat(s);
          if (!isNaN(num)) {
            if (s.endsWith('gbps') || s.endsWith('g')) rx = num * 1_000_000_000;
            else if (s.endsWith('mbps') || s.endsWith('m')) rx = num * 1_000_000;
            else if (s.endsWith('kbps') || s.endsWith('k')) rx = num * 1_000;
            else rx = num;
          }
        }

        if (tx === 0 && a.txRate) {
          const s = String(a.txRate).trim().toLowerCase();
          const num = parseFloat(s);
          if (!isNaN(num)) {
            if (s.endsWith('gbps') || s.endsWith('g')) tx = num * 1_000_000_000;
            else if (s.endsWith('mbps') || s.endsWith('m')) tx = num * 1_000_000;
            else if (s.endsWith('kbps') || s.endsWith('k')) tx = num * 1_000;
            else tx = num;
          }
        }

        totalRxBps += rx;
        totalTxBps += tx;
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
        totalTrafficRx: totalRxBps >= 1_000_000_000 ? `${(totalRxBps / 1_000_000_000).toFixed(2)} Gbps` : totalRxBps >= 1_000_000 ? `${(totalRxBps / 1_000_000).toFixed(1)} Mbps` : totalRxBps >= 1_000 ? `${(totalRxBps / 1_000).toFixed(1)} kbps` : `${Math.round(totalRxBps)} bps`,
        totalTrafficTx: totalTxBps >= 1_000_000_000 ? `${(totalTxBps / 1_000_000_000).toFixed(2)} Gbps` : totalTxBps >= 1_000_000 ? `${(totalTxBps / 1_000_000).toFixed(1)} Mbps` : totalTxBps >= 1_000 ? `${(totalTxBps / 1_000).toFixed(1)} kbps` : `${Math.round(totalTxBps)} bps`,
        totalTrafficDownload: totalTxBps >= 1_000_000_000 ? `${(totalTxBps / 1_000_000_000).toFixed(2)} Gbps` : totalTxBps >= 1_000_000 ? `${(totalTxBps / 1_000_000).toFixed(1)} Mbps` : totalTxBps >= 1_000 ? `${(totalTxBps / 1_000).toFixed(1)} kbps` : `${Math.round(totalTxBps)} bps`,
        totalTrafficUpload: totalRxBps >= 1_000_000_000 ? `${(totalRxBps / 1_000_000_000).toFixed(2)} Gbps` : totalRxBps >= 1_000_000 ? `${(totalRxBps / 1_000_000).toFixed(1)} Mbps` : totalRxBps >= 1_000 ? `${(totalRxBps / 1_000).toFixed(1)} kbps` : `${Math.round(totalRxBps)} bps`,
        totalTrafficRxMbps: +(totalRxBps / 1_000_000).toFixed(2),
        totalTrafficTxMbps: +(totalTxBps / 1_000_000).toFixed(2),
        totalTraffic: (totalRxBps + totalTxBps) >= 1_000_000_000 ? `${((totalRxBps + totalTxBps) / 1_000_000_000).toFixed(2)} Gbps` : (totalRxBps + totalTxBps) >= 1_000_000 ? `${((totalRxBps + totalTxBps) / 1_000_000).toFixed(1)} Mbps` : (totalRxBps + totalTxBps) >= 1_000 ? `${((totalRxBps + totalTxBps) / 1_000).toFixed(1)} kbps` : `${Math.round(totalRxBps + totalTxBps)} bps`,
      },
      routerSummaries,
      recentEvents: storage.getRecentEvents(),
    },
  });
});

export default router;
