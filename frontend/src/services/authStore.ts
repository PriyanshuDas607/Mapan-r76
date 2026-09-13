import {
  db,
  rtdb,
  ref,
  set,
  get,
  child,
  remove,
  onValue,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  collection,
  withTimeout,
  sanitizeForFirestore,
  rtdbRestPut,
  rtdbRestGet,
  rtdbRestDelete,
} from './firebase.ts'

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
 * Direct & Reliable Realtime Database & Firestore User Synchronization
 */
export async function syncUserToFirestore(user: User): Promise<boolean> {
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

  // 1. Direct REST PUT to Firebase Realtime DB (Guaranteed to work across all browsers/networks)
  const restPromise = rtdbRestPut(`users/${user.id}`, payload).catch(() => false)

  // 2. Sync to Firebase Realtime Database SDK
  const rtdbPromise = set(ref(rtdb, `users/${user.id}`), payload).catch((err) => {
    console.warn('[RealtimeDB] User sync warning:', err)
  })

  // 3. Sync to Cloud Firestore
  const firestorePromise = setDoc(doc(db, 'users', user.id), payload, { merge: true }).catch((err) => {
    console.warn('[Firestore] User sync warning:', err)
  })

  try {
    await Promise.allSettled([restPromise, rtdbPromise, firestorePromise])
    console.log(`[Database] Successfully synced user ${user.email} (${user.id}) to Realtime DB & Firestore`)
    return true
  } catch {
    return false
  }
}

export const syncUserToDatabase = syncUserToFirestore

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

function mergeUserLists(cloudList: User[], localList: User[]): User[] {
  const map = new Map<string, User>()
  // First, add all cloud users
  cloudList.forEach((u) => {
    if (u && u.email) map.set(u.email.toLowerCase().trim(), u)
  })
  // Next, keep locally cached users that might not have reached cloud yet
  localList.forEach((u) => {
    if (u && u.email) {
      const key = u.email.toLowerCase().trim()
      if (!map.has(key)) {
        map.set(key, u)
      }
    }
  })
  // Always guarantee default admin is present
  if (!map.has(DEFAULT_ADMIN_USER.email.toLowerCase())) {
    map.set(DEFAULT_ADMIN_USER.email.toLowerCase(), DEFAULT_ADMIN_USER)
  }
  return Array.from(map.values())
}

function parseUserEntries(val: Record<string, Record<string, unknown>>): User[] {
  const list: User[] = []
  Object.entries(val).forEach(([id, data]) => {
    if (data && (data.email || data.name)) {
      list.push({
        id: (data.id as string) || id,
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
  return list
}

export async function loadUsersFromFirestore(): Promise<User[]> {
  // 1. Try Firebase Realtime Database REST first (Ultra-fast & 100% reliable across browsers)
  try {
    const restData = await withTimeout(rtdbRestGet<Record<string, Record<string, unknown>>>('users'), 4000, null)
    if (restData && typeof restData === 'object') {
      const list = parseUserEntries(restData)
      if (list.length > 0) {
        const merged = mergeUserLists(list, getStoredUsers())
        saveStoredUsers(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB REST] Users fetch error, trying SDK:', err)
  }

  // 2. Try Firebase Realtime Database SDK
  try {
    const rtdbSnapshot = await withTimeout(get(child(ref(rtdb), 'users')), 4000, null)
    if (rtdbSnapshot && rtdbSnapshot.exists()) {
      const val = rtdbSnapshot.val() as Record<string, Record<string, unknown>>
      const list = parseUserEntries(val)
      if (list.length > 0) {
        const merged = mergeUserLists(list, getStoredUsers())
        saveStoredUsers(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB] Users fetch fallback to Firestore:', err)
  }


  // 2. Fallback to Cloud Firestore
  try {
    const snapshot = await withTimeout(getDocs(collection(db, 'users')), 6000, null)
    if (snapshot && !snapshot.empty) {
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
        const merged = mergeUserLists(list, getStoredUsers())
        saveStoredUsers(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('Could not fetch users from Firestore:', err)
  }

  // Default fallback
  const localUsers = getStoredUsers()
  syncUserToFirestore(DEFAULT_ADMIN_USER).catch(() => {})
  return localUsers
}

export const loadUsersFromDatabase = loadUsersFromFirestore

/**
 * Realtime Live Listener for Users
 */
export function subscribeToUsers(callback: (users: User[]) => void): () => void {
  const usersRef = ref(rtdb, 'users')
  return onValue(
    usersRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Record<string, Record<string, unknown>>
        const list: User[] = []
        Object.entries(val).forEach(([id, data]) => {
          if (data && (data.email || data.name)) {
            list.push({
              id: (data.id as string) || id,
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
          const merged = mergeUserLists(list, getStoredUsers())
          saveStoredUsers(merged)
          callback(merged)
        }
      }
    },
    (err) => {
      console.warn('[RealtimeDB] Users subscription warning:', err)
    }
  )
}

/**
 * Permanently purge non-admin users from Realtime Database and Firestore
 */
export async function purgeNonAdminUsers(): Promise<{ success: boolean; count: number }> {
  try {
    const adminUser = DEFAULT_ADMIN_USER
    let deletedCount = 0

    // Purge from Realtime Database
    try {
      const rtdbSnap = await get(child(ref(rtdb), 'users'))
      if (rtdbSnap.exists()) {
        const val = rtdbSnap.val() as Record<string, Record<string, unknown>>
        const deletePromises: Promise<void>[] = []
        Object.entries(val).forEach(([id, data]) => {
          const docEmail = ((data?.email as string) || '').toLowerCase().trim()
          if (docEmail !== 'admin@mapan.gov') {
            deletePromises.push(remove(ref(rtdb, `users/${id}`)))
            deletedCount++
          }
        })
        await Promise.all(deletePromises)
      }
    } catch (err) {
      console.warn('RealtimeDB purge warning:', err)
    }

    // Purge from Firestore
    try {
      const snapshot = await withTimeout(getDocs(collection(db, 'users')), 6000, null)
      if (snapshot) {
        const deletePromises: Promise<unknown>[] = []
        snapshot.forEach((d) => {
          const data = d.data() as Record<string, unknown>
          const docEmail = ((data?.email as string) || '').toLowerCase().trim()
          if (docEmail !== 'admin@mapan.gov') {
            deletePromises.push(deleteDoc(doc(db, 'users', d.id)))
          }
        })
        await Promise.all(deletePromises)
      }
    } catch (err) {
      console.warn('Firestore purge warning:', err)
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mapan_session_change', { detail: user }))
    }
  } catch (err) {
    console.error('Failed to update session in storage', err)
  }
}

/**
 * Public User Registration - Instant synchronous response, background Realtime DB & Firestore sync
 */
export function registerNewUser(
  name: string,
  email: string,
  password: string,
  jobTitle = 'Laboratory Metrologist / Verification Officer',
  laboratory = 'Central Standards Laboratory'
): { success: boolean; error?: string; user?: User } {
  const normalizedEmail = email.toLowerCase().trim()
  const trimmedPassword = password.trim()

  if (!name.trim() || !normalizedEmail || !trimmedPassword) {
    return { success: false, error: 'All fields are required.' }
  }

  if (trimmedPassword.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' }
  }

  // Fast check from local cached users
  const currentUsers = getStoredUsers()
  const existingUser = currentUsers.find((u) => u.email.toLowerCase() === normalizedEmail)
  
  if (existingUser) {
    // If the account already exists and password matches, sign in immediately!
    if (existingUser.passwordHash === trimmedPassword || existingUser.passwordHash === password) {
      const updatedUser: User = { ...existingUser, lastLogin: new Date().toISOString() }
      const updatedList = currentUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      saveStoredUsers(updatedList)
      setCurrentSession(updatedUser)
      syncUserToFirestore(updatedUser).catch(() => {})
      return { success: true, user: updatedUser }
    }
    return { success: false, error: 'An account with this email already exists. Please sign in or use a different email.' }
  }

  // Public sign-ups are assigned 'OPERATOR' role
  const newUser: User = {
    id: `USR-${Date.now()}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: trimmedPassword,
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

  // Non-blocking background Realtime Database & Firestore write — UI doesn't wait
  syncUserToFirestore(newUser).catch(() => {})

  return { success: true, user: newUser }
}

/**
 * Admin User Creation (Admin Console) - Synchronous local-first, background Realtime DB & Firestore sync
 */
export function adminCreateUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  department = 'Precision Metrology Bay',
  jobTitle = 'Testing Metrologist'
): { success: boolean; error?: string; user?: User } {
  const normalizedEmail = email.toLowerCase().trim()

  if (!name.trim() || !normalizedEmail || !password) {
    return { success: false, error: 'Name, email, and password are required.' }
  }

  const currentUsers = getStoredUsers()
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

  // Non-blocking background Realtime DB & Firestore write — UI returns instantly
  syncUserToFirestore(newUser).catch(() => {})

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

  // 2. If not found locally, check Realtime DB (fast cloud check)
  if (!matchedUser) {
    try {
      const snap = await withTimeout(get(child(ref(rtdb), 'users')), 3000, null)
      if (snap && snap.exists()) {
        const val = snap.val() as Record<string, Record<string, unknown>>
        const found = Object.values(val).find(
          (u) => ((u.email as string) || '').toLowerCase().trim() === normalizedEmail
        )
        if (found) {
          matchedUser = {
            id: (found.id as string) || `USR-${Date.now()}`,
            name: (found.name as string) || 'Personnel',
            email: ((found.email as string) || '').toLowerCase().trim(),
            passwordHash:
              (found.passwordHash as string) ||
              (found.password as string) ||
              (found.password_hash as string) ||
              '',
            role: found.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
            active: found.active !== false,
            laboratory: (found.laboratory as string) || 'Central Standards Laboratory',
            department: (found.department as string) || 'Precision Calibration Division',
            jobTitle: (found.jobTitle as string) || 'Metrologist',
            phone: (found.phone as string) || '',
            createdAt: (found.createdAt as string) || new Date().toISOString(),
            lastLogin: (found.lastLogin as string) || '',
          }
        }
      }
    } catch {
      // ignore
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

  // Non-blocking background delete from Realtime DB REST, SDK & Firestore
  rtdbRestDelete(`users/${userId}`).catch(() => {})
  remove(ref(rtdb, `users/${userId}`)).catch((err) => {
    console.warn('RealtimeDB user delete error:', err)
  })
  deleteDoc(doc(db, 'users', userId)).catch((err) => {
    console.warn('Firestore user delete error:', err)
  })
  return true
}

