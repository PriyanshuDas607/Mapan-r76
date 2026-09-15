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
import {
  getDatabase,
  ref,
  set,
  get,
  child,
  remove,
  update,
  onValue,
  Database,
} from 'firebase/database'
import { getAuth } from 'firebase/auth'

// Firebase Configuration with universal fallback for production deployments (e.g. Vercel)
export const firebaseConfig = {
  apiKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) || "AIzaSyCK8wPzbMx1lkr9BsKZgoIkDa1pQeVWO1Q",
  authDomain: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) || "mapan-1013c.firebaseapp.com",
  databaseURL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_DATABASE_URL) || "https://mapan-1013c-default-rtdb.firebaseio.com",
  projectId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID) || "mapan-1013c",
  storageBucket: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) || "mapan-1013c.firebasestorage.app",
  messagingSenderId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) || "268395097740",
  appId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_ID) || "1:268395097740:web:93d3240312e67a6fdd95a9",
  measurementId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID) || "G-2V9Z9E8N00",
}

// Initialize Firebase App safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

// Use standard HTTPS long-polling to prevent WebSocket blocking on college/mobile/proxy networks
let dbInstance
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  })
} catch {
  dbInstance = getFirestore(app)
}

// Initialize Firebase Realtime Database
let rtdbInstance: Database
try {
  rtdbInstance = getDatabase(app, firebaseConfig.databaseURL)
} catch {
  rtdbInstance = getDatabase(app)
}

export const db = dbInstance
export const rtdb = rtdbInstance
export const auth = getAuth(app)

/**
 * Recursively removes all undefined values from objects/arrays to guarantee Firebase compatibility.
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

export const sanitizeForDatabase = sanitizeForFirestore

/**
 * Executes a promise with an automatic timeout fallback to ensure UI resilience.
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 8000, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[Firebase] Operation reached timeout threshold (${ms}ms)`)
      resolve(fallback)
    }, ms)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timer!)
    return result
  } catch (err) {
    clearTimeout(timer!)
    console.error(`[Firebase] Operation encountered error:`, err)
    return fallback
  }
}

// Direct REST API helpers for Firebase Realtime Database (100% reliable across all browsers & networks)
const RTDB_BASE = (firebaseConfig.databaseURL || 'https://mapan-1013c-default-rtdb.firebaseio.com').replace(/\/$/, '')

export async function rtdbRestPut(path: string, data: unknown): Promise<boolean> {
  try {
    const cleanPath = path.replace(/^\//, '')
    const res = await fetch(`${RTDB_BASE}/${cleanPath}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.ok
  } catch (err) {
    console.warn(`[RTDB REST PUT] ${path} failed:`, err)
    return false
  }
}

export async function rtdbRestGet<T = unknown>(path: string): Promise<T | null> {
  try {
    const cleanPath = path.replace(/^\//, '')
    const res = await fetch(`${RTDB_BASE}/${cleanPath}.json`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[RTDB REST GET] ${path} failed:`, err)
    return null
  }
}

export async function rtdbRestDelete(path: string): Promise<boolean> {
  try {
    const cleanPath = path.replace(/^\//, '')
    const res = await fetch(`${RTDB_BASE}/${cleanPath}.json`, {
      method: 'DELETE',
    })
    return res.ok
  } catch (err) {
    console.warn(`[RTDB REST DELETE] ${path} failed:`, err)
    return false
  }
}

/**
 * Test Firebase Realtime Database connectivity from this browser.
 */
export async function testFirebaseConnection(): Promise<boolean> {
  try {
    const res = await rtdbRestGet<Record<string, unknown>>('users')
    if (res !== null) {
      console.log('[Firebase] ✅ Realtime Database REST verified')
      return true
    }
    return false
  } catch {
    return false
  }
}

// Auto-test connection on app startup (non-blocking)
testFirebaseConnection().catch(() => {})

export {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  ref,
  set,
  get,
  child,
  remove,
  update,
  onValue,
}

