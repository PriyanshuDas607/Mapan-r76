/**
 * RBAC Authorization Tests
 * =========================
 * Tests for the 4-tier RBAC middleware and permission system.
 *
 * Run with:
 *   cd backend && npx ts-node src/tests/rbac.test.ts
 */

import assert from 'assert'
import { hasMinRole, canManageRole, ROLES, AppRole } from '../middleware/rbac'

// ─── Color helpers ─────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m'
const RED   = '\x1b[31m'
const CYAN  = '\x1b[36m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

function test(description: string, fn: () => void): void {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${description}`)
    passed++
  } catch (err) {
    console.log(`${RED}✗${RESET} ${description}`)
    console.log(`  ${RED}${err instanceof Error ? err.message : String(err)}${RESET}`)
    failed++
  }
}

function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toEqual: (expected: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toBeTrue: () => {
      if (actual !== true) throw new Error(`Expected true, got ${actual}`)
    },
    toBeFalse: () => {
      if (actual !== false) throw new Error(`Expected false, got ${actual}`)
    },
  }
}

// ─── Role Hierarchy Tests ─────────────────────────────────────────────────────

console.log(`\n${CYAN}─── Role Hierarchy Tests ───${RESET}`)

test('SUPER_ADMIN satisfies hasMinRole for all roles', () => {
  expect(hasMinRole(ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN)).toBeTrue()
  expect(hasMinRole(ROLES.SUPER_ADMIN, ROLES.LAB_ADMIN)).toBeTrue()
  expect(hasMinRole(ROLES.SUPER_ADMIN, ROLES.SUPERVISOR)).toBeTrue()
  expect(hasMinRole(ROLES.SUPER_ADMIN, ROLES.TEST_ENGINEER)).toBeTrue()
})

test('LAB_ADMIN satisfies hasMinRole for LA, SUPERVISOR, TE but not SA', () => {
  expect(hasMinRole(ROLES.LAB_ADMIN, ROLES.SUPER_ADMIN)).toBeFalse()
  expect(hasMinRole(ROLES.LAB_ADMIN, ROLES.LAB_ADMIN)).toBeTrue()
  expect(hasMinRole(ROLES.LAB_ADMIN, ROLES.SUPERVISOR)).toBeTrue()
  expect(hasMinRole(ROLES.LAB_ADMIN, ROLES.TEST_ENGINEER)).toBeTrue()
})

test('SUPERVISOR satisfies hasMinRole for SUPERVISOR and TE but not SA or LA', () => {
  expect(hasMinRole(ROLES.SUPERVISOR, ROLES.SUPER_ADMIN)).toBeFalse()
  expect(hasMinRole(ROLES.SUPERVISOR, ROLES.LAB_ADMIN)).toBeFalse()
  expect(hasMinRole(ROLES.SUPERVISOR, ROLES.SUPERVISOR)).toBeTrue()
  expect(hasMinRole(ROLES.SUPERVISOR, ROLES.TEST_ENGINEER)).toBeTrue()
})

test('TEST_ENGINEER only satisfies hasMinRole for TEST_ENGINEER', () => {
  expect(hasMinRole(ROLES.TEST_ENGINEER, ROLES.SUPER_ADMIN)).toBeFalse()
  expect(hasMinRole(ROLES.TEST_ENGINEER, ROLES.LAB_ADMIN)).toBeFalse()
  expect(hasMinRole(ROLES.TEST_ENGINEER, ROLES.SUPERVISOR)).toBeFalse()
  expect(hasMinRole(ROLES.TEST_ENGINEER, ROLES.TEST_ENGINEER)).toBeTrue()
})

test('Unknown role returns false for hasMinRole', () => {
  expect(hasMinRole('UNKNOWN_ROLE', ROLES.TEST_ENGINEER)).toBeFalse()
  expect(hasMinRole('ADMIN', ROLES.TEST_ENGINEER)).toBeFalse()
  expect(hasMinRole('', ROLES.TEST_ENGINEER)).toBeFalse()
})

// ─── Role Escalation Prevention ───────────────────────────────────────────────

console.log(`\n${CYAN}─── Role Escalation Prevention Tests ───${RESET}`)

test('SUPER_ADMIN can manage all roles', () => {
  expect(canManageRole(ROLES.SUPER_ADMIN, ROLES.LAB_ADMIN)).toBeTrue()
  expect(canManageRole(ROLES.SUPER_ADMIN, ROLES.SUPERVISOR)).toBeTrue()
  expect(canManageRole(ROLES.SUPER_ADMIN, ROLES.TEST_ENGINEER)).toBeTrue()
})

test('SUPER_ADMIN cannot manage another SUPER_ADMIN (peer protection)', () => {
  expect(canManageRole(ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN)).toBeFalse()
})

test('LAB_ADMIN can manage SUPERVISOR and TEST_ENGINEER', () => {
  expect(canManageRole(ROLES.LAB_ADMIN, ROLES.SUPERVISOR)).toBeTrue()
  expect(canManageRole(ROLES.LAB_ADMIN, ROLES.TEST_ENGINEER)).toBeTrue()
})

test('LAB_ADMIN cannot manage LAB_ADMIN or SUPER_ADMIN', () => {
  expect(canManageRole(ROLES.LAB_ADMIN, ROLES.LAB_ADMIN)).toBeFalse()
  expect(canManageRole(ROLES.LAB_ADMIN, ROLES.SUPER_ADMIN)).toBeFalse()
})

test('SUPERVISOR cannot manage any admin-level role', () => {
  expect(canManageRole(ROLES.SUPERVISOR, ROLES.SUPER_ADMIN)).toBeFalse()
  expect(canManageRole(ROLES.SUPERVISOR, ROLES.LAB_ADMIN)).toBeFalse()
  expect(canManageRole(ROLES.SUPERVISOR, ROLES.SUPERVISOR)).toBeFalse()
})

test('SUPERVISOR can manage TEST_ENGINEER', () => {
  expect(canManageRole(ROLES.SUPERVISOR, ROLES.TEST_ENGINEER)).toBeTrue()
})

test('TEST_ENGINEER cannot manage any role', () => {
  expect(canManageRole(ROLES.TEST_ENGINEER, ROLES.SUPER_ADMIN)).toBeFalse()
  expect(canManageRole(ROLES.TEST_ENGINEER, ROLES.LAB_ADMIN)).toBeFalse()
  expect(canManageRole(ROLES.TEST_ENGINEER, ROLES.SUPERVISOR)).toBeFalse()
  expect(canManageRole(ROLES.TEST_ENGINEER, ROLES.TEST_ENGINEER)).toBeFalse()
})

test('Unknown actor role cannot manage any target role', () => {
  expect(canManageRole('ADMIN' as AppRole, ROLES.TEST_ENGINEER)).toBeFalse()
  expect(canManageRole('OPERATOR' as AppRole, ROLES.TEST_ENGINEER)).toBeFalse()
  expect(canManageRole('' as AppRole, ROLES.TEST_ENGINEER)).toBeFalse()
})

// ─── Role Constants ────────────────────────────────────────────────────────────

console.log(`\n${CYAN}─── Role Constants Tests ───${RESET}`)

test('ROLES object has all 4 canonical values', () => {
  expect(Object.keys(ROLES).length).toBe(4)
  expect(ROLES.SUPER_ADMIN).toBe('SUPER_ADMIN')
  expect(ROLES.LAB_ADMIN).toBe('LAB_ADMIN')
  expect(ROLES.SUPERVISOR).toBe('SUPERVISOR')
  expect(ROLES.TEST_ENGINEER).toBe('TEST_ENGINEER')
})

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${CYAN}─── Results ───${RESET}`)
console.log(`${GREEN}Passed: ${passed}${RESET}`)
if (failed > 0) {
  console.log(`${RED}Failed: ${failed}${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed ✓${RESET}\n`)
}
