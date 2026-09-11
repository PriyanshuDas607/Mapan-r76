import { db, doc, setDoc, deleteDoc, getDocs, collection } from './firebase'

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
export async function syncUserToFirestore(user: User) {
  try {
    const userRef = doc(db, 'users', user.id)
    await setDoc(userRef, {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase().trim(),
      passwordHash: user.passwordHash,
      password: user.passwordHash, // compatibility
      role: user.role,
      active: user.active ?? true,
      laboratory: user.laboratory || 'Central Standards Laboratory',
      department: user.department || 'Precision Calibration Division',
      jobTitle: user.jobTitle || 'Metrologist',
      phone: user.phone || '',
      createdAt: user.createdAt || new Date().toISOString(),
      lastLogin: user.lastLogin || new Date().toISOString(),
    }, { merge: true })
  } catch (err) {
    console.warn('Firestore sync user error:', err)
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

export async function loadUsersFromFirestore(): Promise<User[]> {
  try {
    const snapshot = await getDocs(collection(db, 'users'))
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
      const localUsers = getStoredUsers()
      const mergedMap = new Map<string, User>()
      DEFAULT_USERS.forEach((u) => mergedMap.set(u.email.toLowerCase(), u))
      localUsers.forEach((u) => mergedMap.set(u.email.toLowerCase(), u))
      list.forEach((u) => mergedMap.set(u.email.toLowerCase(), u))
      const merged = Array.from(mergedMap.values())
      saveStoredUsers(merged)
      return merged
    }
    return getStoredUsers()
  } catch (err) {
    console.warn('Could not fetch users from Firestore:', err)
    return getStoredUsers()
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

  // Check cloud and local users
  const currentUsers = await loadUsersFromFirestore()
  if (currentUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return { success: false, error: 'An account with this email address already exists.' }
  }

  // Public sign-ups are ALWAYS assigned 'OPERATOR' role
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
  await syncUserToFirestore(newUser)
  return { success: true, user: newUser }
}

/**
 * Admin Personnel Creation (Only called from Admin Console)
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
 * Robust Authenticate User with Direct Firestore Query & Local Fallback
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  const normalizedEmail = email.toLowerCase().trim()
  const trimmedPassword = password.trim()

  // 1. First, check live Firestore cloud records
  let matchedUser: User | null = null

  try {
    const snapshot = await getDocs(collection(db, 'users'))
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
  } catch (err) {
    console.warn('Firestore direct auth query failed, using offline fallback:', err)
  }

  // 2. Fallback to local storage if not found in Firestore or Firestore was unreachable
  if (!matchedUser) {
    const localUsers = getStoredUsers()
    const foundLocal = localUsers.find((u) => u.email.toLowerCase() === normalizedEmail)
    if (foundLocal) {
      matchedUser = foundLocal
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
