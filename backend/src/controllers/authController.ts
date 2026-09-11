import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const login = async (req: Request, res: Response) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }
  const { email, password } = parse.data;
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' },
    });
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' },
    });
  }
  const accessToken = jwt.sign(
    { id: user.id, roles: user.roles },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: Number(process.env.ACCESS_TOKEN_TTL ?? 900) },
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: Number(process.env.REFRESH_TOKEN_TTL ?? 2592000) },
  );
  return res.json({ success: true, data: { accessToken, refreshToken } });
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Refresh token required' },
    });
  }
  try {
    const payload = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string,
    ) as { id: string };
    const user = await prisma.users.findUnique({ where: { id: payload.id } });
    if (!user) throw new Error('User not found');
    const newAccess = jwt.sign(
      { id: user.id, roles: user.roles },
      process.env.JWT_ACCESS_SECRET as string,
      { expiresIn: Number(process.env.ACCESS_TOKEN_TTL ?? 900) },
    );
    return res.json({ success: true, data: { accessToken: newAccess } });
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_REFRESH', message: 'Invalid refresh token' },
    });
  }
};
