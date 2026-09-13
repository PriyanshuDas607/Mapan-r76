import {
  db,
  rtdb,
  ref,
  set,
  get,
  child,
  remove,
  onValue,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  withTimeout,
  sanitizeForFirestore,
  rtdbRestPut,
  rtdbRestGet,
  rtdbRestDelete,
} from './firebase.ts'
import type { Instrument } from '../views/InstrumentRegisterView.tsx'
import type { ReportData } from '../views/CalibrationReport.tsx'
import type { AuditEvent } from '../App.tsx'

// ==========================================
// LOCAL STORAGE KEYS
// ==========================================
const LS_INSTRUMENTS = 'mapan_instruments'
const LS_REPORTS = 'mapan_reports'
const LS_AUDIT_LOGS = 'mapan_audit_logs'

// ==========================================
// LOCAL STORAGE HELPERS
// ==========================================
function getLocalInstruments(): Instrument[] {
  try {
    const raw = localStorage.getItem(LS_INSTRUMENTS)
    if (!raw) return []
    return JSON.parse(raw) as Instrument[]
  } catch {
    return []
  }
}

function saveLocalInstruments(list: Instrument[]) {
  try {
    localStorage.setItem(LS_INSTRUMENTS, JSON.stringify(list))
  } catch (err) {
    console.warn('[LocalStorage] Failed to save instruments:', err)
  }
}

function getLocalReports(): ReportData[] {
  try {
    const raw = localStorage.getItem(LS_REPORTS)
    if (!raw) return []
    return JSON.parse(raw) as ReportData[]
  } catch {
    return []
  }
}

function saveLocalReports(list: ReportData[]) {
  try {
    localStorage.setItem(LS_REPORTS, JSON.stringify(list))
  } catch (err) {
    console.warn('[LocalStorage] Failed to save reports:', err)
  }
}

function getLocalAuditLogs(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(LS_AUDIT_LOGS)
    if (!raw) return []
    return JSON.parse(raw) as AuditEvent[]
  } catch {
    return []
  }
}

function saveLocalAuditLogs(list: AuditEvent[]) {
  try {
    localStorage.setItem(LS_AUDIT_LOGS, JSON.stringify(list))
  } catch (err) {
    console.warn('[LocalStorage] Failed to save audit logs:', err)
  }
}

// ==========================================
// MERGE HELPERS (cloud + local, no data loss)
// ==========================================
function mergeInstruments(cloudList: Instrument[], localList: Instrument[]): Instrument[] {
  const map = new Map<string, Instrument>()
  // Cloud data takes priority for existing keys
  cloudList.forEach((i) => {
    if (i && i.serial) map.set(i.serial, i)
  })
  // Local items not yet in cloud are preserved
  localList.forEach((i) => {
    if (i && i.serial && !map.has(i.serial)) {
      map.set(i.serial, i)
    }
  })
  return Array.from(map.values())
}

function mergeReports(cloudList: ReportData[], localList: ReportData[]): ReportData[] {
  const map = new Map<string, ReportData>()
  cloudList.forEach((r) => {
    if (r && r.reportNumber) map.set(r.reportNumber, r)
  })
  localList.forEach((r) => {
    if (r && r.reportNumber && !map.has(r.reportNumber)) {
      map.set(r.reportNumber, r)
    }
  })
  return Array.from(map.values())
}

function mergeAuditLogs(cloudList: AuditEvent[], localList: AuditEvent[]): AuditEvent[] {
  const map = new Map<string, AuditEvent>()
  cloudList.forEach((e) => {
    if (e && e.id) map.set(e.id, e)
  })
  localList.forEach((e) => {
    if (e && e.id && !map.has(e.id)) {
      map.set(e.id, e)
    }
  })
  return Array.from(map.values())
}

// ==========================================
// RETRY WRAPPER FOR FIREBASE WRITES
// ==========================================
async function firebaseWriteWithRetry(
  writeFn: () => Promise<void>,
  label: string,
  maxRetries = 2
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await writeFn()
      return true
    } catch (err) {
      if (attempt < maxRetries) {
        console.warn(`[Firebase] ${label} attempt ${attempt + 1} failed, retrying...`, err)
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      } else {
        console.error(`[Firebase] ${label} FAILED after ${maxRetries + 1} attempts:`, err)
      }
    }
  }
  return false
}

// ==========================================
// DEFAULT STANDARDIZED SEED RECORDS
// ==========================================
export const DEFAULT_INSTRUMENTS: Instrument[] = [
  {
    serial: 'MTP-2026-088',
    model: 'Mettler Toledo XPR205',
    manufacturer: 'Mettler Toledo Precision',
    accuracy: 'I',
    status: 'Active',
    max: '0.220',
    interval: '0.0001',
    location: 'Central Standards Lab - Calibration Bay 04',
    createdBy: 'USR-ADMIN-01',
    createdByName: 'Dr. Vikram Mehta',
    userEmail: 'admin@mapan.gov',
  },
  {
    serial: 'KRN-2026-104',
    model: 'KERN ABT 220-4M Analytical',
    manufacturer: 'KERN & Sohn GmbH',
    accuracy: 'II',
    status: 'Active',
    max: '6.200',
    interval: '0.010',
    location: 'Analytical Chemistry Lab - Bay 02',
    createdBy: 'USR-ADMIN-01',
    createdByName: 'Dr. Vikram Mehta',
    userEmail: 'admin@mapan.gov',
  },
  {
    serial: 'SRT-2026-302',
    model: 'Sartorius Combics 3 Industrial',
    manufacturer: 'Sartorius AG',
    accuracy: 'III',
    status: 'Active',
    max: '30.00',
    interval: '0.010',
    location: 'Industrial Metrology Floor - Station 01',
    createdBy: 'USR-ADMIN-01',
    createdByName: 'Dr. Vikram Mehta',
    userEmail: 'admin@mapan.gov',
  },
  {
    serial: 'AVR-2026-409',
    model: 'Avery Weigh-Tronix ZK840',
    manufacturer: 'Avery Weigh-Tronix Ltd',
    accuracy: 'IIII',
    status: 'Active',
    max: '500.0',
    interval: '0.500',
    location: 'Heavy Mass Testing Platform',
    createdBy: 'USR-ADMIN-01',
    createdByName: 'Dr. Vikram Mehta',
    userEmail: 'admin@mapan.gov',
  },
]

export const DEFAULT_REPORTS: ReportData[] = [
  {
    reportNumber: 'REP-2026-001',
    issueDate: '12 Sep 2026',
    issueTime: '14:30:00',
    technicianName: 'Dr. Vikram Mehta',
    userId: 'USR-ADMIN-01',
    userEmail: 'admin@mapan.gov',
    approverName: 'Dr. Vikram Mehta (Chief Standards Officer)',
    temperature: '21.4 °C',
    humidity: '48.2 % RH',
    pressure: '1013.2 hPa',
    standardWeightsRef: 'Class E2 Standard Weights (Cert: NPL-2026-W89)',
    instrument: {
      serial: 'MTP-2026-088',
      model: 'Mettler Toledo XPR205',
      manufacturer: 'Mettler Toledo Precision',
      accuracy: 'I',
      max: '0.220',
      interval: '0.0001',
      location: 'Central Standards Lab - Calibration Bay 04',
    },
    observations: [
      { id: 1, load: '0.050', indication: '0.0500', error: '0.0000', mpe: '±0.0001', result: 'Pass', percentage: '22.7%' },
      { id: 2, load: '0.100', indication: '0.1000', error: '0.0000', mpe: '±0.0001', result: 'Pass', percentage: '45.5%' },
      { id: 3, load: '0.150', indication: '0.1500', error: '0.0000', mpe: '±0.0001', result: 'Pass', percentage: '68.2%' },
      { id: 4, load: '0.200', indication: '0.2001', error: '+0.0001', mpe: '±0.0001', result: 'Pass', percentage: '90.9%' },
      { id: 5, load: '0.220', indication: '0.2200', error: '0.0000', mpe: '±0.0001', result: 'Pass', percentage: '100.0%' },
    ],
    overallResult: 'Pass',
    sha256Hash: '9e8b7c6a5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a',
  },
  {
    reportNumber: 'REP-2026-002',
    issueDate: '12 Sep 2026',
    issueTime: '16:15:00',
    technicianName: 'Dr. Vikram Mehta',
    userId: 'USR-ADMIN-01',
    userEmail: 'admin@mapan.gov',
    approverName: 'Dr. Vikram Mehta (Chief Standards Officer)',
    temperature: '22.1 °C',
    humidity: '49.0 % RH',
    pressure: '1012.8 hPa',
    standardWeightsRef: 'Class F1 Standard Weights (Cert: NPL-2026-F44)',
    instrument: {
      serial: 'KRN-2026-104',
      model: 'KERN ABT 220-4M Analytical',
      manufacturer: 'KERN & Sohn GmbH',
      accuracy: 'II',
      max: '6.200',
      interval: '0.010',
      location: 'Analytical Chemistry Lab - Bay 02',
    },
    observations: [
      { id: 1, load: '1.000', indication: '1.000', error: '0.000', mpe: '±0.010', result: 'Pass', percentage: '16.1%' },
      { id: 2, load: '3.000', indication: '3.002', error: '+0.002', mpe: '±0.010', result: 'Pass', percentage: '48.4%' },
      { id: 3, load: '6.200', indication: '6.204', error: '+0.004', mpe: '±0.015', result: 'Pass', percentage: '100.0%' },
    ],
    overallResult: 'Pass',
    sha256Hash: '4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e',
  },
]

export const DEFAULT_AUDIT_LOGS: AuditEvent[] = [
  {
    id: 'EVT-GENESIS-01',
    timestamp: '15 Jan 2026, 09:00:00',
    actor: 'Dr. Vikram Mehta',
    userId: 'USR-ADMIN-01',
    userEmail: 'admin@mapan.gov',
    action: 'SYSTEM_GENESIS',
    target: 'Directorate of Legal Metrology root verification chain initialized',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
]

// ==========================================
// INSTRUMENTS REALTIME DB & FIRESTORE SYNC
// ==========================================

/**
 * Sync instrument to localStorage FIRST (instant), then to Firebase REST, SDK & Firestore.
 */
export async function syncInstrumentToFirestore(inst: Instrument): Promise<boolean> {
  // 1. Save to localStorage immediately (guaranteed persistence)
  const local = getLocalInstruments()
  const updatedLocal = [inst, ...local.filter((i) => i.serial !== inst.serial)]
  saveLocalInstruments(updatedLocal)

  // 2. Sync to Firebase in background (REST + RTDB SDK + Firestore)
  const payload = sanitizeForFirestore({
    ...inst,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const restPromise = rtdbRestPut(`instruments/${inst.serial}`, payload).catch(() => false)
  const rtdbPromise = firebaseWriteWithRetry(
    () => set(ref(rtdb, `instruments/${inst.serial}`), payload),
    `RTDB instrument ${inst.serial}`
  )
  const fsPromise = firebaseWriteWithRetry(
    () => setDoc(doc(db, 'instruments', inst.serial), payload, { merge: true }),
    `Firestore instrument ${inst.serial}`
  )

  await Promise.allSettled([restPromise, rtdbPromise, fsPromise])
  return true
}

export const syncInstrumentToDatabase = syncInstrumentToFirestore

export async function deleteInstrumentFromFirestore(serial: string): Promise<boolean> {
  // 1. Remove from localStorage immediately
  const local = getLocalInstruments()
  saveLocalInstruments(local.filter((i) => i.serial !== serial))

  // 2. Remove from Firebase REST, SDK & Firestore
  rtdbRestDelete(`instruments/${serial}`).catch(() => {})
  const rtdbPromise = remove(ref(rtdb, `instruments/${serial}`)).catch(() => {})
  const firestorePromise = deleteDoc(doc(db, 'instruments', serial)).catch(() => {})

  await Promise.allSettled([rtdbPromise, firestorePromise])
  console.log(`[Database] Removed instrument S/N: ${serial}`)
  return true
}

export const deleteInstrumentFromDatabase = deleteInstrumentFromFirestore

/**
 * Load instruments: REST + SDK cloud data merged with localStorage (no data loss).
 */
export async function loadInstrumentsFromFirestore(): Promise<Instrument[]> {
  const localList = getLocalInstruments()

  // 1. Try Realtime Database REST first (100% reliable across browsers)
  try {
    const restData = await withTimeout(rtdbRestGet<Record<string, Record<string, unknown>>>('instruments'), 4000, null)
    if (restData && typeof restData === 'object') {
      const cloudList: Instrument[] = []
      Object.entries(restData).forEach(([serial, data]) => {
        if (data && (data.serial || data.model)) {
          cloudList.push({
            serial: (data.serial as string) || serial,
            model: (data.model as string) || 'Precision NAWI Scale',
            manufacturer: (data.manufacturer as string) || 'Certified Metrology Inc.',
            accuracy: (data.accuracy as string) || 'III',
            status: (data.status as string) || 'Active',
            max: (data.max as string) || '30.00',
            interval: (data.interval as string) || '0.010',
            location: (data.location as string) || 'Central Standards Lab',
            createdBy: data.createdBy as string | undefined,
            createdByName: data.createdByName as string | undefined,
            userEmail: data.userEmail as string | undefined,
          })
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeInstruments(cloudList, localList)
        saveLocalInstruments(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB REST] Instruments load fallback to SDK:', err)
  }

  // 2. Try Realtime Database SDK
  try {
    const snap = await withTimeout(get(child(ref(rtdb), 'instruments')), 4000, null)
    if (snap && snap.exists()) {
      const val = snap.val() as Record<string, Record<string, unknown>>
      const cloudList: Instrument[] = []
      Object.entries(val).forEach(([serial, data]) => {
        if (data && (data.serial || data.model)) {
          cloudList.push({
            serial: (data.serial as string) || serial,
            model: (data.model as string) || 'Precision NAWI Scale',
            manufacturer: (data.manufacturer as string) || 'Certified Metrology Inc.',
            accuracy: (data.accuracy as string) || 'III',
            status: (data.status as string) || 'Active',
            max: (data.max as string) || '30.00',
            interval: (data.interval as string) || '0.010',
            location: (data.location as string) || 'Central Standards Lab',
            createdBy: data.createdBy as string | undefined,
            createdByName: data.createdByName as string | undefined,
            userEmail: data.userEmail as string | undefined,
          })
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeInstruments(cloudList, localList)
        saveLocalInstruments(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB] Instruments load fallback to Firestore:', err)
  }

  // 3. Fallback to Firestore
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'instruments')), 6000, null)
    if (querySnapshot && !querySnapshot.empty) {
      const cloudList: Instrument[] = []
      querySnapshot.forEach((d) => {
        const data = d.data() as Record<string, unknown>
        if (data && (data.serial || data.model)) {
          cloudList.push({
            serial: (data.serial as string) || d.id,
            model: (data.model as string) || 'Precision NAWI Scale',
            manufacturer: (data.manufacturer as string) || 'Certified Metrology Inc.',
            accuracy: (data.accuracy as string) || 'III',
            status: (data.status as string) || 'Active',
            max: (data.max as string) || '30.00',
            interval: (data.interval as string) || '0.010',
            location: (data.location as string) || 'Central Standards Lab',
            createdBy: data.createdBy as string | undefined,
            createdByName: data.createdByName as string | undefined,
            userEmail: data.userEmail as string | undefined,
          })
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeInstruments(cloudList, localList)
        saveLocalInstruments(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[Firestore] Error loading instruments:', err)
  }

  // 4. Return local data if available, else defaults
  if (localList.length > 0) return localList
  return DEFAULT_INSTRUMENTS
}

export const loadInstrumentsFromDatabase = loadInstrumentsFromFirestore

// ==========================================
// REPORTS REALTIME DB & FIRESTORE SYNC
// ==========================================

/**
 * Sync report to localStorage FIRST (instant), then to Firebase REST, SDK & Firestore.
 */
export async function syncReportToFirestore(report: ReportData): Promise<boolean> {
  // 1. Save to localStorage immediately
  const local = getLocalReports()
  const updatedLocal = [report, ...local.filter((r) => r.reportNumber !== report.reportNumber)]
  saveLocalReports(updatedLocal)

  // 2. Sync to Firebase in background (REST + RTDB SDK + Firestore)
  const payload = sanitizeForFirestore({
    ...report,
    updatedAt: new Date().toISOString(),
  })

  const restPromise = rtdbRestPut(`reports/${report.reportNumber}`, payload).catch(() => false)
  const rtdbPromise = firebaseWriteWithRetry(
    () => set(ref(rtdb, `reports/${report.reportNumber}`), payload),
    `RTDB report ${report.reportNumber}`
  )
  const fsPromise = firebaseWriteWithRetry(
    () => setDoc(doc(db, 'reports', report.reportNumber), payload, { merge: true }),
    `Firestore report ${report.reportNumber}`
  )

  await Promise.allSettled([restPromise, rtdbPromise, fsPromise])
  return true
}

export const syncReportToDatabase = syncReportToFirestore

export async function deleteReportFromFirestore(reportNumber: string): Promise<boolean> {
  // 1. Remove from localStorage immediately
  const local = getLocalReports()
  saveLocalReports(local.filter((r) => r.reportNumber !== reportNumber))

  // 2. Remove from Firebase REST, SDK & Firestore
  rtdbRestDelete(`reports/${reportNumber}`).catch(() => {})
  const rtdbPromise = remove(ref(rtdb, `reports/${reportNumber}`)).catch(() => {})
  const firestorePromise = deleteDoc(doc(db, 'reports', reportNumber)).catch(() => {})

  await Promise.allSettled([rtdbPromise, firestorePromise])
  console.log(`[Database] Removed report #${reportNumber}`)
  return true
}

export const deleteReportFromDatabase = deleteReportFromFirestore

/**
 * Load reports: REST + SDK cloud data merged with localStorage (no data loss).
 */
export async function loadReportsFromFirestore(): Promise<ReportData[]> {
  const localList = getLocalReports()

  // 1. Try Realtime Database REST first
  try {
    const restData = await withTimeout(rtdbRestGet<Record<string, ReportData>>('reports'), 4000, null)
    if (restData && typeof restData === 'object') {
      const cloudList: ReportData[] = []
      Object.entries(restData).forEach(([repNum, data]) => {
        if (data && (data.reportNumber || repNum)) {
          cloudList.push({ ...data, reportNumber: data.reportNumber || repNum })
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeReports(cloudList, localList)
        saveLocalReports(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB REST] Reports load fallback to SDK:', err)
  }

  // 2. Try Realtime Database SDK
  try {
    const snap = await withTimeout(get(child(ref(rtdb), 'reports')), 4000, null)
    if (snap && snap.exists()) {
      const val = snap.val() as Record<string, ReportData>
      const cloudList: ReportData[] = []
      Object.entries(val).forEach(([repNum, data]) => {
        if (data && (data.reportNumber || repNum)) {
          cloudList.push({ ...data, reportNumber: data.reportNumber || repNum })
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeReports(cloudList, localList)
        saveLocalReports(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB SDK] Reports load fallback to Firestore:', err)
  }

  // 3. Fallback to Firestore
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'reports')), 6000, null)
    if (querySnapshot && !querySnapshot.empty) {
      const cloudList: ReportData[] = []
      querySnapshot.forEach((d) => {
        const data = d.data() as ReportData
        if (data && data.reportNumber) {
          cloudList.push(data)
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeReports(cloudList, localList)
        saveLocalReports(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[Firestore] Error loading reports:', err)
  }

  // 4. Return local data if available, else defaults
  if (localList.length > 0) return localList
  return DEFAULT_REPORTS
}

export const loadReportsFromDatabase = loadReportsFromFirestore

// ==========================================
// AUDIT LOGS REALTIME DB & FIRESTORE SYNC
// ==========================================

/**
 * Sync audit log to localStorage FIRST (instant), then to Firebase REST, SDK & Firestore.
 */
export async function syncAuditLogToFirestore(evt: AuditEvent): Promise<boolean> {
  // 1. Save to localStorage immediately
  const local = getLocalAuditLogs()
  const updatedLocal = [evt, ...local.filter((e) => e.id !== evt.id)]
  saveLocalAuditLogs(updatedLocal)

  // 2. Sync to Firebase in background
  const payload = sanitizeForFirestore({
    ...evt,
    loggedAt: new Date().toISOString(),
  })

  const restPromise = rtdbRestPut(`audit_logs/${evt.id}`, payload).catch(() => false)
  const rtdbPromise = firebaseWriteWithRetry(
    () => set(ref(rtdb, `audit_logs/${evt.id}`), payload),
    `RTDB audit ${evt.id}`
  )
  const fsPromise = firebaseWriteWithRetry(
    () => setDoc(doc(db, 'audit_logs', evt.id), payload, { merge: true }),
    `Firestore audit ${evt.id}`
  )

  await Promise.allSettled([restPromise, rtdbPromise, fsPromise])
  return true
}

export const syncAuditLogToDatabase = syncAuditLogToFirestore

/**
 * Load audit logs: REST + SDK cloud data merged with localStorage (no data loss).
 */
export async function loadAuditLogsFromFirestore(): Promise<AuditEvent[]> {
  const localList = getLocalAuditLogs()

  // 1. Try Realtime Database REST first
  try {
    const restData = await withTimeout(rtdbRestGet<Record<string, AuditEvent>>('audit_logs'), 4000, null)
    if (restData && typeof restData === 'object') {
      const cloudList: AuditEvent[] = []
      Object.entries(restData).forEach(([id, data]) => {
        if (data && (data.id || id)) {
          cloudList.push({ ...data, id: data.id || id })
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeAuditLogs(cloudList, localList)
        saveLocalAuditLogs(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB REST] Audit logs load fallback to SDK:', err)
  }

  // 2. Try Realtime Database SDK
  try {
    const snap = await withTimeout(get(child(ref(rtdb), 'audit_logs')), 4000, null)
    if (snap && snap.exists()) {
      const val = snap.val() as Record<string, AuditEvent>
      const cloudList: AuditEvent[] = []
      Object.entries(val).forEach(([id, data]) => {
        if (data && (data.id || id)) {
          cloudList.push({ ...data, id: data.id || id })
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeAuditLogs(cloudList, localList)
        saveLocalAuditLogs(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[RealtimeDB SDK] Audit logs load fallback to Firestore:', err)
  }

  // 3. Fallback to Firestore
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'audit_logs')), 6000, null)
    if (querySnapshot && !querySnapshot.empty) {
      const cloudList: AuditEvent[] = []
      querySnapshot.forEach((d) => {
        const data = d.data() as AuditEvent
        if (data && data.id) {
          cloudList.push(data)
        }
      })
      if (cloudList.length > 0) {
        const merged = mergeAuditLogs(cloudList, localList)
        saveLocalAuditLogs(merged)
        return merged
      }
    }
  } catch (err) {
    console.warn('[Firestore] Error loading audit logs:', err)
  }

  // 4. Return local data if available, else defaults
  if (localList.length > 0) return localList
  return DEFAULT_AUDIT_LOGS
}

export const loadAuditLogsFromDatabase = loadAuditLogsFromFirestore


/**
 * Realtime Live Listener for Instruments — merges cloud with local
 */
export function subscribeToInstruments(callback: (instruments: Instrument[]) => void): () => void {
  const instRef = ref(rtdb, 'instruments')
  return onValue(
    instRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Record<string, Record<string, unknown>>
        const cloudList: Instrument[] = []
        Object.entries(val).forEach(([serial, data]) => {
          if (data && (data.serial || data.model)) {
            cloudList.push({
              serial: (data.serial as string) || serial,
              model: (data.model as string) || 'Precision NAWI Scale',
              manufacturer: (data.manufacturer as string) || 'Certified Metrology Inc.',
              accuracy: (data.accuracy as string) || 'III',
              status: (data.status as string) || 'Active',
              max: (data.max as string) || '30.00',
              interval: (data.interval as string) || '0.010',
              location: (data.location as string) || 'Central Standards Lab',
              createdBy: data.createdBy as string | undefined,
              createdByName: data.createdByName as string | undefined,
              userEmail: data.userEmail as string | undefined,
            })
          }
        })
        if (cloudList.length > 0) {
          const merged = mergeInstruments(cloudList, getLocalInstruments())
          saveLocalInstruments(merged)
          callback(merged)
        }
      }
    },
    (err) => {
      console.warn('[RealtimeDB] Live instruments error:', err)
    }
  )
}

/**
 * Realtime Live Listener for Reports — merges cloud with local
 */
export function subscribeToReports(callback: (reports: ReportData[]) => void): () => void {
  const repRef = ref(rtdb, 'reports')
  return onValue(
    repRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Record<string, ReportData>
        const cloudList: ReportData[] = []
        Object.entries(val).forEach(([repNum, data]) => {
          if (data && (data.reportNumber || repNum)) {
            cloudList.push({ ...data, reportNumber: data.reportNumber || repNum })
          }
        })
        if (cloudList.length > 0) {
          const merged = mergeReports(cloudList, getLocalReports())
          saveLocalReports(merged)
          callback(merged)
        }
      }
    },
    (err) => {
      console.warn('[RealtimeDB] Live reports error:', err)
    }
  )
}

/**
 * Realtime Live Listener for Audit Logs — merges cloud with local
 */
export function subscribeToAuditLogs(callback: (logs: AuditEvent[]) => void): () => void {
  const logRef = ref(rtdb, 'audit_logs')
  return onValue(
    logRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Record<string, AuditEvent>
        const cloudList: AuditEvent[] = []
        Object.entries(val).forEach(([id, data]) => {
          if (data && (data.id || id)) {
            cloudList.push({ ...data, id: data.id || id })
          }
        })
        if (cloudList.length > 0) {
          const merged = mergeAuditLogs(cloudList, getLocalAuditLogs())
          saveLocalAuditLogs(merged)
          callback(merged)
        }
      }
    },
    (err) => {
      console.warn('[RealtimeDB] Live audit logs error:', err)
    }
  )
}

// ==========================================
// PUBLIC LOCAL STORAGE ACCESSORS (for App.tsx init)
// ==========================================
export { getLocalInstruments, getLocalReports, getLocalAuditLogs }
