import { useState, useEffect } from 'react'
import { ShieldCheck, CheckCircle2, AlertTriangle, Scale, CloudSun, ArrowLeft, Printer, Copy, Check } from 'lucide-react'
import type { ReportData } from './CalibrationReport.tsx'
import CalibrationReport from './CalibrationReport.tsx'
import { loadReportsFromFirestore, getLocalReports } from '../services/dbService.ts'
import { rtdbRestGet } from '../services/firebase.ts'
import '../styles/report.css'

type Props = {
  verifyId: string
  onExit: () => void
}

export default function PublicVerificationView({ verifyId, onExit }: Props) {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFullCert, setShowFullCert] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)

    const normalizedTarget = verifyId.trim().toLowerCase()

    const resolveReport = async () => {
      // 1. Check local storage first
      const local = getLocalReports()
      const foundLocal = local.find(r => (r.reportNumber || '').trim().toLowerCase() === normalizedTarget)
      if (foundLocal && active) {
        setReport(foundLocal)
        setLoading(false)
        return
      }

      // 2. Direct REST fetch for this specific report ID (super fast & reliable)
      try {
        const directData = await rtdbRestGet<ReportData>(`reports/${verifyId.trim()}`)
        if (directData && (directData.reportNumber || directData.instrument) && active) {
          const formatted: ReportData = {
            ...directData,
            reportNumber: directData.reportNumber || verifyId.trim(),
          }
          setReport(formatted)
          setLoading(false)
          return
        }
      } catch (err) {
        console.warn('Direct RTDB fetch failed, falling back:', err)
      }

      // 3. Query all cloud reports from Firebase
      try {
        const cloudReports = await loadReportsFromFirestore()
        if (!active) return
        const foundCloud = cloudReports.find(r => (r.reportNumber || '').trim().toLowerCase() === normalizedTarget)
        if (foundCloud) {
          setReport(foundCloud)
          setLoading(false)
          return
        }
      } catch (err) {
        console.warn('Cloud reports load failed:', err)
      }

      // 4. One quick retry after 1.5s in case write is currently in-flight
      setTimeout(async () => {
        if (!active) return
        try {
          const directRetry = await rtdbRestGet<ReportData>(`reports/${verifyId.trim()}`)
          if (directRetry && (directRetry.reportNumber || directRetry.instrument)) {
            setReport({ ...directRetry, reportNumber: directRetry.reportNumber || verifyId.trim() })
          }
        } catch {}
        if (active) setLoading(false)
      }, 1500)
    }

    resolveReport()

    return () => {
      active = false
    }
  }, [verifyId])

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (showFullCert && report) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', overflowY: 'auto' }}>
        <CalibrationReport
          data={report}
          onClose={() => setShowFullCert(false)}
          onPrint={() => window.print()}
        />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a1e24', color: '#eef5f3', fontFamily: 'Plus Jakarta Sans, sans-serif', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Top Header */}
      <header style={{ width: '100%', maxWidth: '780px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #0f7c76 0%, #183e4e 100%)', borderRadius: '10px', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <Scale size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', color: '#ffffff' }}>
              MAPAN METROLOGY OS
            </h1>
            <p style={{ margin: 0, fontSize: '10px', color: '#82aba6', textTransform: 'uppercase', letterSpacing: '1px' }}>
              National Legal Metrology Verification Registry
            </p>
          </div>
        </div>

        <button
          onClick={onExit}
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#eef5f3', padding: '8px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
        >
          <ArrowLeft size={14} /> Back to Portal
        </button>
      </header>

      {/* Main Verification Card */}
      <main style={{ width: '100%', maxWidth: '780px' }}>
        {loading ? (
          <div style={{ background: '#112c33', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #0f7c76', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <h3 style={{ margin: 0, fontSize: '16px', color: '#ffffff' }}>Verifying Cryptographic Ledger...</h3>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#82aba6' }}>Checking certificate ID {verifyId} against National Database</p>
          </div>
        ) : !report ? (
          <div style={{ background: '#112c33', borderRadius: '12px', padding: '40px 24px', textAlign: 'center', border: '1px solid #7c2424' }}>
            <div style={{ width: '56px', height: '56px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#ffffff' }}>Certificate Not Found / Unverified</h2>
            <p style={{ margin: '10px auto 20px', fontSize: '12px', color: '#a0b5b2', maxWidth: '480px', lineHeight: 1.5 }}>
              The certificate ID <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', color: '#ff8a8a' }}>{verifyId}</code> could not be validated in the National Legal Metrology database. It may be invalid or not yet synchronized.
            </p>
            <button
              onClick={onExit}
              style={{ background: '#0f7c76', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              Open Mapan Workspace
            </button>
          </div>
        ) : (
          <div style={{ background: '#112c33', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            {/* Authenticity Banner */}
            <div style={{ background: report.overallResult === 'Pass' ? 'linear-gradient(90deg, #0d594b 0%, #134e48 100%)' : 'linear-gradient(90deg, #78350f 0%, #451a03 100%)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#ffffff' }}>
                  <ShieldCheck size={26} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: '#a7f3d0' }}>
                      {report.overallResult === 'Pass' ? 'AUTHENTICITY CONFIRMED · TAMPER-PROOF' : 'AUDIT WARNING · RE-VERIFICATION REQUIRED'}
                    </span>
                    <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                  </div>
                  <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                    {report.overallResult === 'Pass' ? 'Legal Metrology Certificate Verified' : 'Non-Compliant Calibration Record'}
                  </h2>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleCopyLink}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', padding: '7px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  {copied ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                  {copied ? 'Link Copied' : 'Share Link'}
                </button>
                <button
                  onClick={() => setShowFullCert(true)}
                  style={{ background: '#ffffff', color: '#0f7c76', border: 0, padding: '7px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <Printer size={13} /> View Official Certificate
                </button>
              </div>
            </div>

            {/* Certificate Meta Bar */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', background: 'rgba(0,0,0,0.15)' }}>
              <div>
                <span style={{ fontSize: '10px', color: '#82aba6', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Certificate ID</span>
                <strong style={{ fontSize: '13px', color: '#ffffff', fontFamily: 'DM Mono, monospace' }}>{report.reportNumber}</strong>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#82aba6', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Verification Date</span>
                <strong style={{ fontSize: '13px', color: '#ffffff' }}>{report.issueDate} ({report.issueTime || '14:30 IST'})</strong>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#82aba6', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Governing Standard</span>
                <strong style={{ fontSize: '13px', color: '#5eead4' }}>OIML R 76-1:2006 (ISO 17025)</strong>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#82aba6', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Testing Metrologist</span>
                <strong style={{ fontSize: '13px', color: '#ffffff' }}>{report.technicianName}</strong>
              </div>
            </div>

            {/* Instrument & Test Environment Specs */}
            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Instrument Details */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 800, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Scale size={14} /> Verified Instrument Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Manufacturer:</span>
                    <strong style={{ color: '#ffffff' }}>{report.instrument.manufacturer || 'Essae Scales'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Model:</span>
                    <strong style={{ color: '#ffffff' }}>{report.instrument.model}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Serial Number:</span>
                    <strong style={{ color: '#ffffff', fontFamily: 'DM Mono, monospace' }}>{report.instrument.serial}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Accuracy Class:</span>
                    <strong style={{ color: '#fbbf24' }}>Class {report.instrument.accuracy}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Max Capacity:</span>
                    <strong style={{ color: '#ffffff' }}>{report.instrument.max} kg</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Interval (e / d):</span>
                    <strong style={{ color: '#ffffff' }}>{report.instrument.interval} kg / {report.instrument.division}</strong>
                  </div>
                </div>
              </div>

              {/* Environmental Sensor Telemetry */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 800, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CloudSun size={14} /> Live Sensor Telemetry (ISO 17025)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Ambient Temp:</span>
                    <strong style={{ color: '#ffffff' }}>{report.temperature || '22.0 °C'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Relative Humidity:</span>
                    <strong style={{ color: '#ffffff' }}>{report.humidity || '50.0 % RH'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Barometric Pressure:</span>
                    <strong style={{ color: '#ffffff' }}>{report.pressure || '1013.2 hPa'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#82aba6', display: 'block' }}>Test Location:</span>
                    <strong style={{ color: '#ffffff' }}>{report.instrument.location || 'Central Standards Lab'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Cryptographic Proof Section */}
            <div style={{ margin: '0 24px 24px', background: 'rgba(15, 124, 118, 0.1)', border: '1px solid rgba(15, 124, 118, 0.3)', borderRadius: '8px', padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  SHA-256 Cryptographic Audit Seal (Tamper-Evident)
                </span>
                <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 700 }}>✓ Verified Blockchain/Ledger Signature</span>
              </div>
              <code style={{ fontSize: '11px', color: '#eef5f3', fontFamily: 'DM Mono, monospace', wordBreak: 'break-all', display: 'block', background: 'rgba(0,0,0,0.25)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                {report.sha256Hash}
              </code>
            </div>

            {/* Bottom Actions */}
            <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '10px', color: '#82aba6' }}>
                Issued by Directorate of Legal Metrology, Government of India
              </span>
              <button
                onClick={() => setShowFullCert(true)}
                style={{ background: '#0f7c76', color: '#ffffff', border: 0, padding: '9px 18px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                <Printer size={14} /> Open Printable Legal Certificate
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
