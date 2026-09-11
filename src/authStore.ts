import { db, doc, setDoc, deleteDoc } from './firebase'

export type UserRole = 'ADMIN' | 'OPERATOR'

export type User = {
  id: string
  name: string
  email: string
  passwordHash: string
  role: UserRole
  active: boolean
  laboratory: string
  department: string
  jobTitle?: string
  phone?: string
  createdAt: string
  lastLogin?: string
}

const STORAGE_USERS_KEY = 'mapan_metrology_users'
const STORAGE_SESSION_KEY = 'mapan_metrology_session'

// Designated Primary Administrator (Stored securely as Admin)
const DEFAULT_USERS: User[] = [
  {
    id: 'USR-ADMIN-01',
    name: 'Dr. Vikram Mehta',
    email: 'admin@mapan.gov',
    passwordHash: 'Admin@2026',
    role: 'ADMIN',
    active: true,
    laboratory: 'Central Standards Laboratory',
    department: 'Directorate of Legal Metrology',
    jobTitle: 'Chief Standards Officer / Director',
    phone: '+91 98765 43210',
    createdAt: '2026-01-15T09:00:00.000Z',
  },
  {
    id: 'USR-OPERATOR-01',
    name: 'Ananya Rao',
    email: 'ananya@mapan.gov',
    passwordHash: 'Ananya@2026',
    role: 'OPERATOR',
    active: true,
    laboratory: 'Central Standards Laboratory',
    department: 'Precision Calibration Division',
    jobTitle: 'Senior Metrologist',
    phone: '+91 98123 45678',
    createdAt: '2026-02-01T10:30:00.000Z',
  },
]

// Sync user to Firestore in background
async function syncUserToFirestore(user: User) {
  try {
    const userRef = doc(db, 'users', user.id)
    await setDoc(userRef, {
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      active: user.active,
      laboratory: user.laboratory,
      department: user.department,
      jobTitle: user.jobTitle || 'Metrologist',
      phone: user.phone || '',
      createdAt: user.createdAt,
      lastLogin: user.lastLogin || '',
    }, { merge: true })
  } catch {
    // Graceful offline fallback
  }
}

export function getStoredUsers(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS))
      DEFAULT_USERS.forEach(syncUserToFirestore)
      return DEFAULT_USERS
    }
    const parsed = JSON.parse(raw) as User[]
    // Ensure default admin always exists
    if (!parsed.some((u) => u.email.toLowerCase() === 'admin@mapan.gov')) {
      parsed.unshift(DEFAULT_USERS[0])
      saveStoredUsers(parsed)
    }
    return parsed
  } catch {
    return DEFAULT_USERS
  }
}

export function saveStoredUsers(users: User[]) {
  try {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users))
  } catch (err) {
    console.error('Failed to save users to storage', err)
  }
}

export function getCurrentSession(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function setCurrentSession(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY)
    }
  } catch (err) {
    console.error('Failed to update session in storage', err)
  }
}

/**
 * Public User Registration
 * NOTE: Normal public sign up CANNOT create an ADMIN account.
 * All public registrations are strictly assigned 'OPERATOR' role.
 */
export function registerNewUser(
  name: string,
  email: string,
  password: string,
  jobTitle = 'Laboratory Metrologist / Verification Officer',
  laboratory = 'Central Standards Laboratory'
): { success: boolean; error?: string; user?: User } {
  const users = getStoredUsers()
  const normalizedEmail = email.toLowerCase().trim()

  if (!name.trim() || !normalizedEmail || !password) {
    return { success: false, error: 'All fields are required.' }
  }

  if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return { success: false, error: 'An account with this email address already exists.' }
  }

  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' }
  }

  // Public sign-ups are ALWAYS assigned 'OPERATOR' role (never Admin)
  const newUser: User = {
    id: `USR-${Date.now()}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: password,
    role: 'OPERATOR',
    active: true,
    laboratory,
    department: 'Testing Metrology Bay',
    jobTitle,
    phone: '',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  }

  const updated = [newUser, ...users]
  saveStoredUsers(updated)
  syncUserToFirestore(newUser)
  return { success: true, user: newUser }
}

/**
 * Admin Personnel Creation (Only called from Admin Console)
 */
export function adminCreateUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  department = 'Precision Metrology Bay',
  jobTitle = 'Testing Metrologist'
): { success: boolean; error?: string; user?: User } {
  const users = getStoredUsers()
  const normalizedEmail = email.toLowerCase().trim()

  if (!name.trim() || !normalizedEmail || !password) {
    return { success: false, error: 'Name, email, and password are required.' }
  }

  if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return { success: false, error: 'An account with this email already exists.' }
  }

  const newUser: User = {
    id: `USR-${Date.now()}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: password,
    role,
    active: true,
    laboratory: 'Central Standards Laboratory',
    department,
    jobTitle,
    phone: '',
    createdAt: new Date().toISOString(),
    lastLogin: '',
  }

  const updated = [newUser, ...users]
  saveStoredUsers(updated)
  syncUserToFirestore(newUser)
  return { success: true, user: newUser }
}

export function authenticateUser(
  email: string,
  password: string
): { success: boolean; error?: string; user?: User } {
  const users = getStoredUsers()
  const normalizedEmail = email.toLowerCase().trim()

  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail)
  if (!user) {
    return { success: false, error: 'No account found with this email address.' }
  }

  if (!user.active) {
    return { success: false, error: 'This account has been deactivated by an Administrator.' }
  }

  if (user.passwordHash !== password) {
    return { success: false, error: 'Incorrect password entered.' }
  }

  const updatedUser: User = { ...user, lastLogin: new Date().toISOString() }
  const updatedList = users.map((u) => (u.id === user.id ? updatedUser : u))
  saveStoredUsers(updatedList)
  setCurrentSession(updatedUser)
  syncUserToFirestore(updatedUser)

  return { success: true, user: updatedUser }
}

export function updateUser(
  userId: string,
  updates: Partial<Omit<User, 'id' | 'createdAt'>>
): boolean {
  const users = getStoredUsers()
  const idx = users.findIndex((u) => u.id === userId)
  if (idx === -1) return false

  users[idx] = { ...users[idx], ...updates }
  saveStoredUsers(users)
  syncUserToFirestore(users[idx])

  const current = getCurrentSession()
  if (current && current.id === userId) {
    setCurrentSession(users[idx])
  }
  return true
}

export function deleteUser(userId: string): boolean {
  const users = getStoredUsers()
  const filtered = users.filter((u) => u.id !== userId)
  if (filtered.length === users.length) return false

  saveStoredUsers(filtered)
  try {
    deleteDoc(doc(db, 'users', userId))
  } catch {
    // Offline ignore
  }
  return true
}
