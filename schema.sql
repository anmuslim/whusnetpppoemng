-- ========================================================
-- PPPoE Manager Database Schema for MySQL 8.x / MariaDB 10.x
-- Karakter Enkoding: UTF-8 Unicode (utf8mb4)
-- ========================================================

CREATE DATABASE IF NOT EXISTS `pppoe_manager` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `pppoe_manager`;

-- 1. Tabel Router MikroTik
CREATE TABLE IF NOT EXISTS `routers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL UNIQUE,
  `host` VARCHAR(128) NOT NULL,
  `port` INT NOT NULL DEFAULT 8728,
  `username` VARCHAR(128) NOT NULL,
  `encryptedPassword` TEXT NULL,
  `mode` VARCHAR(32) NOT NULL DEFAULT 'API',
  `notes` TEXT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'online',
  `lastSeen` VARCHAR(64) NULL,
  `lastError` TEXT NULL,
  `identity` VARCHAR(128) NULL,
  `version` VARCHAR(128) NULL,
  `uptime` VARCHAR(128) NULL,
  `cpuLoad` INT NOT NULL DEFAULT 0,
  `freeMemory` INT NOT NULL DEFAULT 0,
  `totalMemory` INT NOT NULL DEFAULT 0,
  `boardName` VARCHAR(128) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Pengguna Sistem (Admin, Operator, Teknisi)
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `name` VARCHAR(128) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'operator',
  `passwordHash` VARCHAR(128) NOT NULL,
  `allowedMenus` TEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `createdAt` VARCHAR(64) NOT NULL,
  `lastLogin` VARCHAR(64) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Catatan Audit (Audit Trail Log)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `timestamp` VARCHAR(64) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `routerId` VARCHAR(64) NOT NULL,
  `routerName` VARCHAR(128) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `targetType` VARCHAR(32) NOT NULL,
  `targetName` VARCHAR(128) NOT NULL,
  `details` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_timestamp` (`timestamp`),
  INDEX `idx_audit_routerId` (`routerId`),
  INDEX `idx_audit_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Aktivitas Sesi PPPoE (Connect / Disconnect)
CREATE TABLE IF NOT EXISTS `recent_events` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `timestamp` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `routerName` VARCHAR(128) NOT NULL,
  `ipAddress` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_events_timestamp` (`timestamp`),
  INDEX `idx_events_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Data Demo (Opsional untuk Simulator Mode Demo)
CREATE TABLE IF NOT EXISTS `demo_data` (
  `routerId` VARCHAR(64) NOT NULL PRIMARY KEY,
  `dataJson` LONGTEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Default Admin jika belum ada (Password awal: admin123)
-- SHA-256 ('admin123') = 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT IGNORE INTO `users` (`id`, `username`, `name`, `role`, `passwordHash`, `allowedMenus`, `status`, `createdAt`)
VALUES (
  'user-admin-1',
  'admin',
  'Administrator Utama',
  'superadmin',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  '["dashboard","routers","secrets","active","profiles","queues","pools","audit","users"]',
  'active',
  UTC_TIMESTAMP()
);
