import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  initializeFirestore,
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

// Firebase Configuration loaded securely from environment variables (.env)
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
}

// Initialize Firebase App safely
const isConfigured = Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('your_'))
const app = getApps().length === 0 
  ? (isConfigured ? initializeApp(firebaseConfig) : initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-mapan' })) 
  : getApp()

// Use standard HTTPS long-polling to prevent WebSocket blocking on college/mobile/proxy networks
let dbInstance
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  })
} catch {
  dbInstance = getFirestore(app)
}

export const db = dbInstance
export const auth = getAuth(app)

/**
 * Recursively removes all undefined values from objects/arrays to guarantee Firestore compatibility.
 */
export function sanitizeForFirestore<T>(val: T): T {
  if (val === null || val === undefined) {
    return null as unknown as T
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForFirestore(item)) as unknown as T
  }
  if (typeof val === 'object' && !(val instanceof Date)) {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeForFirestore(v)
      }
    }
    return cleaned as T
  }
  return val
}

/**
 * Executes a promise with an automatic timeout fallback to ensure UI resilience.
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 8000, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[Firestore] Operation reached timeout threshold (${ms}ms)`)
      resolve(fallback)
    }, ms)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timer!)
    return result
  } catch (err) {
    clearTimeout(timer!)
    console.error(`[Firestore] Operation encountered error:`, err)
    return fallback
  }
}

export { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy }


