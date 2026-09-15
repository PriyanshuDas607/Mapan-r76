/**
 * User Controller
 * ================
 * CRUD operations on Users with full 4-tier RBAC enforcement.
 *
 * GET    /users          — SA: all; LA: their lab; others: 403
 * POST   /users          — SA: create any role; LA: create SUPERVISOR/TE in their lab
 * GET    /users/:id      — self, or SA, or LA within same lab
 * PATCH  /users/:id      — role/lab changes scoped; escalation prevented
 * DELETE /users/:id      — SA: any; LA: SUPERVISOR/TE in their lab; self: 403
 * PATCH  /users/:id/activate   — SA + LA (in lab)
 * PATCH  /users/:id/deactivate — SA + LA (in lab)
 */

import { Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma';
import { appendAuditEvent } from '../services/auditService';
import { AuthRequest } from '../middleware/auth';
import { ROLES, canManageRole } from '../middleware/rbac';
import { z } from 'zod';

const createUserSchema = z.object({
  email:        z.string().email(),
  password:     z.string().min(6),
  role:         z.enum(['SUPER_ADMIN', 'LAB_ADMIN', 'SUPERVISOR', 'TEST_ENGINEER']),
  labId:        z.string().uuid().optional(),
  name:         z.string().min(1).optional(), // stored in extra metadata if needed
});

const updateUserSchema = z.object({
  role:   z.enum(['SUPER_ADMIN', 'LAB_ADMIN', 'SUPERVISOR', 'TEST_ENGINEER']).optional(),
  labId:  z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

function getUserId(req: AuthRequest): string | undefined {
  return req.user?.id;
}

/**
 * GET /api/v1/users
 * List users with role-based scoping.
 */
export const listUsers = async (req: AuthRequest, res: Response): Promise<Response> => {
  const actorRole  = req.user?.role;
  const actorLabId = req.user?.labId;

  let whereClause: Record<string, unknown> = {};

  if (actorRole === ROLES.SUPER_ADMIN) {
    // SA can filter by lab via query param, or see all
    if (req.query.labId) whereClause = { labId: req.query.labId as string };
  } else if (actorRole === ROLES.LAB_ADMIN) {
    if (!actorLabId) {
      return res.status(403).json({
        success: false,
        error: { code: 'NO_LAB_ASSIGNED', message: 'No laboratory assignment.' },
      });
    }
    whereClause = { labId: actorLabId };
  } else {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only Lab Admins and Super Admins can list users.' },
    });
  }

  const users = await prisma.users.findMany({
    where: whereClause,
    select: {
      id:         true,
      email:      true,
      role:       true,
      roles:      true,
      labId:      true,
      active:     true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return res.json({ success: true, data: users });
};

/**
 * GET /api/v1/users/:id
 * Get a single user. Allowed for: self, SA, LA (same lab).
 */
export const getUser = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }     = req.params;
  const actorRole  = req.user?.role;
  const actorLabId = req.user?.labId;
  const actorId    = getUserId(req);

  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      id:         true,
      email:      true,
      role:       true,
      roles:      true,
      labId:      true,
      active:     true,
      created_at: true,
    },
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
  }

  // Allow self-access
  if (actorId === id) return res.json({ success: true, data: user });
  // SA sees all
  if (actorRole === ROLES.SUPER_ADMIN) return res.json({ success: true, data: user });
  // LA sees their lab's users
  if (actorRole === ROLES.LAB_ADMIN && user.labId === actorLabId) {
    return res.json({ success: true, data: user });
  }

  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: 'You do not have permission to view this user.' },
  });
};

/**
 * POST /api/v1/users
 * Create a new user. SA can create any role. LA can create SUPERVISOR/TE in their lab only.
 */
export const createUser = async (req: AuthRequest, res: Response): Promise<Response> => {
  const actorRole  = req.user?.role;
  const actorLabId = req.user?.labId;
  const actorId    = getUserId(req);

  const parse = createUserSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const { email, password, role: targetRole, labId: bodyLabId } = parse.data;

  // Role escalation prevention: LA cannot create LA or SA
  if (actorRole === ROLES.LAB_ADMIN && !canManageRole(ROLES.LAB_ADMIN, targetRole)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'ROLE_ESCALATION_DENIED',
        message: `Lab Admin cannot create users with role ${targetRole}.`,
      },
    });
  }

  // Determine labId: non-SA must use their own labId
  let assignedLabId: string | null;
  if (actorRole === ROLES.SUPER_ADMIN) {
    assignedLabId = bodyLabId ?? null;
  } else {
    // LA: always assign to their own lab
    assignedLabId = actorLabId ?? null;
  }

  // Check email uniqueness
  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'A user with this email already exists.' },
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await prisma.users.create({
    data: {
      email,
      password_hash: passwordHash,
      role:          targetRole,
      roles:         [targetRole],
      labId:         assignedLabId,
      active:        true,
    },
    select: { id: true, email: true, role: true, labId: true, active: true, created_at: true },
  });

  await appendAuditEvent('USER_CREATED', 'User', newUser.id, actorId, req, {
    email:        newUser.email,
    role:         newUser.role,
    labId:        newUser.labId,
    createdBy:    actorId,
    creatorRole:  actorRole,
  });

  return res.status(201).json({ success: true, data: newUser });
};

/**
 * PATCH /api/v1/users/:id
 * Update user role or labId. Prevents escalation.
 */
export const updateUserRecord = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }     = req.params;
  const actorRole  = req.user?.role;
  const actorLabId = req.user?.labId;
  const actorId    = getUserId(req);

  const targetUser = await prisma.users.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
  }

  // SA can update anyone; LA can only update users in their lab
  if (actorRole !== ROLES.SUPER_ADMIN && targetUser.labId !== actorLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'Cannot update a user from another laboratory.' },
    });
  }

  const parse = updateUserSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const { role: newRole, labId: newLabId, active } = parse.data;

  // Role escalation prevention
  if (newRole && actorRole !== ROLES.SUPER_ADMIN) {
    if (!canManageRole(actorRole ?? '', newRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ROLE_ESCALATION_DENIED',
          message: `You cannot assign the role ${newRole}.`,
        },
      });
    }
  }

  // Prevent actors from changing their own role
  if (actorId === id && newRole && newRole !== targetUser.role) {
    return res.status(403).json({
      success: false,
      error: { code: 'SELF_ROLE_CHANGE_DENIED', message: 'You cannot change your own role.' },
    });
  }

  // Only SA can change labId
  if (newLabId !== undefined && actorRole !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only Super Admin can reassign laboratory.' },
    });
  }

  const updateData: Record<string, unknown> = {};
  if (newRole   !== undefined) { updateData.role = newRole; updateData.roles = [newRole]; }
  if (newLabId  !== undefined) updateData.labId = newLabId;
  if (active    !== undefined) updateData.active = active;

  const updated = await prisma.users.update({
    where: { id },
    data:  updateData,
    select: { id: true, email: true, role: true, labId: true, active: true },
  });

  const auditAction = newRole && newRole !== targetUser.role ? 'USER_ROLE_CHANGED'
    : newLabId !== undefined ? 'USER_LAB_ASSIGNED'
    : active !== undefined ? (active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED')
    : 'USER_UPDATED';

  await appendAuditEvent(auditAction, 'User', id, actorId, req, {
    previousRole:  targetUser.role,
    newRole:       newRole,
    previousLabId: targetUser.labId,
    newLabId,
    active,
    updatedBy:     actorId,
  });

  return res.json({ success: true, data: updated });
};

/**
 * DELETE /api/v1/users/:id
 * Delete a user. Cannot delete self.
 */
export const deleteUserRecord = async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id }     = req.params;
  const actorRole  = req.user?.role;
  const actorLabId = req.user?.labId;
  const actorId    = getUserId(req);

  if (actorId === id) {
    return res.status(403).json({
      success: false,
      error: { code: 'SELF_DELETE_DENIED', message: 'You cannot delete your own account.' },
    });
  }

  const targetUser = await prisma.users.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
  }

  // Lab isolation
  if (actorRole !== ROLES.SUPER_ADMIN && targetUser.labId !== actorLabId) {
    return res.status(403).json({
      success: false,
      error: { code: 'LAB_ISOLATION_VIOLATION', message: 'Cannot delete a user from another laboratory.' },
    });
  }

  // LA cannot delete LA or SA
  if (actorRole === ROLES.LAB_ADMIN && !canManageRole(ROLES.LAB_ADMIN, targetUser.role)) {
    return res.status(403).json({
      success: false,
      error: { code: 'ROLE_ESCALATION_DENIED', message: `Lab Admin cannot delete users with role ${targetUser.role}.` },
    });
  }

  await prisma.users.delete({ where: { id } });

  await appendAuditEvent('USER_DELETED', 'User', id, actorId, req, {
    deletedEmail: targetUser.email,
    deletedRole:  targetUser.role,
    deletedLabId: targetUser.labId,
    deletedBy:    actorId,
  });

  return res.json({ success: true, data: { id } });
};
