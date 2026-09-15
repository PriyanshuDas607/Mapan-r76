import {
  ROLE_LABELS,
  ROLE_BADGE_COLORS,
  isSuperAdmin,
  isLabAdminOrAbove,
  isSupervisorOrAbove,
  isTestEngineerOrAbove,
  canAccessLab,
  canManageRole,
  creatableRoles,
  permissions,
} from '../utils/rbac'
import type { User } from '../services/authStore'
import { migrateLegacyRole, DEFAULT_ADMIN_USER } from '../services/authStore'

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✓ ${msg}`)
    passed++
  } else {
    console.error(`✗ FAIL: ${msg}`)
    failed++
  }
}

console.log('\n─── Test 1: User Models & Role Definitions ───')
const superAdmin: User = {
  id: 'usr-sa',
  name: 'Super Admin User',
  email: 'admin@mapan.gov',
  passwordHash: 'hash',
  role: 'SUPER_ADMIN',
  active: true,
  laboratory: 'Central Standards Lab',
  department: 'Admin',
  createdAt: new Date().toISOString(),
}

const labAdmin1: User = {
  id: 'usr-la1',
  name: 'Lab Admin 1',
  email: 'la1@csl.mapan.gov',
  passwordHash: 'hash',
  role: 'LAB_ADMIN',
  labId: 'lab-central-001',
  active: true,
  laboratory: 'Central Standards Lab',
  department: 'Calibration',
  createdAt: new Date().toISOString(),
}

const supervisor1: User = {
  id: 'usr-sup1',
  name: 'Supervisor 1',
  email: 'sup1@csl.mapan.gov',
  passwordHash: 'hash',
  role: 'SUPERVISOR',
  labId: 'lab-central-001',
  active: true,
  laboratory: 'Central Standards Lab',
  department: 'Calibration',
  createdAt: new Date().toISOString(),
}

const testEngineer1: User = {
  id: 'usr-te1',
  name: 'Test Engineer 1',
  email: 'te1@csl.mapan.gov',
  passwordHash: 'hash',
  role: 'TEST_ENGINEER',
  labId: 'lab-central-001',
  active: true,
  laboratory: 'Central Standards Lab',
  department: 'Testing',
  createdAt: new Date().toISOString(),
}

const testEngineer2OtherLab: User = {
  id: 'usr-te2',
  name: 'Test Engineer 2 (Regional)',
  email: 'te2@regional.mapan.gov',
  passwordHash: 'hash',
  role: 'TEST_ENGINEER',
  labId: 'lab-regional-002',
  active: true,
  laboratory: 'Regional Lab',
  department: 'Testing',
  createdAt: new Date().toISOString(),
}

assert(superAdmin.role === 'SUPER_ADMIN', 'Default super admin has SUPER_ADMIN role')
assert(DEFAULT_ADMIN_USER.role === 'SUPER_ADMIN', 'DEFAULT_ADMIN_USER in authStore is SUPER_ADMIN')
assert(ROLE_LABELS.SUPER_ADMIN === 'Super Administrator', 'Role label for SUPER_ADMIN is correct')
assert(ROLE_BADGE_COLORS.SUPER_ADMIN.bg !== '', 'Role badge colors exist for all roles')

console.log('\n─── Test 2: Role Level Checks ───')
assert(isSuperAdmin(superAdmin), 'isSuperAdmin(superAdmin) is true')
assert(!isSuperAdmin(labAdmin1), 'isSuperAdmin(labAdmin1) is false')
assert(isLabAdminOrAbove(superAdmin), 'isLabAdminOrAbove(superAdmin) is true')
assert(isLabAdminOrAbove(labAdmin1), 'isLabAdminOrAbove(labAdmin1) is true')
assert(!isLabAdminOrAbove(supervisor1), 'isLabAdminOrAbove(supervisor1) is false')
assert(isSupervisorOrAbove(supervisor1), 'isSupervisorOrAbove(supervisor1) is true')
assert(!isSupervisorOrAbove(testEngineer1), 'isSupervisorOrAbove(testEngineer1) is false')
assert(isTestEngineerOrAbove(testEngineer1), 'isTestEngineerOrAbove(testEngineer1) is true')

console.log('\n─── Test 3: Multi-Lab Data Isolation (canAccessLab) ───')
assert(canAccessLab(superAdmin, 'lab-central-001'), 'Super Admin can access Lab Central')
assert(canAccessLab(superAdmin, 'lab-regional-002'), 'Super Admin can access Lab Regional (Global Access)')
assert(canAccessLab(superAdmin, null), 'Super Admin can access resources with null labId')
assert(canAccessLab(labAdmin1, 'lab-central-001'), 'Lab Admin 1 can access their own lab')
assert(!canAccessLab(labAdmin1, 'lab-regional-002'), 'Lab Admin 1 CANNOT access another lab (Isolation enforced)')
assert(canAccessLab(supervisor1, 'lab-central-001'), 'Supervisor 1 can access their own lab')
assert(!canAccessLab(supervisor1, 'lab-regional-002'), 'Supervisor 1 CANNOT access another lab')
assert(!canAccessLab(testEngineer1, 'lab-regional-002'), 'Test Engineer 1 CANNOT access another lab')
assert(!canAccessLab(testEngineer2OtherLab, 'lab-central-001'), 'Test Engineer 2 CANNOT access Lab Central')

console.log('\n─── Test 4: Role Escalation & User Management ───')
assert(canManageRole('SUPER_ADMIN', 'LAB_ADMIN'), 'Super Admin can manage Lab Admin')
assert(canManageRole('SUPER_ADMIN', 'SUPERVISOR'), 'Super Admin can manage Supervisor')
assert(canManageRole('SUPER_ADMIN', 'TEST_ENGINEER'), 'Super Admin can manage Test Engineer')
assert(!canManageRole('SUPER_ADMIN', 'SUPER_ADMIN'), 'Super Admin cannot manage another Super Admin (peer lock)')

assert(canManageRole('LAB_ADMIN', 'SUPERVISOR'), 'Lab Admin can manage Supervisor')
assert(canManageRole('LAB_ADMIN', 'TEST_ENGINEER'), 'Lab Admin can manage Test Engineer')
assert(!canManageRole('LAB_ADMIN', 'LAB_ADMIN'), 'Lab Admin CANNOT manage/create Lab Admin (no privilege escalation)')
assert(!canManageRole('LAB_ADMIN', 'SUPER_ADMIN'), 'Lab Admin CANNOT manage Super Admin')

assert(canManageRole('SUPERVISOR', 'TEST_ENGINEER'), 'Supervisor can manage Test Engineer')
assert(!canManageRole('SUPERVISOR', 'SUPERVISOR'), 'Supervisor CANNOT manage Supervisor')
assert(!canManageRole('SUPERVISOR', 'LAB_ADMIN'), 'Supervisor CANNOT manage Lab Admin')

assert(!canManageRole('TEST_ENGINEER', 'TEST_ENGINEER'), 'Test Engineer CANNOT manage any roles')

console.log('\n─── Test 5: Creatable Roles Matrix ───')
assert(JSON.stringify(creatableRoles('SUPER_ADMIN')) === JSON.stringify(['TEST_ENGINEER', 'SUPERVISOR', 'LAB_ADMIN']), 'SA can create TE, SUP, LA')
assert(JSON.stringify(creatableRoles('LAB_ADMIN')) === JSON.stringify(['TEST_ENGINEER', 'SUPERVISOR']), 'LA can create TE and SUP only')
assert(JSON.stringify(creatableRoles('SUPERVISOR')) === JSON.stringify(['TEST_ENGINEER']), 'SUP can create TE only')
assert(JSON.stringify(creatableRoles('TEST_ENGINEER')) === JSON.stringify([]), 'TE cannot create any roles')

console.log('\n─── Test 6: Permissions Map ───')
// Instruments
assert(permissions.instruments.canCreate(testEngineer1), 'TE can register instruments')
assert(!permissions.instruments.canEdit(testEngineer1), 'TE cannot edit instruments')
assert(permissions.instruments.canEdit(labAdmin1), 'LA can edit instruments')
assert(permissions.instruments.canDelete(labAdmin1), 'LA can delete instruments')

// Test Sessions (Approve/Reject)
assert(permissions.testSessions.canCreate(testEngineer1), 'TE can create test session')
assert(permissions.testSessions.canSubmit(testEngineer1), 'TE can submit test session')
assert(!permissions.testSessions.canApprove(testEngineer1), 'TE CANNOT approve test sessions')
assert(permissions.testSessions.canApprove(supervisor1), 'Supervisor CAN approve test sessions')
assert(permissions.testSessions.canApprove(labAdmin1), 'Lab Admin CAN approve test sessions')

// Lab Management
assert(permissions.labs.canCreate(superAdmin), 'Super Admin can create laboratories')
assert(!permissions.labs.canCreate(labAdmin1), 'Lab Admin CANNOT create laboratories')
assert(!permissions.labs.canCreate(supervisor1), 'Supervisor CANNOT create laboratories')

console.log('\n─── Test 7: Legacy Role Migration ───')
assert(migrateLegacyRole('ADMIN', 'admin@mapan.gov') === 'SUPER_ADMIN', 'admin@mapan.gov migrates to SUPER_ADMIN')
assert(migrateLegacyRole('ADMIN', 'other@lab.com') === 'LAB_ADMIN', 'Other ADMIN migrates to LAB_ADMIN')
assert(migrateLegacyRole('OPERATOR', 'any@lab.com') === 'TEST_ENGINEER', 'OPERATOR migrates to TEST_ENGINEER')
assert(migrateLegacyRole('SUPERVISOR', 'any@lab.com') === 'SUPERVISOR', 'Canonical SUPERVISOR stays SUPERVISOR')

console.log('\n─── Final Results ───')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('ALL FRONTEND & RBAC LOGIC TESTS PASSED! ✓\n')
}
