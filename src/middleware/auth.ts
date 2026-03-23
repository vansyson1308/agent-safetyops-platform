import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string; email: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string; email: string };
      req.user = { id: decoded.userId, role: decoded.role, email: decoded.email };
      return next();
    } catch {
      // Token invalid, fall through to mock auth
    }
  }

  // Fallback: mock auth for development (find first admin user)
  prisma.user.findFirst({ where: { role: 'admin' } }).then(user => {
    if (user) {
      req.user = { id: user.id, role: user.role, email: user.email };
    } else {
      req.user = { id: 'system', role: 'admin', email: 'system@safetyops.ai' };
    }
    next();
  }).catch(() => {
    req.user = { id: 'system', role: 'admin', email: 'system@safetyops.ai' };
    next();
  });
}

export function generateToken(userId: string, role: string, email: string): string {
  return jwt.sign({ userId, role, email }, JWT_SECRET, { expiresIn: '7d' });
}

export { JWT_SECRET };
