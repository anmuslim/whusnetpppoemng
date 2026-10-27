import fs from 'fs';
import path from 'path';
import { RouterConfig } from './drivers/types.js';
import { encrypt } from './crypto.js';
import { isMySQLEnabled, getMySQLPool, initMySQLTables } from './mysql.js';

export interface AuditLogItem {
  id: string;
  timestamp: string;
  username: string;
  routerId: string;
  routerName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'DISCONNECT' | 'ENABLE' | 'DISABLE' | 'TEST';
  targetType: 'SECRET' | 'ACTIVE' | 'PROFILE' | 'QUEUE' | 'POOL' | 'ROUTER';
  targetName: string;
  details?: string;
}

export const ALL_MENU_KEYS = [
  'dashboard',
  'routers',
  'secrets',
  'active',
  'profiles',
  'queues',
  'pools',
  'audit',
  'users',
] as const;

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: 'superadmin' | 'operator' | 'technician';
  passwordHash: string; // SHA-256 for simple auth
  createdAt: string;
  allowedMenus: string[];
  status?: 'active' | 'suspended';
  lastLogin?: string;
}

interface AppDatabase {
  routers: RouterConfig[];
  users: AdminUser[];
  auditLogs: AuditLogItem[];
  recentEvents: Array<{
    id: string;
    timestamp: string;
    type: 'connected' | 'disconnected';
    username: string;
    routerName: string;
    ipAddress: string;
  }>;
  demoData?: Record<string, {
    secrets: any[];
    profiles: any[];
    queues: any[];
    pools: any[];
    active: any[];
  }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

class StorageManager {
  private db: AppDatabase;
  private isMySql: boolean = false;

  constructor() {
    this.db = {
      routers: [],
      users: [],
      auditLogs: [],
      recentEvents: [],
    };
    // Sync fallback load for immediate startup before async init completes
    this.loadJsonFallback();
  }

  public async init(): Promise<void> {
    if (isMySQLEnabled()) {
      try {
        console.log('🔄 Menghubungkan ke database MySQL...');
        await initMySQLTables();
        await this.loadFromMySQL();
        this.isMySql = true;
        console.log(`✅ Terhubung ke MySQL! Memuat ${this.db.routers.length} router, ${this.db.users.length} pengguna, dan ${this.db.auditLogs.length} audit log.`);
        return;
      } catch (err: any) {
        console.error('⚠️  Gagal menginisialisasi MySQL, beralih ke penyimpanan lokal JSON:', err.message);
        this.isMySql = false;
      }
    } else {
      console.log('ℹ️  Mode penyimpanan: File JSON lokal (data/db.json). MySQL tidak dikonfigurasi di .env');
    }

    this.loadJsonFallback();
    if (this.db.routers.length === 0) {
      this.seedDemoData();
    }
  }

  private async loadFromMySQL(): Promise<void> {
    const pool = getMySQLPool();
    if (!pool) return;

    // 1. Load users
    const [userRows] = await pool.query('SELECT * FROM users');
    const dbUsers: AdminUser[] = (userRows as any[]).map((r) => ({
      id: r.id,
      username: r.username,
      name: r.name,
      role: r.role,
      passwordHash: r.passwordHash,
      allowedMenus: typeof r.allowedMenus === 'string' ? JSON.parse(r.allowedMenus) : r.allowedMenus || [...ALL_MENU_KEYS],
      status: r.status || 'active',
      createdAt: r.createdAt,
      lastLogin: r.lastLogin || undefined,
    }));

    if (dbUsers.length === 0) {
      // Seed default admin in MySQL
      const initialUsers: AdminUser[] = [
        {
          id: 'user-admin-1',
          username: 'admin',
          name: 'Administrator Utama',
          role: 'superadmin',
          passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', // admin123
          createdAt: new Date().toISOString(),
          allowedMenus: [...ALL_MENU_KEYS],
          status: 'active',
        },
        {
          id: 'user-operator-1',
          username: 'operator',
          name: 'Operator Billing & PPP',
          role: 'operator',
          passwordHash: 'e6378e9b6e82df4cfad4c622cc47a505e6b3671c6cae70f612501a3eb320092d', // operator123
          createdAt: new Date().toISOString(),
          allowedMenus: ['dashboard', 'secrets', 'active', 'queues', 'audit'],
          status: 'active',
        },
        {
          id: 'user-teknisi-1',
          username: 'teknisi',
          name: 'Teknisi Jaringan Lapangan',
          role: 'technician',
          passwordHash: 'ad8ec288ea0bdf60bb4787d55f058097b64ff1929314c40212f719323c6d7a12', // teknisi123
          createdAt: new Date().toISOString(),
          allowedMenus: ['dashboard', 'routers', 'active', 'pools'],
          status: 'active',
        },
      ];

      for (const u of initialUsers) {
        await pool.query(
          'INSERT INTO users (id, username, name, role, passwordHash, allowedMenus, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [u.id, u.username, u.name, u.role, u.passwordHash, JSON.stringify(u.allowedMenus), u.status, u.createdAt]
        );
      }
      this.db.users = initialUsers;
    } else {
      this.db.users = dbUsers;
    }

    // 2. Load routers
    const [routerRows] = await pool.query('SELECT * FROM routers');
    this.db.routers = (routerRows as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      host: r.host,
      port: Number(r.port) || 8728,
      username: r.username,
      encryptedPassword: r.encryptedPassword || undefined,
      mode: r.mode || 'API',
      notes: r.notes || '',
      isDemo: Boolean(r.isDemo),
      status: r.status || 'online',
      lastSeen: r.lastSeen || undefined,
      lastError: r.lastError || undefined,
      identity: r.identity || undefined,
      version: r.version || undefined,
      uptime: r.uptime || undefined,
      cpuLoad: Number(r.cpuLoad) || 0,
      freeMemory: Number(r.freeMemory) || 0,
      totalMemory: Number(r.totalMemory) || 0,
      boardName: r.boardName || undefined,
    }));

    // 3. Load audit logs (latest 500)
    const [auditRows] = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500');
    this.db.auditLogs = (auditRows as any[]).map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      username: r.username,
      routerId: r.routerId,
      routerName: r.routerName,
      action: r.action,
      targetType: r.targetType,
      targetName: r.targetName,
      details: r.details || undefined,
    }));

    // 4. Load recent events (latest 50)
    const [eventRows] = await pool.query('SELECT * FROM recent_events ORDER BY timestamp DESC LIMIT 50');
    this.db.recentEvents = (eventRows as any[]).map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      type: r.type,
      username: r.username,
      routerName: r.routerName,
      ipAddress: r.ipAddress,
    }));

    // 5. Load demo data if available
    const [demoRows] = await pool.query('SELECT * FROM demo_data');
    if ((demoRows as any[]).length > 0) {
      this.db.demoData = {};
      for (const d of demoRows as any[]) {
        try {
          this.db.demoData[d.routerId] = JSON.parse(d.dataJson);
        } catch {
          // ignore invalid json
        }
      }
    }
  }

  private loadJsonFallback() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.db = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Gagal membaca db.json, menginisialisasi in-memory fallback:', err);
    }

    // Ensure default admin user and demo users exist
    if (!this.db.users || this.db.users.length === 0) {
      this.db.users = [
        {
          id: 'user-admin-1',
          username: 'admin',
          name: 'Administrator Utama',
          role: 'superadmin',
          passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
          createdAt: new Date().toISOString(),
          allowedMenus: [...ALL_MENU_KEYS],
          status: 'active',
        },
        {
          id: 'user-operator-1',
          username: 'operator',
          name: 'Operator Billing & PPP',
          role: 'operator',
          passwordHash: 'e6378e9b6e82df4cfad4c622cc47a505e6b3671c6cae70f612501a3eb320092d',
          createdAt: new Date().toISOString(),
          allowedMenus: ['dashboard', 'secrets', 'active', 'queues', 'audit'],
          status: 'active',
        },
        {
          id: 'user-teknisi-1',
          username: 'teknisi',
          name: 'Teknisi Jaringan Lapangan',
          role: 'technician',
          passwordHash: 'ad8ec288ea0bdf60bb4787d55f058097b64ff1929314c40212f719323c6d7a12',
          createdAt: new Date().toISOString(),
          allowedMenus: ['dashboard', 'routers', 'active', 'pools'],
          status: 'active',
        },
      ];
      this.save();
    } else {
      let modified = false;
      this.db.users.forEach((u) => {
        if (!u.allowedMenus || u.allowedMenus.length === 0) {
          u.allowedMenus = u.role === 'superadmin' ? [...ALL_MENU_KEYS] : ['dashboard', 'secrets', 'active'];
          modified = true;
        }
        if (!u.status) {
          u.status = 'active';
          modified = true;
        }
      });
      if (modified) this.save();
    }
  }

  public save() {
    if (this.isMySql) return; // In MySQL mode, persistence is handled per mutation

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save to db.json:', err);
    }
  }

  public seedDemoData() {
    const pass = encrypt('demoRouterPass123!');
    const demoRouters: RouterConfig[] = [
      {
        id: 'router-core-idc',
        name: 'Router-Core-IDC',
        host: '10.100.1.1',
        port: 443,
        username: 'api-pppoe',
        encryptedPassword: pass,
        mode: 'REST',
        notes: 'Core CCR2004 di Cyber IDC Lt. 2 (Koneksi REST API v7)',
        isDemo: true,
        status: 'online',
        lastSeen: new Date().toISOString(),
        identity: 'Mikrotik-Core-IDC',
        version: 'RouterOS v7.14.3 (stable)',
        uptime: '38d 14h 22m',
        cpuLoad: 16,
        freeMemory: 3120,
        totalMemory: 4096,
        boardName: 'CCR2004-16G-2S+',
      },
      {
        id: 'router-dist-utama',
        name: 'Router-Dist-Utama',
        host: '10.100.2.1',
        port: 8728,
        username: 'api-admin',
        encryptedPassword: pass,
        mode: 'API',
        notes: 'Distribusi Utama BSD City - RB4011 (Koneksi Winbox API port 8728)',
        isDemo: true,
        status: 'online',
        lastSeen: new Date().toISOString(),
        identity: 'Mikrotik-Dist-BSD',
        version: 'RouterOS v7.13.5 (stable)',
        uptime: '21d 08h 15m',
        cpuLoad: 22,
        freeMemory: 742,
        totalMemory: 1024,
        boardName: 'RB4011iGS+',
      },
      {
        id: 'router-pop-barat',
        name: 'Router-POP-Barat',
        host: '10.100.3.1',
        port: 8729,
        username: 'api-ssl-user',
        encryptedPassword: pass,
        mode: 'API-SSL',
        notes: 'POP Kalideres Tower A - RB760iGS (API-SSL port 8729)',
        isDemo: true,
        status: 'online',
        lastSeen: new Date().toISOString(),
        identity: 'Mikrotik-POP-Barat',
        version: 'RouterOS v7.12.1 (stable)',
        uptime: '14d 03h 48m',
        cpuLoad: 14,
        freeMemory: 382,
        totalMemory: 512,
        boardName: 'RB760iGS (hEX S)',
      },
    ];

    this.db.routers = demoRouters;

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        for (const r of demoRouters) {
          pool.query(
            `INSERT INTO routers (id, name, host, port, username, encryptedPassword, mode, notes, isDemo, status, lastSeen, identity, version, uptime, cpuLoad, freeMemory, totalMemory, boardName)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), host=VALUES(host)`,
            [r.id, r.name, r.host, r.port, r.username, r.encryptedPassword, r.mode, r.notes, r.isDemo ? 1 : 0, r.status, r.lastSeen, r.identity, r.version, r.uptime, r.cpuLoad, r.freeMemory, r.totalMemory, r.boardName]
          ).catch((e) => console.warn('Gagal seed router ke MySQL:', e.message));
        }
      }
    } else {
      this.save();
    }
  }

  public getRouters(): RouterConfig[] {
    return this.db.routers;
  }

  public getRouter(id: string): RouterConfig | undefined {
    return this.db.routers.find((r) => r.id === id);
  }

  public addRouter(router: RouterConfig): RouterConfig {
    this.db.routers.push(router);
    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query(
          `INSERT INTO routers (id, name, host, port, username, encryptedPassword, mode, notes, isDemo, status, lastSeen, identity, version, uptime, cpuLoad, freeMemory, totalMemory, boardName)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            router.id,
            router.name,
            router.host,
            router.port,
            router.username,
            router.encryptedPassword || null,
            router.mode,
            router.notes || '',
            router.isDemo ? 1 : 0,
            router.status || 'checking',
            router.lastSeen || new Date().toISOString(),
            router.identity || null,
            router.version || null,
            router.uptime || null,
            router.cpuLoad || 0,
            router.freeMemory || 0,
            router.totalMemory || 0,
            router.boardName || null,
          ]
        ).catch((e) => console.error('MySQL addRouter error:', e));
      }
    } else {
      this.save();
    }
    return router;
  }

  public updateRouter(id: string, patch: Partial<RouterConfig>): RouterConfig {
    const idx = this.db.routers.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Router with id '${id}' not found`);
    this.db.routers[idx] = { ...this.db.routers[idx], ...patch };

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'isDemo') {
            fields.push('`isDemo` = ?');
            values.push(v ? 1 : 0);
          } else {
            fields.push(`\`${k}\` = ?`);
            values.push(v);
          }
        }
        if (fields.length > 0) {
          values.push(id);
          pool.query(`UPDATE routers SET ${fields.join(', ')} WHERE id = ?`, values).catch((e) =>
            console.error('MySQL updateRouter error:', e)
          );
        }
      }
    } else {
      this.save();
    }
    return this.db.routers[idx];
  }

  public deleteRouter(id: string): boolean {
    const len = this.db.routers.length;
    this.db.routers = this.db.routers.filter((r) => r.id !== id);
    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query('DELETE FROM routers WHERE id = ?', [id]).catch((e) => console.error('MySQL deleteRouter error:', e));
      }
    } else {
      this.save();
    }
    return this.db.routers.length < len;
  }

  public getAuditLogs(): AuditLogItem[] {
    return this.db.auditLogs.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public addAuditLog(item: Omit<AuditLogItem, 'id' | 'timestamp'>) {
    const log: AuditLogItem = {
      ...item,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.db.auditLogs.unshift(log);
    if (this.db.auditLogs.length > 500) {
      this.db.auditLogs = this.db.auditLogs.slice(0, 500);
    }

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query(
          'INSERT INTO audit_logs (id, timestamp, username, routerId, routerName, action, targetType, targetName, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [log.id, log.timestamp, log.username, log.routerId, log.routerName, log.action, log.targetType, log.targetName, log.details || null]
        ).catch((e) => console.error('MySQL addAuditLog error:', e));
      }
    } else {
      this.save();
    }
  }

  public getRecentEvents() {
    return this.db.recentEvents;
  }

  public addRecentEvent(event: Omit<AppDatabase['recentEvents'][0], 'id' | 'timestamp'>) {
    const evt = {
      ...event,
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    this.db.recentEvents.unshift(evt);
    if (this.db.recentEvents.length > 50) {
      this.db.recentEvents = this.db.recentEvents.slice(0, 50);
    }

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query(
          'INSERT INTO recent_events (id, timestamp, type, username, routerName, ipAddress) VALUES (?, ?, ?, ?, ?, ?)',
          [evt.id, evt.timestamp, evt.type, evt.username, evt.routerName, evt.ipAddress]
        ).catch((e) => console.error('MySQL addRecentEvent error:', e));
      }
    } else {
      this.save();
    }
  }

  public getUsers(): AdminUser[] {
    return this.db.users;
  }

  public getUser(username: string): AdminUser | undefined {
    return this.db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  public getUserById(id: string): AdminUser | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  public createUser(userData: {
    username: string;
    name: string;
    role: 'superadmin' | 'operator' | 'technician';
    passwordHash: string;
    allowedMenus: string[];
    status?: 'active' | 'suspended';
  }): AdminUser {
    const existing = this.getUser(userData.username);
    if (existing) {
      throw new Error(`Username '${userData.username}' sudah digunakan.`);
    }

    const newUser: AdminUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: userData.username.toLowerCase().trim(),
      name: userData.name.trim(),
      role: userData.role,
      passwordHash: userData.passwordHash,
      allowedMenus: userData.allowedMenus || ['dashboard'],
      status: userData.status || 'active',
      createdAt: new Date().toISOString(),
    };

    this.db.users.push(newUser);

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query(
          'INSERT INTO users (id, username, name, role, passwordHash, allowedMenus, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            newUser.id,
            newUser.username,
            newUser.name,
            newUser.role,
            newUser.passwordHash,
            JSON.stringify(newUser.allowedMenus),
            newUser.status,
            newUser.createdAt,
          ]
        ).catch((e) => console.error('MySQL createUser error:', e));
      }
    } else {
      this.save();
    }
    return newUser;
  }

  public updateUser(
    id: string,
    patch: {
      name?: string;
      role?: 'superadmin' | 'operator' | 'technician';
      passwordHash?: string;
      allowedMenus?: string[];
      status?: 'active' | 'suspended';
      lastLogin?: string;
    }
  ): AdminUser {
    const idx = this.db.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      throw new Error(`User dengan ID '${id}' tidak ditemukan.`);
    }

    const current = this.db.users[idx];
    this.db.users[idx] = {
      ...current,
      ...patch,
      allowedMenus: patch.allowedMenus !== undefined ? patch.allowedMenus : current.allowedMenus,
    };

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        const fields: string[] = [];
        const values: any[] = [];
        if (patch.name !== undefined) {
          fields.push('name = ?');
          values.push(patch.name);
        }
        if (patch.role !== undefined) {
          fields.push('role = ?');
          values.push(patch.role);
        }
        if (patch.passwordHash !== undefined) {
          fields.push('passwordHash = ?');
          values.push(patch.passwordHash);
        }
        if (patch.allowedMenus !== undefined) {
          fields.push('allowedMenus = ?');
          values.push(JSON.stringify(patch.allowedMenus));
        }
        if (patch.status !== undefined) {
          fields.push('status = ?');
          values.push(patch.status);
        }
        if (patch.lastLogin !== undefined) {
          fields.push('lastLogin = ?');
          values.push(patch.lastLogin);
        }

        if (fields.length > 0) {
          values.push(id);
          pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values).catch((e) =>
            console.error('MySQL updateUser error:', e)
          );
        }
      }
    } else {
      this.save();
    }
    return this.db.users[idx];
  }

  public deleteUser(id: string): boolean {
    const user = this.getUserById(id);
    if (!user) return false;
    if (user.username === 'admin') {
      throw new Error('User administrator bawaan (admin) tidak boleh dihapus.');
    }
    const initialLen = this.db.users.length;
    this.db.users = this.db.users.filter((u) => u.id !== id);

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query('DELETE FROM users WHERE id = ?', [id]).catch((e) => console.error('MySQL deleteUser error:', e));
      }
    } else {
      this.save();
    }
    return this.db.users.length < initialLen;
  }

  public updateUserPassword(username: string, newHash: string): boolean {
    const user = this.getUser(username);
    if (!user) return false;
    user.passwordHash = newHash;

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query('UPDATE users SET passwordHash = ? WHERE username = ?', [newHash, username.toLowerCase()]).catch((e) =>
          console.error('MySQL updateUserPassword error:', e)
        );
      }
    } else {
      this.save();
    }
    return true;
  }

  public getUserSessionEvents(username: string) {
    const target = username.toLowerCase();
    const fromEvents = this.db.recentEvents
      .filter((e) => e.username.toLowerCase() === target)
      .map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        type: e.type,
        username: e.username,
        routerName: e.routerName,
        ipAddress: e.ipAddress,
        details: e.type === 'connected' ? 'PPPoE Client Terhubung' : 'PPPoE Client Terputus / Logged Out',
      }));

    const fromAudit = this.db.auditLogs
      .filter((l) => l.targetType === 'ACTIVE' && l.targetName.toLowerCase() === target)
      .map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        type: 'disconnected' as const,
        username: l.targetName,
        routerName: l.routerName,
        ipAddress: '—',
        details: l.details || `Sesi diputus oleh operator: ${l.username}`,
      }));

    return [...fromEvents, ...fromAudit].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public getDemoData(routerId: string) {
    if (!this.db.demoData) return undefined;
    return this.db.demoData[routerId];
  }

  public saveDemoData(routerId: string, data: { secrets: any[]; profiles: any[]; queues: any[]; pools: any[]; active: any[] }) {
    if (!this.db.demoData) {
      this.db.demoData = {};
    }
    this.db.demoData[routerId] = data;

    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query(
          'INSERT INTO demo_data (routerId, dataJson) VALUES (?, ?) ON DUPLICATE KEY UPDATE dataJson = VALUES(dataJson)',
          [routerId, JSON.stringify(data)]
        ).catch((e) => console.error('MySQL saveDemoData error:', e));
      }
    } else {
      this.save();
    }
  }

  public clearDemoData() {
    this.db.demoData = {};
    if (this.isMySql) {
      const pool = getMySQLPool();
      if (pool) {
        pool.query('DELETE FROM demo_data').catch((e) => console.error('MySQL clearDemoData error:', e));
      }
    } else {
      this.save();
    }
  }
}

export const storage = new StorageManager();
