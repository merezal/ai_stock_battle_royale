import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../lib/auth';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// Middleware to verify JWT and attach user to request
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please provide a valid token.' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }

  // Attach user info to request
  req.user = payload;
  next();
}

// Middleware to check if authenticated user matches the userId in request
export function authorizeUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check userId from body, params, or query
  const requestedUserId = parseInt(
    req.body?.userId || req.params?.userId || req.query?.userId as string
  );

  if (requestedUserId && requestedUserId !== req.user.userId) {
    return res.status(403).json({
      error: 'Access denied. You can only access your own resources.'
    });
  }

  next();
}
