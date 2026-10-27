import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { storage } from './storage.js';

const JWT_SECRET = process.env.JWT_SECRET || 'pppoe-manager-super-secret-jwt-key-2026';

export interface AuthPayload {
  userId: string;
  username: string;
  name: string;
  role: string;
  allowedMenus: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export function requireSuperadmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, error: 'Akses khusus untuk Superadmin.' });
  }
  next();
}

export function hashPassword(plainText: string): string {
  return crypto.createHash('sha256').update(plainText).digest('hex');
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Allow public endpoints
  if (req.path.startsWith('/api/auth/login')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Akses ditolak. Token autentikasi diperlukan.' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Sesi login telah kedaluwarsa atau tidak valid.' });
  }

  req.user = payload;
  next();
}
