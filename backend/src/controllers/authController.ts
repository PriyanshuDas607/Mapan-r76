import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma';
import { appendAuditEvent } from '../services/auditService';
import { z } from 'zod';

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
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
    // Audit failed login attempt
    await appendAuditEvent('LOGIN_FAILED', 'User', email, undefined, req, { email, reason: 'USER_NOT_FOUND' });
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' },
    });
  }

  // Check account is active
  if (!user.active) {
    return res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_DISABLED', message: 'This account has been deactivated.' },
    });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    await appendAuditEvent('LOGIN_FAILED', 'User', user.id, user.id, req, { email, reason: 'WRONG_PASSWORD' });
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' },
    });
  }

  // Derive canonical role (prefer new `role` field, fall back to `roles` array for legacy records)
  const canonicalRole = user.role || (user.roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'TEST_ENGINEER');

  // Build JWT payload — labId comes from DB, NOT from client
  const tokenPayload = {
    id:    user.id,
    role:  canonicalRole,
    roles: user.roles,         // legacy array
    labId: user.labId ?? undefined,
  };

  const accessToken = jwt.sign(
    tokenPayload,
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: Number(process.env.ACCESS_TOKEN_TTL ?? 900) },
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: Number(process.env.REFRESH_TOKEN_TTL ?? 2592000) },
  );

  // Audit successful login
  await appendAuditEvent('LOGIN_SUCCESS', 'User', user.id, user.id, req, {
    email,
    role: canonicalRole,
    labId: user.labId,
  });

  return res.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id:    user.id,
        email: user.email,
        role:  canonicalRole,
        labId: user.labId,
      },
    },
  });
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
    if (!user.active) throw new Error('Account disabled');

    const canonicalRole = user.role || (user.roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'TEST_ENGINEER');

    const newAccess = jwt.sign(
      { id: user.id, role: canonicalRole, roles: user.roles, labId: user.labId ?? undefined },
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
