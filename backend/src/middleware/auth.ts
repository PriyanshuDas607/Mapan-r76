import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;       // Single canonical role: SUPER_ADMIN | LAB_ADMIN | SUPERVISOR | TEST_ENGINEER
    roles: string[];    // Legacy array — kept for backward compat
    labId?: string;     // null for SUPER_ADMIN (global), set for all other roles
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Missing token' },
    });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as {
      id: string;
      role: string;
      roles: string[];
      labId?: string;
    };
    req.user = {
      id:    payload.id,
      role:  payload.role,
      roles: payload.roles ?? [],
      labId: payload.labId,
    };
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Invalid token' },
    });
  }
};
