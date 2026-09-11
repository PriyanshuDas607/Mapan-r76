import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: { id: string; roles: string[] };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Missing token' } });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as { id: string; roles: string[] };
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid token' } });
  }
};
