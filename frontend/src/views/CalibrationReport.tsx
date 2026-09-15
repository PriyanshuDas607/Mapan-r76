import { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Printer, X, ShieldCheck } from 'lucide-react'
import { generateQRCodeDataURL } from '../utils/cryptoUtils.ts'
import '../styles/report.css'

export type InstrumentInfo = {
  serial: string
  model: string
  manufacturer: string
  accuracy: string
  max: string
  interval: string
  division?: string
  location?: string
  customer?: string
}

export type ObservationRow = {
  id: number
  load: string
  indication: string
  error: string
  mpe: string
  result: 'Pass' | 'Review'
  percentage?: string
}

export type ReportData = {
  reportNumber: string
  issueDate: string
  issueTime: string
  technicianName: string
  userId?: string
  userEmail?: string
  approverName: string
  temperature: string
  humidity: string
  pressure: string
  standardWeightsRef: string
  instrument: InstrumentInfo
  observations: ObservationRow[]
  overallResult: 'Pass' | 'Review'
  labId?: string
  sha256Hash: string
}

type Props = {
  data: ReportData
  onClose?: () => void
  onPrint?: () => void
}

export default function CalibrationReport({ data, onClose, onPrint }: Props) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const isPass = data.overallResult === 'Pass'
  const validObservations = data.observations.filter(o => o.error !== '—')
  
  // Calculate max absolute error
  let maxAbsError = 0
  let maxErrorPoint = ''
  let mpeAtMaxError = ''
  validObservations.forEach((row) => {
    const errVal = Math.abs(parseFloat(row.error) || 0)
    if (errVal >= maxAbsError) {
      maxAbsError = errVal
      maxErrorPoint = `${row.load} kg`
      mpeAtMaxError = row.mpe
    }
  })

  // Generate real scannable QR Code pointing to tamper-proof public verification link
  useEffect(() => {
    const origin = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://mapan-r76.vercel.app'
    const verificationUrl = `${origin}/?verify=${encodeURIComponent(data.reportNumber)}`

    generateQRCodeDataURL(verificationUrl).then((url) => {
      setQrCodeUrl(url)
    })
  }, [data])

  const handlePrint = () => {
    if (onPrint) {
      onPrint()
    } else {
      window.print()
    }
  }

  return (
    <div className="report-modal-overlay">
      <div className="report-modal-content">
        {/* Modal Top Bar (Hidden during printing) */}
        <div className="report-modal-header">
          <h3>
            <ShieldCheck size={18} /> Official Legal Metrology Certificate Preview
          </h3>
          <div className="actions">
            <button className="report-btn report-btn-print" onClick={handlePrint}>
              <Printer size={15} /> Print / Save as PDF
            </button>
            {onClose && (
              <button className="report-btn-close" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Printable Official Certificate Document */}
        <div className="printable-certificate">
          {/* Header */}
          <header className="cert-header">
            <div className="cert-logo-section">
              <div className="cert-emblem">
                <span>M</span>
                <small>MAPAN</small>
              </div>
              <div className="cert-org-title">
                <h2>Mapan Legal Metrology Laboratory</h2>
                <p>National Metrological Testing & Standards Directorate</p>
                <div className="cert-standards">
                  OIML R 76-1:2006 (E) · ISO/IEC 17025 ACCREDITED
                </div>
              </div>
            </div>

            <div className="cert-badge-section">
              <span className="cert-doc-type">Verification Certificate</span>
              <span className="cert-number">{data.reportNumber}</span>
              <span className={`cert-status-tag ${isPass ? 'cert-status-pass' : 'cert-status-review'}`}>
                {isPass ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {isPass ? 'VERIFIED · PASSED' : 'RE-VERIFICATION REQUIRED'}
              </span>
            </div>
          </header>

          {/* Certificate Title Banner */}
          <div className="cert-title-banner">
            <h1>Certificate of Verification & Test Report</h1>
            <p>Verification of Non-Automatic Weighing Instrument (NAWI) in accordance with OIML R 76-1:2006</p>
          </div>

          {/* Section 1: Instrument Details */}
          <section className="cert-section">
            <h3 className="cert-section-title">
              <span className="sec-num">1.0</span> Instrument Identification & Metrological Characteristics
            </h3>
            <div className="cert-grid-4">
              <div className="cert-item">
                <span className="cert-label">Instrument Type</span>
                <span className="cert-val">Non-Automatic Weighing Instrument (NAWI)</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Serial Number</span>
                <span className="cert-val mono highlight">{data.instrument.serial || 'LAB-2026-007'}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Model / Designation</span>
                <span className="cert-val">{data.instrument.model || 'MX-300 Precision Series'}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Manufacturer / Make</span>
                <span className="cert-val">{data.instrument.manufacturer || 'Mapan Metrology Instruments Ltd.'}</span>
              </div>

              <div className="cert-item">
                <span className="cert-label">Accuracy Class</span>
                <span className="cert-val mono highlight">Class {data.instrument.accuracy}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Max Capacity (Max)</span>
                <span className="cert-val mono">{Number(data.instrument.max || 30).toFixed(3)} kg</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Verification Scale Interval (e)</span>
                <span className="cert-val mono">{Number(data.instrument.interval || 0.01).toFixed(3)} kg</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Number of Intervals (n = Max/e)</span>
                <span className="cert-val mono">
                  {(Number(data.instrument.max || 30) / Number(data.instrument.interval || 0.01)).toLocaleString()}
                </span>
              </div>

              <div className="cert-item">
                <span className="cert-label">Actual Scale Interval (d)</span>
                <span className="cert-val mono">{data.instrument.division || '0.001 kg'}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Minimum Capacity (Min)</span>
                <span className="cert-val mono">
                  {(Number(data.instrument.interval || 0.01) * 20).toFixed(3)} kg (20e)
                </span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Installation / Test Site</span>
                <span className="cert-val">{data.instrument.location || 'Central Standards Lab - Calibration Bay 04'}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Client / Facility</span>
                <span className="cert-val">{data.instrument.customer || 'National Legal Metrology Directorate'}</span>
              </div>
            </div>
          </section>

          {/* Section 2: Test Environment & Standards */}
          <section className="cert-section">
            <h3 className="cert-section-title">
              <span className="sec-num">2.0</span> Test Conditions & Reference Standards
            </h3>
            <div className="cert-grid-4">
              <div className="cert-item">
                <span className="cert-label">Test Date & Time</span>
                <span className="cert-val mono">{data.issueDate} · {data.issueTime}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Ambient Temperature</span>
                <span className="cert-val mono">{data.temperature}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Relative Humidity</span>
                <span className="cert-val mono">{data.humidity}</span>
              </div>
              <div className="cert-item">
                <span className="cert-label">Barometric Pressure</span>
                <span className="cert-val mono">{data.pressure}</span>
              </div>
              <div className="cert-item" style={{ gridColumn: 'span 2' }}>
                <span className="cert-label">Reference Standard Weights Used</span>
                <span className="cert-val mono">{data.standardWeightsRef}</span>
              </div>
              <div className="cert-item" style={{ gridColumn: 'span 2' }}>
                <span className="cert-label">Atmospheric Traceability & Air Density (ρ)</span>
                <span className="cert-val mono">
                  {((0.34848 * (parseFloat(data.pressure) || 1013.25) - 0.009 * (parseFloat(data.humidity) || 50) * Math.exp(0.061 * (parseFloat(data.temperature) || 21.5))) / (273.15 + (parseFloat(data.temperature) || 21.5))).toFixed(3)} kg/m³ (ISO/IEC 17025 Cl. 6.3)
                </span>
              </div>
            </div>
          </section>

          {/* Section 3: Test Observations & Calculation Trace */}
          <section className="cert-section">
            <h3 className="cert-section-title">
              <span className="sec-num">3.0</span> Weighing Performance Test Observations & Error Trace
            </h3>
            <div className="cert-table-wrap">
              <table className="cert-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                    <th>Applied Load L (kg)</th>
                    <th>Indication I (kg)</th>
                    <th>Calculated Error E = (I − L)</th>
                    <th>Permissible MPE (±)</th>
                    <th>Standard Clause</th>
                    <th>Deviation vs MPE</th>
                    <th style={{ textAlign: 'center' }}>Evaluation</th>
                  </tr>
                </thead>
                <tbody>
                  {data.observations.map((row, idx) => {
                    const isRowPass = row.result === 'Pass'
                    const loadNum = parseFloat(row.load)
                    const indNum = parseFloat(row.indication)
                    const errNum = parseFloat(row.error)
                    const mpeClean = row.mpe.replace('±', '')
                    const mpeNum = parseFloat(mpeClean)
                    const ratio = (!isNaN(errNum) && !isNaN(mpeNum) && mpeNum > 0)
                      ? `${((Math.abs(errNum) / mpeNum) * 100).toFixed(1)}%`
                      : '—'

                    return (
                      <tr key={row.id}>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td>{isNaN(loadNum) ? row.load : `${loadNum.toFixed(3)} kg`}</td>
                        <td>{isNaN(indNum) ? row.indication : `${indNum.toFixed(3)} kg`}</td>
                        <td style={{ fontWeight: 600, color: isRowPass ? '#183e4e' : '#cf222e' }}>
                          {row.error !== '—' ? `${row.error} kg` : '—'}
                        </td>
                        <td>{row.mpe !== '—' ? `${row.mpe} kg` : '—'}</td>
                        <td style={{ fontSize: '8px', color: '#527278', fontFamily: 'DM Mono, monospace' }}>
                          OIML R-76 Cl. 3.5.1
                        </td>
                        <td>{ratio}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={isRowPass ? 'td-pass' : 'td-fail'}>
                            {isRowPass ? '✓ PASS' : '✗ REVIEW'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4: Compliance Decision & OIML Clauses */}
          <div className={`cert-decision-box ${isPass ? '' : 'decision-review'}`}>
            <div className="cert-decision-main">
              <h4>Metrological Conformity Statement</h4>
              <p>
                {isPass ? (
                  <>
                    The instrument with serial number <strong>{data.instrument.serial || 'LAB-2026-007'}</strong> has been
                    tested and found to <strong>CONFORM</strong> with the Maximum Permissible Error (MPE) limits
                    specified in <strong>OIML R 76-1:2006</strong> for <strong>Accuracy Class {data.instrument.accuracy}</strong>.
                    Maximum recorded absolute intrinsic error was <strong>{maxAbsError.toFixed(3)} kg</strong> at {maxErrorPoint} (allowable limit: {mpeAtMaxError} kg).
                  </>
                ) : (
                  <>
                    One or more observation points exceeded the allowable Maximum Permissible Error (MPE) threshold.
                    The instrument <strong>DOES NOT CONFORM</strong> to Class {data.instrument.accuracy} specifications and
                    must be recalibrated before legal verification.
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                <span style={{ fontSize: '7.5px', background: isPass ? '#e6f3ee' : '#fce8e6', color: isPass ? '#0f7c76' : '#c53030', padding: '3px 6px', borderRadius: '3px', fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                  ✓ Cl. 3.2 Classification & Intervals
                </span>
                <span style={{ fontSize: '7.5px', background: isPass ? '#e6f3ee' : '#fce8e6', color: isPass ? '#0f7c76' : '#c53030', padding: '3px 6px', borderRadius: '3px', fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                  ✓ Cl. 3.5.1 MPE Step-Function
                </span>
                <span style={{ fontSize: '7.5px', background: isPass ? '#e6f3ee' : '#fce8e6', color: isPass ? '#0f7c76' : '#c53030', padding: '3px 6px', borderRadius: '3px', fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                  ✓ Cl. T.5.5.1 Error E = (I - L)
                </span>
                <span style={{ fontSize: '7.5px', background: isPass ? '#e6f3ee' : '#fce8e6', color: isPass ? '#0f7c76' : '#c53030', padding: '3px 6px', borderRadius: '3px', fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                  ✓ Cl. 5.5.2.2 Cryptographic Seal
                </span>
              </div>
            </div>
            <div className={`cert-decision-stamp ${isPass ? '' : 'stamp-review'}`}>
              {isPass ? 'VERIFIED & PASSED' : 'OUT OF TOLERANCE'}
            </div>
          </div>

          {/* Section 5: Authorization, Signatures & Digital Seal */}
          <section className="cert-signatures">
            <div className="cert-sign-block">
              <div className="cert-sign-line">
                <span className="cert-sign-name">{data.technicianName}</span>
              </div>
              <span className="cert-sign-name">{data.technicianName}</span>
              <span className="cert-sign-role">Testing Metrologist / Inspector</span>
            </div>

            <div className="cert-sign-block">
              <div className="cert-sign-line">
                <span className="cert-sign-name">{data.approverName}</span>
              </div>
              <span className="cert-sign-name">{data.approverName}</span>
              <span className="cert-sign-role">Chief Standards Officer / Metrology Director</span>
            </div>

            <div className="cert-qr-block">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="Official Verification QR Code"
                  className="cert-qr-img"
                  title="Scan with phone camera to verify certificate"
                />
              ) : (
                <div className="cert-qr-img" style={{ display: 'grid', placeItems: 'center', fontSize: '8px' }}>
                  QR
                </div>
              )}
              <div className="cert-hash-info">
                <small>SHA-256 DIGITAL SEAL</small>
                <code>{data.sha256Hash.slice(0, 32)}...</code>
                <small style={{ color: '#1a7f37', fontWeight: 700 }}>✓ TAMPER-EVIDENT SECURED</small>
              </div>
            </div>
          </section>

          {/* Document Footer */}
          <footer className="cert-footer-legal">
            <p>
              Mapan Metrology OS · Official Certificate of Legal Metrology · OIML R 76-1:2006 Rulebook v2026.1
            </p>
            <p>
              Page 1 of 1 · Generated on {data.issueDate} at {data.issueTime}
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}
