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

// Firebase Configuration with resilient fallback for deployed environments
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCK8wPzbMx1lkr9BsKZgoIkDa1pQeVWO1Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mapan-1013c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mapan-1013c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mapan-1013c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "268395097740",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:268395097740:web:93d3240312e67a6fdd95a9",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-84Q7",
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


