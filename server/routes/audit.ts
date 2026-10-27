import { Router, Response } from 'express';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';

import { routerManager } from '../drivers/manager.js';

const router = Router();

// GET audit logs
router.get('/', (_req, res: Response) => {
  const logs = storage.getAuditLogs();
  res.json({ success: true, data: logs });
});

// POST reset demo data
router.post('/reset-demo', (req: AuthenticatedRequest, res: Response) => {
  storage.clearDemoData();
  storage.seedDemoData();
  routerManager.clearAllDrivers();
  storage.addAuditLog({
    username: req.user?.username || 'admin',
    routerId: 'system',
    routerName: 'Sistem',
    action: 'UPDATE',
    targetType: 'ROUTER',
    targetName: 'Mode Demo',
    details: 'Reset data simulasi router demo ke konfigurasi awal',
  });
  res.json({ success: true, message: 'Data demo berhasil direset ke status awal.' });
});

export default router;
