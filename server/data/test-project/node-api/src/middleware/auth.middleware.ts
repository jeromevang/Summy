/**
 * Authentication Middleware
 * Validates JWT tokens and attaches user to request
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authService } from '../services/auth.service';
import { AuthenticatedRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

/**
 * Middleware to verify JWT and attach user to request
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }
    
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
      
      const user = await authService.findUserById(decoded.userId);
      
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }
      
      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin || false,
      };
      
      next();
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Token expired' });
      } else if (jwtError.name === 'JsonWebTokenError') {
        res.status(401).json({ error: 'Invalid token' });
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to require admin role
 */
export function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Optional auth - doesn't fail if no token
 */
export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    const user = await authService.findUserById(decoded.userId);
    
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin || false,
      };
    }
  } catch {
    // Ignore token errors for optional auth
  }
  
  next();
}

