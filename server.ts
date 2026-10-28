import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import authRoutes from './server/routes/auth.js';
import routerRoutes from './server/routes/routers.js';
import secretsRoutes from './server/routes/secrets.js';
import activeRoutes from './server/routes/active.js';
import profilesRoutes from './server/routes/profiles.js';
import queuesRoutes from './server/routes/queues.js';
import poolsRoutes from './server/routes/pools.js';
import overviewRoutes from './server/routes/overview.js';
import auditRoutes from './server/routes/audit.js';
import usersRoutes from './server/routes/users.js';
import { requireAuth } from './server/auth.js';
import { storage } from './server/storage.js';

dotenv.config();

// Prevent socket resets or asynchronous router connection timeouts from abruptly terminating the server process
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️  [Process Warning] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err: any) => {
  console.warn('⚠️  [Process Warning] Uncaught Exception:', err?.message || err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const PORT = 3000;

  // Body parsers with safety limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging & sanitization
  app.use((req, _res, next) => {
    // Prevent any leak of password in logs
    if (req.body && req.body.password) {
      const sanitized = { ...req.body, password: '[PROTECTED]' };
      // internal audit only
    }
    next();
  });

  // Public / Auth routes
  app.use('/api/auth', authRoutes);

  // Protected API routes
  app.use('/api/routers', requireAuth, routerRoutes);
  app.use('/api/routers/:routerId/ppp/secrets', requireAuth, secretsRoutes);
  app.use('/api/routers/:routerId/ppp/active', requireAuth, activeRoutes);
  app.use('/api/routers/:routerId/ppp/profiles', requireAuth, profilesRoutes);
  app.use('/api/routers/:routerId/queues', requireAuth, queuesRoutes);
  app.use('/api/routers/:routerId/ip-pools', requireAuth, poolsRoutes);
  app.use('/api/overview', requireAuth, overviewRoutes);
  app.use('/api/audit-logs', requireAuth, auditRoutes);
  app.use('/api/demo', requireAuth, auditRoutes);
  app.use('/api/users', requireAuth, usersRoutes);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), app: 'PPPoE Manager' });
  });

  // Frontend integration: Vite middleware in dev or static files in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace?.(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PPPoE Manager server berjalan pada http://0.0.0.0:${PORT}`);
    // Inisialisasi storage (MySQL jika dikonfigurasi, atau JSON fallback)
    storage.init().catch((err) => {
      console.warn('Storage init fallback note:', err.message);
    });
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting PPPoE Manager server:', err);
  process.exit(1);
});
