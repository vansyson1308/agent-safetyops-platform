import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.ts';
import { hasPermission, type Permission } from '../lib/permissions.ts';

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  }
  console.warn('JWT_SECRET is not set; using a random secret. Sessions end when the server restarts.');
  return crypto.randomBytes(32).toString('hex');
}

const JWT_SECRET = resolveJwtSecret();

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string; email: string };
    }
  }
}

// Requires a valid JWT. The user is re-read on every request so role
// changes and deleted accounts take effect immediately.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let userId: string;
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as { userId?: unknown };
    if (typeof decoded.userId !== 'string') throw new Error('Token has no userId');
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasPermission(req.user?.role, permission)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
}
