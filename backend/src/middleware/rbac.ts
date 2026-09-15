/**
 * RBAC Middleware
 * ===============
 * Centralized role-based access control for all API routes.
 *
 * Roles (descending privilege):
 *   SUPER_ADMIN  — global access across all laboratories
 *   LAB_ADMIN    — full access within their assigned laboratory
 *   SUPERVISOR   — operational access to team/sessions within their lab
 *   TEST_ENGINEER— access only to their own assigned work
 *
 * Usage:
 *   router.get('/instruments', authenticate, requireRole('SUPER_ADMIN', 'LAB_ADMIN'), getAll)
 *   router.get('/instruments/:id', authenticate, requireLabScope, getById)
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

// ─── Role Constants ────────────────────────────────────────────────────────────

export const ROLES = {
  SUPER_ADMIN:   'SUPER_ADMIN',
  LAB_ADMIN:     'LAB_ADMIN',
  SUPERVISOR:    'SUPERVISOR',
  TEST_ENGINEER: 'TEST_ENGINEER',
} as const;

export type AppRole = typeof ROLES[keyof typeof ROLES];

// Hierarchy: higher index = more privilege
const ROLE_HIERARCHY: AppRole[] = [
  ROLES.TEST_ENGINEER,
  ROLES.SUPERVISOR,
  ROLES.LAB_ADMIN,
  ROLES.SUPER_ADMIN,
];

/**
 * Returns true if `userRole` is at least as privileged as `minRole`.
 */
export function hasMinRole(userRole: string, minRole: AppRole): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(userRole as AppRole);
  const minIdx  = ROLE_HIERARCHY.indexOf(minRole);
  if (userIdx === -1) return false; // unknown role → deny
  return userIdx >= minIdx;
}

/**
 * Returns true if `userRole` can manage a target user with `targetRole`.
 * Prevents role escalation: you can only manage roles below your own.
 */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  const actorIdx  = ROLE_HIERARCHY.indexOf(actorRole as AppRole);
  const targetIdx = ROLE_HIERARCHY.indexOf(targetRole as AppRole);
  if (actorIdx === -1) return false;
  return actorIdx > targetIdx; // strictly greater — cannot manage peers
}

// ─── Middleware Factories ──────────────────────────────────────────────────────

/**
 * requireRole(...allowedRoles)
 * Allows access only if the authenticated user has one of the specified roles.
 * Must be used AFTER the `authenticate` middleware.
 */
export function requireRole(...allowedRoles: AppRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }
    if (!allowedRoles.includes(userRole as AppRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${userRole}`,
        },
      });
    }
    return next();
  };
}

/**
 * requireMinRole(minRole)
 * Allows access if the user's role is at or above `minRole` in the hierarchy.
 */
export function requireMinRole(minRole: AppRole) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }
    if (!hasMinRole(userRole, minRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Minimum required role: ${minRole}. Your role: ${userRole}`,
        },
      });
    }
    return next();
  };
}

/**
 * requireLabMatch(getResourceLabId)
 * Verifies that the resource's lab matches the authenticated user's lab.
 * SUPER_ADMIN is always allowed regardless of lab.
 *
 * @param getResourceLabId - async function that returns the labId of the resource being accessed
 */
export function requireLabMatch(
  getResourceLabId: (req: AuthRequest) => Promise<string | null | undefined>,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;
    const userLabId = req.user?.labId;

    // SUPER_ADMIN bypasses all lab restrictions
    if (userRole === ROLES.SUPER_ADMIN) return next();

    try {
      const resourceLabId = await getResourceLabId(req);

      if (!resourceLabId) {
        // Resource has no labId — deny for non-SA (safer default)
        return res.status(403).json({
          success: false,
          error: {
            code: 'LAB_ISOLATION_VIOLATION',
            message: 'Resource has no laboratory assignment. Access denied.',
          },
        });
      }

      if (userLabId !== resourceLabId) {
        // Log this as a potential IDOR attempt
        console.warn(
          `[RBAC] Lab isolation violation: user ${req.user?.id} (labId=${userLabId}) attempted to access resource in lab ${resourceLabId}`,
        );
        return res.status(403).json({
          success: false,
          error: {
            code: 'LAB_ISOLATION_VIOLATION',
            message: 'You do not have access to resources from another laboratory.',
          },
        });
      }

      return next();
    } catch (err) {
      console.error('[RBAC] requireLabMatch error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Authorization check failed' },
      });
    }
  };
}

/**
 * requireOwnership(getUserId)
 * Verifies that the resource belongs to the authenticated user.
 * SUPER_ADMIN and LAB_ADMIN and SUPERVISOR bypass this check.
 */
export function requireOwnership(
  getResourceOwnerId: (req: AuthRequest) => Promise<string | null | undefined>,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole  = req.user?.role;
    const userId    = req.user?.id;

    // SA, LA, SUPERVISOR can access any record in their lab
    if (
      userRole === ROLES.SUPER_ADMIN ||
      userRole === ROLES.LAB_ADMIN   ||
      userRole === ROLES.SUPERVISOR
    ) {
      return next();
    }

    try {
      const ownerId = await getResourceOwnerId(req);
      if (ownerId && ownerId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'OWNERSHIP_VIOLATION',
            message: 'You can only access your own records.',
          },
        });
      }
      return next();
    } catch (err) {
      console.error('[RBAC] requireOwnership error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Authorization check failed' },
      });
    }
  };
}

/**
 * preventLabIdSpoofing
 * Strips `labId` from request body for non-SUPER_ADMIN users.
 * The backend always derives labId from the JWT, not from client input.
 */
export function preventLabIdSpoofing(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  const userRole = req.user?.role;
  if (userRole !== ROLES.SUPER_ADMIN && req.body && 'labId' in req.body) {
    // Override with JWT-derived labId — body labId is untrusted for non-SA
    req.body.labId = req.user?.labId;
  }
  return next();
}

