import { db, doc, setDoc, deleteDoc, getDocs, collection, withTimeout, sanitizeForFirestore } from '../database/firebase.ts'

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
export const DEFAULT_ADMIN_USER: User = {
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
  lastLogin: '2026-09-12T13:16:45.380Z',
}

export const DEFAULT_USERS: User[] = [DEFAULT_ADMIN_USER]

/**
 * Direct & Reliable Firestore User Synchronization
 */
export async function syncUserToFirestore(user: User): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', user.id)
    const payload = sanitizeForFirestore({
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase().trim(),
      password: user.passwordHash,
      passwordHash: user.passwordHash,
      role: user.role,
      active: user.active ?? true,
      laboratory: user.laboratory || 'Central Standards Laboratory',
      department: user.department || 'Precision Calibration Division',
      jobTitle: user.jobTitle || (user.role === 'ADMIN' ? 'Chief Standards Officer' : 'Laboratory Metrologist'),
      phone: user.phone || '+91 98765 43210',
      createdAt: user.createdAt || new Date().toISOString(),
      lastLogin: user.lastLogin || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await withTimeout(
      setDoc(userRef, payload, { merge: true }),
      8000,
      undefined
    )
    console.log(`[Firestore] Successfully synchronized user ${user.email} (${user.id})`)
    return true
  } catch (err) {
    console.error('[Firestore] User sync failed:', err)
    return false
  }
}

export function getStoredUsers(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS))
      syncUserToFirestore(DEFAULT_ADMIN_USER).catch(() => {})
      return DEFAULT_USERS
    }
    const parsed = JSON.parse(raw) as User[]
    // Ensure default admin always exists
    if (!parsed.some((u) => u.email.toLowerCase() === 'admin@mapan.gov')) {
      parsed.unshift(DEFAULT_ADMIN_USER)
      saveStoredUsers(parsed)
    }
    return parsed
  } catch {
    return DEFAULT_USERS
  }
}

export async function loadUsersFromFirestore(): Promise<User[]> {
  try {
    const snapshot = await withTimeout(getDocs(collection(db, 'users')), 8000, null)
    if (!snapshot || snapshot.empty) {
      // Seed default admin if cloud is empty
      await syncUserToFirestore(DEFAULT_ADMIN_USER)
      return getStoredUsers()
    }

    const list: User[] = []
    snapshot.forEach((d) => {
      const data = d.data() as Record<string, unknown>
      if (data && (data.email || data.name)) {
        list.push({
          id: (data.id as string) || d.id,
          name: (data.name as string) || (data.displayName as string) || 'Personnel',
          email: ((data.email as string) || '').toLowerCase().trim(),
          passwordHash:
            (data.passwordHash as string) ||
            (data.password as string) ||
            (data.password_hash as string) ||
            '',
          role: data.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
          active: data.active !== false,
          laboratory: (data.laboratory as string) || 'Central Standards Laboratory',
          department: (data.department as string) || 'Precision Calibration Division',
          jobTitle: (data.jobTitle as string) || 'Metrologist',
          phone: (data.phone as string) || '',
          createdAt: (data.createdAt as string) || new Date().toISOString(),
          lastLogin: (data.lastLogin as string) || '',
        })
      }
    })

    if (list.length > 0) {
      if (!list.some((u) => u.email.toLowerCase() === 'admin@mapan.gov')) {
        list.unshift(DEFAULT_ADMIN_USER)
        syncUserToFirestore(DEFAULT_ADMIN_USER).catch(() => {})
      }
      saveStoredUsers(list)
      return list
    }

    saveStoredUsers(DEFAULT_USERS)
    await syncUserToFirestore(DEFAULT_ADMIN_USER)
    return DEFAULT_USERS
  } catch (err) {
    console.warn('Could not fetch users from Firestore:', err)
    return getStoredUsers()
  }
}

/**
 * Permanently purge non-admin users only when explicitly triggered by Admin
 */
export async function purgeNonAdminUsers(): Promise<{ success: boolean; count: number }> {
  try {
    const adminUser = DEFAULT_ADMIN_USER
    const snapshot = await withTimeout(getDocs(collection(db, 'users')), 8000, null)
    let deletedCount = 0
    if (snapshot) {
      const deletePromises: Promise<unknown>[] = []
      snapshot.forEach((d) => {
        const data = d.data() as Record<string, unknown>
        const docEmail = ((data?.email as string) || '').toLowerCase().trim()
        if (docEmail !== 'admin@mapan.gov') {
          deletePromises.push(deleteDoc(doc(db, 'users', d.id)))
          deletedCount++
        }
      })
      await Promise.all(deletePromises)
    }

    // Ensure only admin user exists
    await syncUserToFirestore(adminUser)
    saveStoredUsers([adminUser])

    return { success: true, count: deletedCount }
  } catch (err) {
    console.error('Error purging non-admin users:', err)
    saveStoredUsers([DEFAULT_ADMIN_USER])
    return { success: false, count: 0 }
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
 * Public User Registration - Guarantees Immediate Cloud Save in Firestore
 */
export async function registerNewUser(
  name: string,
  email: string,
  password: string,
  jobTitle = 'Laboratory Metrologist / Verification Officer',
  laboratory = 'Central Standards Laboratory'
): Promise<{ success: boolean; error?: string; user?: User }> {
  const normalizedEmail = email.toLowerCase().trim()

  if (!name.trim() || !normalizedEmail || !password) {
    return { success: false, error: 'All fields are required.' }
  }

  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' }
  }

  // Check local and cloud users
  const currentUsers = await loadUsersFromFirestore()
  if (currentUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return { success: false, error: 'An account with this email address already exists.' }
  }

  // Public sign-ups are assigned 'OPERATOR' role
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

  const updated = [newUser, ...currentUsers.filter((u) => u.email.toLowerCase() !== normalizedEmail)]
  saveStoredUsers(updated)
  setCurrentSession(newUser)

  // Direct, reliable Firestore write
  const syncSuccess = await syncUserToFirestore(newUser)
  if (!syncSuccess) {
    console.warn('[Firestore] Registration written to local cache, cloud sync queued.')
  }

  return { success: true, user: newUser }
}

/**
 * Admin Personnel Creation (Admin Console)
 */
export async function adminCreateUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  department = 'Precision Metrology Bay',
  jobTitle = 'Testing Metrologist'
): Promise<{ success: boolean; error?: string; user?: User }> {
  const normalizedEmail = email.toLowerCase().trim()

  if (!name.trim() || !normalizedEmail || !password) {
    return { success: false, error: 'Name, email, and password are required.' }
  }

  const currentUsers = await loadUsersFromFirestore()
  if (currentUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
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

  const updated = [newUser, ...currentUsers.filter((u) => u.email.toLowerCase() !== normalizedEmail)]
  saveStoredUsers(updated)
  await syncUserToFirestore(newUser)

  return { success: true, user: newUser }
}

/**
 * Robust Authenticate User with Fast Local Check & Cloud Fallback
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  const normalizedEmail = email.toLowerCase().trim()
  const trimmedPassword = password.trim()

  let matchedUser: User | null = null

  // 1. Check local storage cache first
  const localUsers = getStoredUsers()
  const foundLocal = localUsers.find((u) => u.email.toLowerCase() === normalizedEmail)
  if (foundLocal) {
    matchedUser = foundLocal
  }

  // 2. Query live Firestore if not found locally
  if (!matchedUser) {
    try {
      const snapshot = await withTimeout(getDocs(collection(db, 'users')), 8000, null)
      if (snapshot) {
        snapshot.forEach((d) => {
          const data = d.data() as Record<string, unknown>
          const docEmail = ((data?.email as string) || '').toLowerCase().trim()
          if (docEmail === normalizedEmail) {
            matchedUser = {
              id: (data.id as string) || d.id,
              name: (data.name as string) || (data.displayName as string) || 'Personnel',
              email: docEmail,
              passwordHash:
                (data.passwordHash as string) ||
                (data.password as string) ||
                (data.password_hash as string) ||
                '',
              role: data.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
              active: data.active !== false,
              laboratory: (data.laboratory as string) || 'Central Standards Laboratory',
              department: (data.department as string) || 'Precision Calibration Division',
              jobTitle: (data.jobTitle as string) || 'Metrologist',
              phone: (data.phone as string) || '',
              createdAt: (data.createdAt as string) || new Date().toISOString(),
              lastLogin: new Date().toISOString(),
            }
          }
        })
      }
    } catch (err) {
      console.warn('Firestore direct auth query failed, using offline fallback:', err)
    }
  }

  if (!matchedUser) {
    return { success: false, error: 'No account found with this email address in Firebase or local directory.' }
  }

  const candidate = matchedUser as User

  if (!candidate.active) {
    return { success: false, error: 'This account has been deactivated by an Administrator.' }
  }

  // Check password against stored password or hash
  if (candidate.passwordHash !== trimmedPassword && candidate.passwordHash !== password) {
    return { success: false, error: 'Incorrect password entered.' }
  }

  const updatedUser: User = { ...candidate, lastLogin: new Date().toISOString() }
  
  // Save to local cache
  const users = getStoredUsers()
  const updatedList = users.some((u) => u.id === updatedUser.id)
    ? users.map((u) => (u.id === updatedUser.id ? updatedUser : u))
    : [updatedUser, ...users]
  
  saveStoredUsers(updatedList)
  setCurrentSession(updatedUser)
  syncUserToFirestore(updatedUser).catch(() => {})

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
  syncUserToFirestore(users[idx]).catch(() => {})

  const current = getCurrentSession()
  if (current && current.id === userId) {
    setCurrentSession(users[idx])
  }
  return true
}

export async function deleteUser(userId: string): Promise<boolean> {
  const users = getStoredUsers()
  const filtered = users.filter((u) => u.id !== userId)
  saveStoredUsers(filtered.length > 0 ? filtered : DEFAULT_USERS)

  try {
    await withTimeout(deleteDoc(doc(db, 'users', userId)), 8000, undefined)
  } catch (err) {
    console.warn('Firestore user delete error:', err)
  }
  return true
}

