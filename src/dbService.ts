import {
  db,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  withTimeout,
} from './firebase'
import type { Instrument } from './InstrumentRegisterView'
import type { ReportData } from './CalibrationReport'
import type { AuditEvent } from './App'

// ==========================================
// INSTRUMENTS FIRESTORE SYNC
// ==========================================
export async function syncInstrumentToFirestore(inst: Instrument) {
  try {
    const instRef = doc(db, 'instruments', inst.serial)
    await withTimeout(
      setDoc(instRef, { ...inst, updatedAt: new Date().toISOString() }, { merge: true }),
      3000,
      undefined
    )
  } catch (err) {
    console.warn('Firestore instrument sync (offline fallback active):', err)
  }
}

export async function deleteInstrumentFromFirestore(serial: string) {
  try {
    const instRef = doc(db, 'instruments', serial)
    await withTimeout(deleteDoc(instRef), 3000, undefined)
  } catch (err) {
    console.warn('Firestore instrument delete (offline fallback active):', err)
  }
}

export async function loadInstrumentsFromFirestore(): Promise<Instrument[]> {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'instruments')), 2500, null)
    if (!querySnapshot) return []
    const list: Instrument[] = []
    querySnapshot.forEach((d) => {
      list.push(d.data() as Instrument)
    })
    return list
  } catch {
    return []
  }
}

// ==========================================
// REPORTS FIRESTORE SYNC
// ==========================================
export async function syncReportToFirestore(report: ReportData) {
  try {
    const repRef = doc(db, 'reports', report.reportNumber)
    await withTimeout(
      setDoc(repRef, { ...report, updatedAt: new Date().toISOString() }, { merge: true }),
      3000,
      undefined
    )
  } catch (err) {
    console.warn('Firestore report sync (offline fallback active):', err)
  }
}

export async function deleteReportFromFirestore(reportNumber: string) {
  try {
    const repRef = doc(db, 'reports', reportNumber)
    await withTimeout(deleteDoc(repRef), 3000, undefined)
  } catch (err) {
    console.warn('Firestore report delete (offline fallback active):', err)
  }
}

export async function loadReportsFromFirestore(): Promise<ReportData[]> {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'reports')), 2500, null)
    if (!querySnapshot) return []
    const list: ReportData[] = []
    querySnapshot.forEach((d) => {
      list.push(d.data() as ReportData)
    })
    return list
  } catch {
    return []
  }
}

// ==========================================
// AUDIT LOGS FIRESTORE SYNC
// ==========================================
export async function syncAuditLogToFirestore(evt: AuditEvent) {
  try {
    const logRef = doc(db, 'audit_logs', evt.id)
    await withTimeout(
      setDoc(logRef, { ...evt, loggedAt: new Date().toISOString() }, { merge: true }),
      3000,
      undefined
    )
  } catch (err) {
    console.warn('Firestore audit sync (offline fallback active):', err)
  }
}

export async function loadAuditLogsFromFirestore(): Promise<AuditEvent[]> {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'audit_logs')), 2500, null)
    if (!querySnapshot) return []
    const list: AuditEvent[] = []
    querySnapshot.forEach((d) => {
      list.push(d.data() as AuditEvent)
    })
    return list
  } catch {
    return []
  }
}

