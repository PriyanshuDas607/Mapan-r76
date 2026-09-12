import { useState, useMemo, useEffect } from 'react'
import { FileText, Printer, Sliders, CheckCircle2, AlertTriangle, ShieldCheck, Scale, Building2, MapPin, Plus, Trash2 } from 'lucide-react'
import CalibrationReport from './CalibrationReport'
import type { ReportData, InstrumentInfo, ObservationRow } from './CalibrationReport'
import type { Instrument } from './InstrumentRegisterView'
import { generateSHA256Hash } from './cryptoUtils'
import './workflow.css'

type Row = { id: number; load: string; indication: string }

function mpeFor(load: number, interval: number, accuracyClass: string) {
  const n = interval > 0 ? load / interval : 0
  const first = accuracyClass === 'I' ? 500 : accuracyClass === 'II' ? 2000 : 500
  const second = accuracyClass === 'I' ? 2000 : accuracyClass === 'II' ? 10000 : 2000
  return n <= first ? interval * 0.5 : n <= second ? interval : interval * 1.5
}

function calculate(row: Row, interval: number, accuracyClass: string) {
  const load = Number(row.load)
  const indication = Number(row.indication)
  if (!Number.isFinite(load) || !Number.isFinite(indication) || row.load === '' || row.indication === '') {
    return { error: '—', mpe: '—', result: 'Review' as const }
  }
  const error = indication - load
  const mpe = mpeFor(load, interval, accuracyClass)
  return {
    error: `${error >= 0 ? '+' : ''}${error.toFixed(3)}`,
    mpe: `±${mpe.toFixed(3)}`,
    result: Math.abs(error) <= mpe ? ('Pass' as const) : ('Review' as const),
  }
}

type Props = {
  userName?: string
  instruments?: Instrument[]
  selectedInstrument?: Instrument | null
  onSelectInstrument?: (instrument: Instrument | null) => void
  onSaveReport?: (report: ReportData) => void
  navigate?: (page: string) => void
}

export default function PrecisionTestWorkspace({
  userName = 'Ananya Rao',
  instruments = [],
  selectedInstrument,
  onSelectInstrument,
  onSaveReport,
  navigate,
}: Props) {
  const [tab, setTab] = useState('Weighing performance')
  // Rows start clean & empty without hardcoded readings
  const [rows, setRows] = useState<Row[]>([])
  
  // Custom manual mode toggle if no instrument is registered
  const [manualMode, setManualMode] = useState(false)

  // Determine current active instrument
  const activeInst: Instrument | null = useMemo(() => {
    if (selectedInstrument) return selectedInstrument
    if (instruments.length > 0) return instruments[0]
    return null
  }, [selectedInstrument, instruments])

  // Instrument parameters
  const [instrumentForm, setInstrumentForm] = useState<InstrumentInfo>({
    serial: '',
    model: '',
    manufacturer: '',
    accuracy: 'I',
    max: '30.00',
    interval: '0.010',
    division: '0.001 kg',
    location: '',
    customer: 'National Legal Metrology Directorate',
  })

  // Sync with active instrument
  useEffect(() => {
    if (activeInst) {
      setInstrumentForm({
        serial: activeInst.serial,
        model: activeInst.model,
        manufacturer: activeInst.manufacturer,
        accuracy: activeInst.accuracy,
        max: activeInst.max,
        interval: activeInst.interval,
        division: (Number(activeInst.interval) / 10).toFixed(3) + ' kg',
        location: activeInst.location || 'Central Standards Lab - Calibration Bay 04',
        customer: 'National Legal Metrology Directorate',
      })
    }
  }, [activeInst])

  const interval = Number(instrumentForm.interval) || 0.01
  const accuracyClass = instrumentForm.accuracy || 'I'
  const maxCapacity = instrumentForm.max || '30.00'

  // Environmental & Test Conditions
  const [temperature, setTemperature] = useState('21.4 °C')
  const [humidity, setHumidity] = useState('48.2 % RH')
  const [pressure, setPressure] = useState('1013.2 hPa')
  const [standardWeightsRef, setStandardWeightsRef] = useState('Class E2 Standard Weights (Cert: NPL-2026-W89)')
  const [showConfig, setShowConfig] = useState(false)

  // Report Modal & SHA-256 Hash
  const [showReportModal, setShowReportModal] = useState(false)
  const [sha256Hash, setSha256Hash] = useState('')

  const update = (id: number, key: 'load' | 'indication', value: string) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)))
  }

  const addRow = () => {
    const nextId = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) + 1 : 1
    setRows([...rows, { id: nextId, load: '', indication: '' }])
  }

  const removeRow = (id: number) => {
    setRows(rows.filter((r) => r.id !== id))
  }

  const computed = rows.map((row) => calculate(row, interval, accuracyClass))
  const valid = computed.filter((item) => item.error !== '—')
  const reviews = valid.filter((item) => item.result === 'Review').length
  const overallResult: 'Pass' | 'Review' = valid.length > 0 && reviews === 0 ? 'Pass' : 'Review'

  // Calculate real SHA-256 cryptographic seal
  useEffect(() => {
    const payload = {
      instrument: {
        serial: instrumentForm.serial || 'UNREGISTERED',
        model: instrumentForm.model || 'Custom Balance',
        manufacturer: instrumentForm.manufacturer || 'General',
        accuracy: accuracyClass,
        max: maxCapacity,
        interval: interval,
      },
      readings: rows.map((r) => ({ load: r.load, indication: r.indication })),
      conditions: { temperature, humidity, pressure, standardWeightsRef },
      operator: userName,
      result: overallResult,
      timestamp: new Date().toISOString(),
    }
    generateSHA256Hash(payload).then((hash) => setSha256Hash(hash))
  }, [instrumentForm, accuracyClass, maxCapacity, interval, rows, temperature, humidity, pressure, standardWeightsRef, userName, overallResult])

  // Construct structured Report Data
  const reportData: ReportData = useMemo(() => {
    const now = new Date()
    const issueDate = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    const issueTime = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const reportNumber = `MPN-CERT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`

    const observationRows: ObservationRow[] = rows.map((row, idx) => {
      const calc = computed[idx]
      return {
        id: row.id,
        load: row.load,
        indication: row.indication,
        error: calc.error,
        mpe: calc.mpe,
        result: calc.result,
      }
    })

    return {
      reportNumber,
      issueDate,
      issueTime,
      technicianName: userName,
      approverName: 'Dr. Vikram Mehta (Chief Metrologist)',
      temperature,
      humidity,
      pressure,
      standardWeightsRef,
      instrument: {
        ...instrumentForm,
        accuracy: accuracyClass,
        max: maxCapacity,
        interval: interval.toString(),
      },
      observations: observationRows,
      overallResult,
      sha256Hash: sha256Hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    }
  }, [rows, computed, interval, accuracyClass, maxCapacity, instrumentForm, temperature, humidity, pressure, standardWeightsRef, userName, overallResult, sha256Hash])

  const openReport = () => {
    if (valid.length === 0) return
    setShowReportModal(true)
  }

  const handleSaveAndOpen = () => {
    if (valid.length === 0) return
    if (onSaveReport) onSaveReport(reportData)
    setShowReportModal(true)
  }

  // If no instrument registered and manual mode not active, prompt user cleanly
  if (instruments.length === 0 && !manualMode) {
    return (
      <>
        <div className="workflow-heading">
          <div>
            <p className="eyebrow">TEST EXECUTION · NEW SESSION</p>
            <h1>Weighing Performance Workspace</h1>
            <p className="subheading">
              Select or register an instrument to begin entering verified observations according to OIML R 76-1.
            </p>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-icon" style={{ width: 45, height: 45, margin: '0 auto 12px' }}>
            <Scale size={24} />
          </div>
          <h2>No Registered Instrument Selected</h2>
          <p style={{ maxWidth: '480px' }}>
            To perform a legal metrology test and compute error vs MPE tolerances, you must first register an instrument or enter custom parameters.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button
              className="button primary"
              onClick={() => navigate && navigate('Instruments')}
            >
              ＋ Register Instrument First
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setInstrumentForm({
                  serial: 'CUSTOM-001',
                  model: 'Standard Precision Balance',
                  manufacturer: 'Laboratory Equipment',
                  accuracy: 'I',
                  max: '30.00',
                  interval: '0.010',
                  division: '0.001 kg',
                  location: 'Standards Lab - Calibration Bay 04',
                  customer: 'National Metrology Directorate',
                })
                setManualMode(true)
              }}
            >
              Enter Custom Instrument Details
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="workflow-heading">
        <div>
          <p className="eyebrow">
            TEST EXECUTION · {instrumentForm.serial ? `INSTRUMENT ${instrumentForm.serial}` : 'ACTIVE SESSION'}
          </p>
          <h1>Weighing performance & Verification</h1>
          <p className="subheading">
            {instrumentForm.serial ? (
              <>
                Testing <strong>{instrumentForm.model}</strong> ({instrumentForm.serial}) · Class {accuracyClass} · Max {maxCapacity} kg (e = {interval} kg).
              </>
            ) : (
              'Enter observations for the selected instrument. The calculation trace updates dynamically.'
            )}
          </p>
        </div>
        <div className="session-actions">
          <span className="save-state">
            <i />
            Autosaved
          </span>
          <button
            className="button secondary"
            onClick={openReport}
            disabled={valid.length === 0}
            title={valid.length === 0 ? 'Enter at least 1 reading to generate report' : 'Generate structured certificate'}
          >
            <FileText size={14} style={{ marginRight: '5px' }} />
            ⇧ Generate PDF report
          </button>
          <button
            className="button primary"
            onClick={handleSaveAndOpen}
            disabled={valid.length === 0}
          >
            Submit for review & Seal
          </button>
        </div>
      </div>

      {/* Instrument Selection & Metadata Header Bar */}
      <div style={{ margin: '0 4.3% 14px' }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2eae7',
            borderRadius: '8px',
            padding: '14px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Instrument Selector Dropdown */}
            {instruments.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    background: '#e5f3ef',
                    color: '#0f7c76',
                    borderRadius: '6px',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Scale size={18} />
                </div>
                <div>
                  <span style={{ fontSize: '9px', color: '#889897', fontFamily: 'DM Mono, monospace', display: 'block' }}>
                    SELECT INSTRUMENT
                  </span>
                  <select
                    style={{
                      height: '28px',
                      border: '1px solid #d0dfdb',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#183e4e',
                      background: '#f8faf9',
                      padding: '0 8px',
                    }}
                    value={activeInst ? activeInst.serial : ''}
                    onChange={(e) => {
                      const found = instruments.find((inst) => inst.serial === e.target.value)
                      if (found && onSelectInstrument) onSelectInstrument(found)
                    }}
                  >
                    {instruments.map((inst) => (
                      <option key={inst.serial} value={inst.serial}>
                        {inst.model} ({inst.serial})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  background: '#eef3f7',
                  color: '#2a637d',
                  borderRadius: '6px',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Building2 size={18} />
              </div>
              <div>
                <span style={{ fontSize: '9px', color: '#889897', fontFamily: 'DM Mono, monospace', display: 'block' }}>
                  MANUFACTURER
                </span>
                <strong style={{ fontSize: '11px', color: '#183e4e' }}>
                  {instrumentForm.manufacturer || 'Not Specified'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  background: '#f7f1e6',
                  color: '#936a21',
                  borderRadius: '6px',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <MapPin size={18} />
              </div>
              <div>
                <span style={{ fontSize: '9px', color: '#889897', fontFamily: 'DM Mono, monospace', display: 'block' }}>
                  TEST LOCATION
                </span>
                <strong style={{ fontSize: '11px', color: '#183e4e' }}>
                  {instrumentForm.location || 'Calibration Bay 04'}
                </strong>
              </div>
            </div>
          </div>

          <button
            className="small-button"
            onClick={() => setShowConfig(!showConfig)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Sliders size={13} /> {showConfig ? 'Hide test parameters' : 'Edit instrument & test parameters'}
          </button>
        </div>

        {/* Expandable Parameter Editor */}
        {showConfig && (
          <div
            style={{
              background: '#f8faf9',
              border: '1px solid #dbe7e3',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              padding: '16px 18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              Serial Number
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                value={instrumentForm.serial}
                onChange={(e) => setInstrumentForm({ ...instrumentForm, serial: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              Model Designation
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                value={instrumentForm.model}
                onChange={(e) => setInstrumentForm({ ...instrumentForm, model: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              Manufacturer
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                value={instrumentForm.manufacturer}
                onChange={(e) => setInstrumentForm({ ...instrumentForm, manufacturer: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              Max Capacity (kg)
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                type="number"
                value={instrumentForm.max}
                onChange={(e) => setInstrumentForm({ ...instrumentForm, max: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              Ambient Temperature
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              Relative Humidity
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                value={humidity}
                onChange={(e) => setHumidity(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              Barometric Pressure
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                value={pressure}
                onChange={(e) => setPressure(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073', gridColumn: 'span 2' }}>
              Reference Standards Ref
              <input
                style={{ height: '32px', border: '1px solid #d4e2de', borderRadius: '4px', padding: '0 8px', fontSize: '10px' }}
                value={standardWeightsRef}
                onChange={(e) => setStandardWeightsRef(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      <section className="test-layout">
        <div className="panel test-card">
          <div className="tabs">
            {['Overview', 'Weighing performance', 'Eccentricity', 'Repeatability'].map((item) => (
              <button
                className={tab === item ? 'tab active' : 'tab'}
                onClick={() => setTab(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="test-controls">
            <label>
              Accuracy class
              <select
                value={accuracyClass}
                onChange={(event) =>
                  setInstrumentForm({ ...instrumentForm, accuracy: event.target.value })
                }
              >
                <option>I</option>
                <option>II</option>
                <option>III</option>
                <option>IIII</option>
              </select>
            </label>
            <label>
              Verification interval, e (kg)
              <input
                type="number"
                min="0.0001"
                step="0.001"
                value={interval}
                onChange={(event) =>
                  setInstrumentForm({ ...instrumentForm, interval: event.target.value })
                }
              />
            </label>
            <div className="rule-chip">OIML R 76-1:2006 · MPE active</div>
          </div>

          {rows.length === 0 ? (
            <div className="reading-empty">
              <span>⌁</span>
              <h3>No observations entered yet</h3>
              <p>
                Enter the standard applied load and observed indication for each test load point. Errors and MPE will calculate in real-time.
              </p>
              <button className="button primary" onClick={addRow} style={{ marginTop: '8px' }}>
                <Plus size={14} style={{ marginRight: '4px' }} /> Add first reading
              </button>
            </div>
          ) : (
            <>
              <div className="reading-table precision-table">
                <div className="reading-row reading-header">
                  <span>#</span>
                  <span>Applied load (kg)</span>
                  <span>Indication (kg)</span>
                  <span>Error (I − L)</span>
                  <span>MPE</span>
                  <span>Result</span>
                </div>
                {rows.map((row, index) => {
                  const result = computed[index]
                  return (
                    <div className="reading-row" key={row.id}>
                      <span className="row-number">{String(index + 1).padStart(2, '0')}</span>
                      <span>
                        <input
                          value={row.load}
                          placeholder="e.g. 5.00"
                          type="number"
                          step="any"
                          onChange={(event) => update(row.id, 'load', event.target.value)}
                        />
                      </span>
                      <span>
                        <input
                          value={row.indication}
                          placeholder="e.g. 5.004"
                          type="number"
                          step="any"
                          onChange={(event) => update(row.id, 'indication', event.target.value)}
                        />
                      </span>
                      <span className={result.result === 'Review' ? 'error-value' : ''}>
                        {result.error}
                      </span>
                      <span>{result.mpe}</span>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          className={`result-pill ${
                            result.result === 'Pass' ? 'result-pass' : 'result-review'
                          }`}
                        >
                          {result.result === 'Pass' ? '✓ Pass' : '! Review'}
                        </span>
                        <button
                          onClick={() => removeRow(row.id)}
                          style={{
                            border: 0,
                            background: 'transparent',
                            color: '#9ba8a6',
                            cursor: 'pointer',
                            padding: '2px 4px',
                          }}
                          title="Remove reading"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '10px', margin: '0 20px 20px' }}>
                <button className="small-button" onClick={addRow}>
                  ＋ Add reading
                </button>
                <button
                  className="small-button"
                  onClick={openReport}
                  disabled={valid.length === 0}
                  style={{ background: '#e9f4f1' }}
                >
                  <Printer size={13} style={{ marginRight: '4px' }} /> Preview & Print Certificate
                </button>
              </div>
            </>
          )}

          <div className="formula-note">
            <span className="formula-icon">ƒ</span>
            <div>
              <strong>How precision is checked</strong>
              <p>
                Error E = indication I − applied load L. Pass when |E| ≤ MPE. MPE is selected from load/e interval region and accuracy class according to OIML R 76-1.
              </p>
            </div>
          </div>
        </div>

        <aside className="panel calculation-card">
          <p className="eyebrow">LIVE CALCULATION</p>
          <h2>Precision result</h2>
          <div className={reviews ? 'result-summary review-summary' : 'result-summary'}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {valid.length === 0 ? (
                'AWAITING DATA'
              ) : reviews ? (
                <>
                  <AlertTriangle size={18} /> REVIEW
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} /> PASS
                </>
              )}
            </strong>
            <span>
              {valid.length === 0
                ? 'No observations have been checked'
                : reviews
                ? `${reviews} reading${reviews > 1 ? 's' : ''} outside MPE limit`
                : 'All readings within MPE limits'}
            </span>
          </div>

          <div className="calculation-list">
            <span>
              Applied rule <b>OIML R 76-1:2006</b>
            </span>
            <span>
              Class <b>Class {accuracyClass}</b>
            </span>
            <span>
              Verification interval <b>{interval || '—'} kg</b>
            </span>
            <span>
              Checked readings{' '}
              <b>
                {valid.length} / {rows.length}
              </b>
            </span>
          </div>

          <div className="rule-explainer">
            <strong>MPE selection criteria</strong>
            <p>
              For Class {accuracyClass}, n = load ÷ e. The first region uses MPE = 0.5e; the second uses 1e; the final region uses 1.5e.
            </p>
          </div>

          <button
            className="button primary wide-button"
            onClick={handleSaveAndOpen}
            disabled={valid.length === 0}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
          >
            <ShieldCheck size={16} /> Seal & Generate report PDF
          </button>
        </aside>
      </section>

      {/* Official Certificate Modal / Print Target */}
      {showReportModal && (
        <CalibrationReport
          data={reportData}
          onClose={() => setShowReportModal(false)}
          onPrint={() => window.print()}
        />
      )}
    </>
  )
}
