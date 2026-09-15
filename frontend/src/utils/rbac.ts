/**
 * Frontend RBAC Utilities
 * ========================
 * Role-based access control helpers for the frontend.
 *
 * These are UI-layer helpers only. All authorization is ALSO enforced
 * server-side via the backend API middleware.
 *
 * Role hierarchy (descending privilege):
 *   SUPER_ADMIN  > LAB_ADMIN > SUPERVISOR > TEST_ENGINEER
 */

import type { User, UserRole } from '../services/authStore'

// ─── Role Constants ────────────────────────────────────────────────────────────

export const ROLES = {
  SUPER_ADMIN:   'SUPER_ADMIN'   as const,
  LAB_ADMIN:     'LAB_ADMIN'     as const,
  SUPERVISOR:    'SUPERVISOR'    as const,
  TEST_ENGINEER: 'TEST_ENGINEER' as const,
} satisfies Record<string, UserRole>

// Ascending order of privilege
const ROLE_HIERARCHY: UserRole[] = [
  'TEST_ENGINEER',
  'SUPERVISOR',
  'LAB_ADMIN',
  'SUPER_ADMIN',
]

// ─── Role Display Labels ───────────────────────────────────────────────────────

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN:   'Super Administrator',
  LAB_ADMIN:     'Laboratory Admin',
  SUPERVISOR:    'Supervisor',
  TEST_ENGINEER: 'Test Engineer',
}

export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN:   'Super Admin',
  LAB_ADMIN:     'Lab Admin',
  SUPERVISOR:    'Supervisor',
  TEST_ENGINEER: 'Test Engineer',
}

export const ROLE_BADGE_COLORS: Record<UserRole, { bg: string; color: string }> = {
  SUPER_ADMIN:   { bg: '#f0e6ff', color: '#7c3aed' },
  LAB_ADMIN:     { bg: '#eaf4ff', color: '#1b64b3' },
  SUPERVISOR:    { bg: '#fff7e6', color: '#b45309' },
  TEST_ENGINEER: { bg: '#e6f4ed', color: '#1a7f37' },
}

// ─── Role Checks ──────────────────────────────────────────────────────────────

/** Returns true if the user has exactly this role */
export function hasRole(user: User | null, role: UserRole): boolean {
  if (!user) return false
  return user.role === role
}

/** Returns true if the user's role is at least as privileged as minRole */
export function hasMinRole(user: User | null, minRole: UserRole): boolean {
  if (!user) return false
  const userIdx = ROLE_HIERARCHY.indexOf(user.role)
  const minIdx  = ROLE_HIERARCHY.indexOf(minRole)
  if (userIdx === -1) return false
  return userIdx >= minIdx
}

/** Returns true if the user is a Super Admin */
export function isSuperAdmin(user: User | null): boolean {
  return hasRole(user, 'SUPER_ADMIN')
}

/** Returns true if the user is a Lab Admin or higher */
export function isLabAdminOrAbove(user: User | null): boolean {
  return hasMinRole(user, 'LAB_ADMIN')
}

/** Returns true if the user is a Supervisor or higher */
export function isSupervisorOrAbove(user: User | null): boolean {
  return hasMinRole(user, 'SUPERVISOR')
}

/** Returns true if the user is a Test Engineer or higher (any authenticated role) */
export function isTestEngineerOrAbove(user: User | null): boolean {
  return hasMinRole(user, 'TEST_ENGINEER')
}

// ─── Lab Scope Checks ─────────────────────────────────────────────────────────

/**
 * Returns true if the user can view/access data from the given labId.
 * SUPER_ADMIN: always true
 * Others: only if their labId matches
 */
export function canAccessLab(user: User | null, labId: string | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true
  if (!labId) return false
  return user.labId === labId
}

/**
 * Returns true if the user can access the given resource based on labId.
 * Used for frontend data filtering.
 */
export function isInSameLab(user: User | null, resourceLabId: string | null | undefined): boolean {
  return canAccessLab(user, resourceLabId)
}

// ─── User Management Permissions ──────────────────────────────────────────────

/**
 * Returns true if the actor can manage (create/edit/delete) the target role.
 * Prevents role escalation: you can only manage roles strictly below your own.
 */
export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  const actorIdx  = ROLE_HIERARCHY.indexOf(actorRole)
  const targetIdx = ROLE_HIERARCHY.indexOf(targetRole)
  if (actorIdx === -1) return false
  return actorIdx > targetIdx // strictly greater
}

/**
 * Returns the roles that the given actor is allowed to create/assign.
 */
export function creatableRoles(actorRole: UserRole): UserRole[] {
  const actorIdx = ROLE_HIERARCHY.indexOf(actorRole)
  return ROLE_HIERARCHY.filter((_, idx) => idx < actorIdx) as UserRole[]
}

// ─── Instrument Permissions ───────────────────────────────────────────────────

export const permissions = {
  instruments: {
    canCreate: (user: User | null) => isTestEngineerOrAbove(user),
    canEdit:   (user: User | null) => isLabAdminOrAbove(user),
    canDelete: (user: User | null) => isLabAdminOrAbove(user),
    canViewAll:(user: User | null) => isSuperAdmin(user),
  },

  testSessions: {
    canCreate:  (user: User | null) => isTestEngineerOrAbove(user),
    canSubmit:  (user: User | null) => isTestEngineerOrAbove(user),
    canApprove: (user: User | null) => isSupervisorOrAbove(user),
    canReject:  (user: User | null) => isSupervisorOrAbove(user),
    canViewAll: (user: User | null) => isSupervisorOrAbove(user),
  },

  reports: {
    canCreate:   (user: User | null) => isTestEngineerOrAbove(user),
    canApprove:  (user: User | null) => isSupervisorOrAbove(user),
    canDelete:   (user: User | null) => isLabAdminOrAbove(user),
    canVerify:   (user: User | null) => isLabAdminOrAbove(user),
    canViewAll:  (user: User | null) => isSupervisorOrAbove(user),
  },

  users: {
    canList:   (user: User | null) => isLabAdminOrAbove(user),
    canCreate: (user: User | null) => isLabAdminOrAbove(user),
    canEdit:   (user: User | null) => isLabAdminOrAbove(user),
    canDelete: (user: User | null) => isLabAdminOrAbove(user),
  },

  labs: {
    canCreate:     (user: User | null) => isSuperAdmin(user),
    canManage:     (user: User | null) => isSuperAdmin(user),
    canViewGlobal: (user: User | null) => isSuperAdmin(user),
  },

  auditTrail: {
    canViewAll:    (user: User | null) => isSuperAdmin(user),
    canViewLab:    (user: User | null) => isLabAdminOrAbove(user),
    canViewTeam:   (user: User | null) => isSupervisorOrAbove(user),
    canViewOwn:    (user: User | null) => isTestEngineerOrAbove(user),
  },

  search: {
    canSearchGlobal: (user: User | null) => isSuperAdmin(user),
    canSearchLab:    (user: User | null) => isLabAdminOrAbove(user),
    canSearchTeam:   (user: User | null) => isSupervisorOrAbove(user),
  },
}
