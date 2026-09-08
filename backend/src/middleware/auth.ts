import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  username: string;
  shopId: string;
  role: Role;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'retailpos-super-secure-jwt-secret-key-grocery-2026';

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authentication required. Please login.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Session expired or invalid token. Please login again.' });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    res.status(403).json({ success: false, message: 'Admin access required for this action.' });
    return;
  }
  next();
};

export const requireAdminOrPinAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user && req.user.role === Role.ADMIN) {
    next();
    return;
  }

  const pinToken = req.headers['x-admin-pin-auth'] as string | undefined;
  if (pinToken) {
    try {
      const decoded = jwt.verify(pinToken, JWT_SECRET) as any;
      if (decoded && decoded.type === 'ADMIN_DELEGATED' && decoded.shopId === req.user?.shopId) {
        next();
        return;
      }
    } catch {
      // Invalid or expired delegated token
    }
  }

  res.status(403).json({
    success: false,
    message: 'Admin authorization required. Please provide a valid Admin PIN.',
    requiresAdminAuth: true,
  });
};

