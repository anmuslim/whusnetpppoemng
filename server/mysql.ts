import mysql, { Pool, PoolOptions } from 'mysql2/promise';

let pool: Pool | null = null;
let isInitialized = false;

export function isMySQLEnabled(): boolean {
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  return Boolean(host && user && database);
}

export function getMySQLConfig(): PoolOptions {
  return {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306,
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'pppoe_manager',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: 'utf8mb4',
  };
}

export function getMySQLPool(): Pool | null {
  if (!isMySQLEnabled()) {
    return null;
  }

  if (!pool) {
    const config = getMySQLConfig();
    pool = mysql.createPool(config);
  }

  return pool;
}

export async function testMySQLConnection(): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const p = getMySQLPool();
    if (!p) {
      return { success: false, error: 'MySQL configuration is not set in environment.' };
    }
    const [rows] = await p.query('SELECT VERSION() as version');
    const version = (rows as any[])[0]?.version || 'Unknown';
    return { success: true, version };
  } catch (err: any) {
    return { success: false, error: err.message || 'Cannot connect to MySQL server' };
  }
}

export async function initMySQLTables(): Promise<boolean> {
  const p = getMySQLPool();
  if (!p) return false;

  try {
    // 1. Routers table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`routers\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(128) NOT NULL UNIQUE,
        \`host\` VARCHAR(128) NOT NULL,
        \`port\` INT NOT NULL DEFAULT 8728,
        \`username\` VARCHAR(128) NOT NULL,
        \`encryptedPassword\` TEXT NULL,
        \`mode\` VARCHAR(32) NOT NULL DEFAULT 'API',
        \`notes\` TEXT NULL,
        \`isDemo\` TINYINT(1) NOT NULL DEFAULT 0,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'online',
        \`lastSeen\` VARCHAR(64) NULL,
        \`lastError\` TEXT NULL,
        \`identity\` VARCHAR(128) NULL,
        \`version\` VARCHAR(128) NULL,
        \`uptime\` VARCHAR(128) NULL,
        \`cpuLoad\` INT NOT NULL DEFAULT 0,
        \`freeMemory\` INT NOT NULL DEFAULT 0,
        \`totalMemory\` INT NOT NULL DEFAULT 0,
        \`boardName\` VARCHAR(128) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Users table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`username\` VARCHAR(64) NOT NULL UNIQUE,
        \`name\` VARCHAR(128) NOT NULL,
        \`role\` VARCHAR(32) NOT NULL DEFAULT 'operator',
        \`passwordHash\` VARCHAR(128) NOT NULL,
        \`allowedMenus\` TEXT NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'active',
        \`createdAt\` VARCHAR(64) NOT NULL,
        \`lastLogin\` VARCHAR(64) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Audit logs table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`audit_logs\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`timestamp\` VARCHAR(64) NOT NULL,
        \`username\` VARCHAR(64) NOT NULL,
        \`routerId\` VARCHAR(64) NOT NULL,
        \`routerName\` VARCHAR(128) NOT NULL,
        \`action\` VARCHAR(32) NOT NULL,
        \`targetType\` VARCHAR(32) NOT NULL,
        \`targetName\` VARCHAR(128) NOT NULL,
        \`details\` TEXT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_audit_timestamp\` (\`timestamp\`),
        INDEX \`idx_audit_routerId\` (\`routerId\`),
        INDEX \`idx_audit_username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Recent connection events
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`recent_events\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`timestamp\` VARCHAR(64) NOT NULL,
        \`type\` VARCHAR(32) NOT NULL,
        \`username\` VARCHAR(64) NOT NULL,
        \`routerName\` VARCHAR(128) NOT NULL,
        \`ipAddress\` VARCHAR(64) NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_events_timestamp\` (\`timestamp\`),
        INDEX \`idx_events_username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Demo data store
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`demo_data\` (
        \`routerId\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`dataJson\` LONGTEXT NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    isInitialized = true;
    return true;
  } catch (err) {
    console.error('❌ Error initializing MySQL tables:', err);
    throw err;
  }
}
