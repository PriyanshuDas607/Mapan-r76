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

// Firebase Configuration from Environment Variables (.env)
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
export const db = getFirestore(app)
export const auth = getAuth(app)

export { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy }
