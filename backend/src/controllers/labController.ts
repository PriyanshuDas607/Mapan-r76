/**
 * Laboratory Controller
 * ======================
 * Manages laboratory records. All operations require SUPER_ADMIN.
 * Lab Admins can GET their own lab only.
 *
 * GET    /labs       — SA: all labs; LA: own lab only
 * POST   /labs       — SA only
 * GET    /labs/:id   — SA or LA of that lab
 * PATCH  /labs/:id   — SA only
 * PATCH  /labs/:id/deactivate — SA only
 */

import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { appendAuditEvent } from '../services/auditService';
import { AuthRequest } from '../middleware/auth';
import { ROLES } from '../middleware/rbac';
import { z } from 'zod';

const labSchema = z.object({
  name:    z.string().min(1),
  code:    z.string().min(1).max(20),
  address: z.string().optional(),
  active:  z.boolean().optional(),
});

const updateLabSchema = labSchema.partial();

function getActorId(req: AuthRequest): string | undefined {
  return req.user?.id;
}

/**
 * GET /api/v1/labs
 * - SUPER_ADMIN: all labs
 * - LAB_ADMIN: their own lab only
 */
export const listLabs = async (req: AuthRequest, res: Response): Promise<Response> => {
  const actorRole  = req.user?.role;
  const actorLabId = req.user?.labId;

  if (actorRole === ROLES.SUPER_ADMIN) {
    const labs = await prisma.laboratories.findMany({ orderBy: { name: 'asc' } });
    return res.json({ success: true, data: labs });
  }

  if (actorRole === ROLES.LAB_ADMIN && actorLabId) {
    const lab = await prisma.laboratories.findUnique({ where: { id: actorLabId } });
    return res.json({ success: true, data: lab ? [lab] : [] });
  }

  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Only Super Admin or Lab Admin can list laboratories.' },
  });
};

/**
 * GET /api/v1/labs/:id
 */
export const getLab = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }    = req.params;
  const actorRole = req.user?.role;
  const actorLabId = req.user?.labId;

  const lab = await prisma.laboratories.findUnique({
    where: { id },
    include: {
      _count: {
        select: { users: true, instruments: true, testSessions: true, reports: true },
      },
    },
  });

  if (!lab) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Laboratory not found' },
    });
  }

  // SA sees all; LA only their own
  if (actorRole !== ROLES.SUPER_ADMIN && lab.id !== actorLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'You do not have access to this laboratory.' },
    });
  }

  return res.json({ success: true, data: lab });
};

/**
 * POST /api/v1/labs
 * Create a new laboratory. SUPER_ADMIN only.
 */
export const createLab = async (req: AuthRequest, res: Response): Promise<Response> => {
  const actorId = getActorId(req);

  const parse = labSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  // Check code uniqueness
  const existing = await prisma.laboratories.findUnique({ where: { code: parse.data.code } });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'CODE_EXISTS', message: `Laboratory code '${parse.data.code}' already exists.` },
    });
  }

  const lab = await prisma.laboratories.create({ data: parse.data });

  await appendAuditEvent('LAB_CREATED', 'Laboratory', lab.id, actorId, req, {
    name: lab.name,
    code: lab.code,
  });

  return res.status(201).json({ success: true, data: lab });
};

/**
 * PATCH /api/v1/labs/:id
 * Update laboratory details. SUPER_ADMIN only.
 */
export const updateLab = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }  = req.params;
  const actorId = getActorId(req);

  const lab = await prisma.laboratories.findUnique({ where: { id } });
  if (!lab) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Laboratory not found' },
    });
  }

  const parse = updateLabSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const updated = await prisma.laboratories.update({ where: { id }, data: parse.data });

  await appendAuditEvent('LAB_UPDATED', 'Laboratory', id, actorId, req, {
    name:    updated.name,
    changes: parse.data,
  });

  return res.json({ success: true, data: updated });
};

/**
 * PATCH /api/v1/labs/:id/deactivate
 * Deactivate a laboratory. SUPER_ADMIN only.
 */
export const deactivateLab = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }  = req.params;
  const actorId = getActorId(req);

  const lab = await prisma.laboratories.findUnique({ where: { id } });
  if (!lab) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Laboratory not found' },
    });
  }

  const updated = await prisma.laboratories.update({
    where: { id },
    data:  { active: false },
  });

  await appendAuditEvent('LAB_DEACTIVATED', 'Laboratory', id, actorId, req, {
    name: lab.name,
    code: lab.code,
  });

  return res.json({ success: true, data: updated });
};
