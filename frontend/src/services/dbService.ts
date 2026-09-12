import {
  db,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  withTimeout,
  sanitizeForFirestore,
} from './firebase.ts'
import type { Instrument } from '../views/InstrumentRegisterView.tsx'
import type { ReportData } from '../views/CalibrationReport.tsx'
import type { AuditEvent } from '../App.tsx'

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
    hash: 'e3b0c44298fc1c14...',
  },
]

// ==========================================
// INSTRUMENTS FIRESTORE SYNC & PERSISTENCE
// ==========================================
export async function syncInstrumentToFirestore(inst: Instrument): Promise<boolean> {
  try {
    const instRef = doc(db, 'instruments', inst.serial)
    const payload = sanitizeForFirestore({
      ...inst,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await withTimeout(
      setDoc(instRef, payload, { merge: true }),
      8000,
      undefined
    )
    console.log(`[Firestore] Successfully synchronized instrument S/N: ${inst.serial}`)
    return true
  } catch (err) {
    console.error('[Firestore] Instrument sync error:', err)
    return false
  }
}

export async function deleteInstrumentFromFirestore(serial: string): Promise<boolean> {
  try {
    const instRef = doc(db, 'instruments', serial)
    await withTimeout(deleteDoc(instRef), 8000, undefined)
    console.log(`[Firestore] Successfully removed instrument S/N: ${serial}`)
    return true
  } catch (err) {
    console.error('[Firestore] Instrument delete error:', err)
    return false
  }
}

export async function loadInstrumentsFromFirestore(): Promise<Instrument[]> {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'instruments')), 8000, null)
    if (!querySnapshot || querySnapshot.empty) {
      return []
    }
    const list: Instrument[] = []
    querySnapshot.forEach((d) => {
      const data = d.data() as Record<string, unknown>
      if (data && (data.serial || data.model)) {
        list.push({
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
    return list
  } catch (err) {
    console.warn('[Firestore] Error loading instruments:', err)
    return []
  }
}

// ==========================================
// REPORTS FIRESTORE SYNC & PERSISTENCE
// ==========================================
export async function syncReportToFirestore(report: ReportData): Promise<boolean> {
  try {
    const repRef = doc(db, 'reports', report.reportNumber)
    const payload = sanitizeForFirestore({
      ...report,
      updatedAt: new Date().toISOString(),
    })
    await withTimeout(
      setDoc(repRef, payload, { merge: true }),
      8000,
      undefined
    )
    console.log(`[Firestore] Successfully synchronized report #${report.reportNumber}`)
    return true
  } catch (err) {
    console.error('[Firestore] Report sync error:', err)
    return false
  }
}

export async function deleteReportFromFirestore(reportNumber: string): Promise<boolean> {
  try {
    const repRef = doc(db, 'reports', reportNumber)
    await withTimeout(deleteDoc(repRef), 8000, undefined)
    console.log(`[Firestore] Successfully removed report #${reportNumber}`)
    return true
  } catch (err) {
    console.error('[Firestore] Report delete error:', err)
    return false
  }
}

export async function loadReportsFromFirestore(): Promise<ReportData[]> {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'reports')), 8000, null)
    if (!querySnapshot || querySnapshot.empty) {
      return []
    }
    const list: ReportData[] = []
    querySnapshot.forEach((d) => {
      const data = d.data() as ReportData
      if (data && data.reportNumber) {
        list.push(data)
      }
    })
    return list
  } catch (err) {
    console.warn('[Firestore] Error loading reports:', err)
    return []
  }
}

// ==========================================
// AUDIT LOGS FIRESTORE SYNC & PERSISTENCE
// ==========================================
export async function syncAuditLogToFirestore(evt: AuditEvent): Promise<boolean> {
  try {
    const logRef = doc(db, 'audit_logs', evt.id)
    const payload = sanitizeForFirestore({
      ...evt,
      loggedAt: new Date().toISOString(),
    })
    await withTimeout(
      setDoc(logRef, payload, { merge: true }),
      8000,
      undefined
    )
    console.log(`[Firestore] Successfully synchronized audit log [${evt.id}]`)
    return true
  } catch (err) {
    console.error('[Firestore] Audit log sync error:', err)
    return false
  }
}

export async function loadAuditLogsFromFirestore(): Promise<AuditEvent[]> {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, 'audit_logs')), 8000, null)
    if (!querySnapshot || querySnapshot.empty) {
      return []
    }
    const list: AuditEvent[] = []
    querySnapshot.forEach((d) => {
      const data = d.data() as AuditEvent
      if (data && data.id) {
        list.push(data)
      }
    })
    return list
  } catch (err) {
    console.warn('[Firestore] Error loading audit logs:', err)
    return []
  }
}


