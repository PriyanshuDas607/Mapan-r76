import { initializeApp, getApps, getApp } from 'firebase/app'
import {
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
export const db = getFirestore(app)
export const auth = getAuth(app)

/**
 * Executes a promise with an automatic timeout fallback to ensure the UI never hangs.
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 2500, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timer!)
    return result
  } catch (err) {
    clearTimeout(timer!)
    console.warn(`Firestore operation timed out or failed (${ms}ms), using local fallback:`, err)
    return fallback
  }
}

export { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy }

