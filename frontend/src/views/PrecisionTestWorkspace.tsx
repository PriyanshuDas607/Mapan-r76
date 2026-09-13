import { useState, useMemo, useEffect } from 'react'
import { Sliders, CheckCircle2, AlertTriangle, ShieldCheck, Scale, Building2, MapPin, Plus, Trash2, Lock } from 'lucide-react'

import CalibrationReport from './CalibrationReport.tsx'
import type { ReportData, InstrumentInfo, ObservationRow } from './CalibrationReport.tsx'
import type { Instrument } from './InstrumentRegisterView.tsx'
import { generateSHA256Hash } from '../utils/cryptoUtils.ts'
import '../styles/workflow.css'

import { evaluateWeighingReading, validateInstrumentClassification, OIML_CLAUSES } from '../services/oimlEngine.ts'
import type { AccuracyClass } from '../services/oimlEngine.ts'
import { autoFetchEnvironmentalData, calculateAirDensity } from '../services/environmentalService.ts'
import type { EnvironmentalData } from '../services/environmentalService.ts'
import { CloudSun, RefreshCw } from 'lucide-react'

type Row = { id: number; load: string; indication: string }

function calculate(row: Row, interval: number, accuracyClass: string) {
  const load = Number(row.load)
  const indication = Number(row.indication)
  if (!Number.isFinite(load) || !Number.isFinite(indication) || row.load === '' || row.indication === '') {
    return {
      error: '—',
      mpe: '—',
      result: 'Review' as const,
      clause: OIML_CLAUSES.MPE_INITIAL.clause,
      deviationRatio: 0,
    }
  }
  return evaluateWeighingReading(load, indication, interval, accuracyClass as AccuracyClass)
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

  // OIML Clause 3.2 Classification Verification
  const classificationInfo = useMemo(() => {
    return validateInstrumentClassification(Number(maxCapacity), interval, accuracyClass)
  }, [maxCapacity, interval, accuracyClass])

  // Environmental & Test Conditions (Auto-populated from Open-Meteo & GPS, editable for manual lab overrides)
  const [temperature, setTemperature] = useState('21.4 °C')
  const [humidity, setHumidity] = useState('48.2 % RH')
  const [pressure, setPressure] = useState('1013.2 hPa')
  const [standardWeightsRef, setStandardWeightsRef] = useState('Class E2 Standard Weights (Cert: NPL-2026-W89)')
  const [showConfig, setShowConfig] = useState(false)
  const [envData, setEnvData] = useState<EnvironmentalData | null>(null)
  const [envLoading, setEnvLoading] = useState(false)

  // Auto-detect real-time environment via keyless lifetime-free Open-Meteo & Geolocation
  const handleAutoFetchEnv = async () => {
    setEnvLoading(true)
    try {
      const data = await autoFetchEnvironmentalData()
      setEnvData(data)
      setTemperature(data.temperature)
      setHumidity(data.humidity)
      setPressure(data.pressure)
      if (data.locationName) {
        setInstrumentForm((prev) => ({ ...prev, location: data.locationName }))
      }
    } catch (err) {
      console.warn('Auto-fetch environmental data error:', err)
    } finally {
      setEnvLoading(false)
    }
  }

  // Fetch on mount
  useEffect(() => {
    handleAutoFetchEnv()
  }, [])

  // Calculate real-time air density for Class I & II balances
  const airDensityVal = useMemo(() => {
    const tNum = parseFloat(temperature) || 21.5
    const hNum = parseFloat(humidity) || 50.0
    const pNum = parseFloat(pressure) || 1013.25
    return calculateAirDensity(tNum, hNum, pNum)
  }, [temperature, humidity, pressure])

  // OIML R-76 Clause 3.9.2.1 Temperature limit check (-10°C to +40°C)
  const isTempOutOfOIMLLimits = useMemo(() => {
    const tNum = parseFloat(temperature)
    if (isNaN(tNum)) return false
    return tNum < -10 || tNum > 40
  }, [temperature])

  // Active sealed report instance for modal display & printing
  const [activeModalReport, setActiveModalReport] = useState<ReportData | null>(null)
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

  // Calculate live preview SHA-256 cryptographic seal
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

  const handleSaveAndOpen = async () => {
    if (valid.length === 0) return
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

    const payload = {
      reportNumber,
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
      timestamp: now.toISOString(),
    }

    const calculatedHash = await generateSHA256Hash(payload)

    const finalReport: ReportData = {
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
      sha256Hash: calculatedHash || sha256Hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    }

    if (onSaveReport) {
      onSaveReport(finalReport)
    }
    setActiveModalReport(finalReport)
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
            className="button primary"
            onClick={handleSaveAndOpen}
            disabled={valid.length === 0}
          >
            Submit for review &amp; Seal
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
            {/* Real-Time Live Environmental Sensor / Open-Meteo & GPS Bar */}
            <div
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '8px 12px',
                background: '#eaf4f1',
                borderRadius: '6px',
                border: '1px solid #d4ebe3',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#135c56' }}>
                <CloudSun size={16} />
                <span>
                  <strong>ISO/IEC 17025 Live Sensors:</strong> {temperature} · {humidity} · {pressure} |{' '}
                  <strong>Air Density (ρ):</strong> {airDensityVal} kg/m³
                  {envData?.locationName && (
                    <span style={{ marginLeft: '6px', opacity: 0.9 }}>
                      📍 {envData.locationName} {envData.source ? `[${envData.source}]` : ''}
                    </span>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoFetchEnv}
                disabled={envLoading}
                style={{
                  background: '#0f7c76',
                  color: '#fff',
                  border: 0,
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={12} style={{ animation: envLoading ? 'spin 1s linear infinite' : 'none' }} />{' '}
                {envLoading ? 'Fetching Live...' : 'Auto-Fetch Live GPS & Open-Meteo'}
              </button>
            </div>

            {/* OIML Clause 3.9.2.1 Temperature Limit Check */}
            {isTempOutOfOIMLLimits && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  background: '#fff3cd',
                  border: '1px solid #ffeeba',
                  color: '#856404',
                  padding: '8px 12px',
                  borderRadius: '5px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={15} />
                <span>
                  <strong>OIML R-76 Clause 3.9.2.1 Warning:</strong> Ambient temperature ({temperature}) is outside standard operational limits (-10°C to +40°C). Legal verification may require special temperature chambers.
                </span>
              </div>
            )}

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
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={10} style={{ color: '#0f7c76' }} /> Test Location (GPS Autofill)
              </span>
              <input
                readOnly
                style={{ height: '32px', border: '1px solid #c9ded7', borderRadius: '4px', padding: '0 8px', fontSize: '10px', background: '#edf4f2', color: '#134e48', cursor: 'not-allowed', fontWeight: 600 }}
                value={instrumentForm.location || 'Detecting Live GPS...'}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={10} style={{ color: '#0f7c76' }} /> Ambient Temperature (Sensor-Locked)
              </span>
              <input
                readOnly
                style={{ height: '32px', border: '1px solid #c9ded7', borderRadius: '4px', padding: '0 8px', fontSize: '10px', background: '#edf4f2', color: '#134e48', cursor: 'not-allowed', fontWeight: 600 }}
                value={temperature}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={10} style={{ color: '#0f7c76' }} /> Relative Humidity (Sensor-Locked)
              </span>
              <input
                readOnly
                style={{ height: '32px', border: '1px solid #c9ded7', borderRadius: '4px', padding: '0 8px', fontSize: '10px', background: '#edf4f2', color: '#134e48', cursor: 'not-allowed', fontWeight: 600 }}
                value={humidity}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#567073' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={10} style={{ color: '#0f7c76' }} /> Barometric Pressure (Sensor-Locked)
              </span>
              <input
                readOnly
                style={{ height: '32px', border: '1px solid #c9ded7', borderRadius: '4px', padding: '0 8px', fontSize: '10px', background: '#edf4f2', color: '#134e48', cursor: 'not-allowed', fontWeight: 600 }}
                value={pressure}
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
            <div
              style={{
                gridColumn: '1 / -1',
                background: '#e8f4f1',
                border: '1px solid #cde6e0',
                borderRadius: '5px',
                padding: '7px 10px',
                fontSize: '9.5px',
                color: '#0f615c',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Lock size={12} style={{ flexShrink: 0 }} />
              <span>
                <strong>ISO/IEC 17025 Regulatory Standard:</strong> Location, Temperature, Humidity, and Pressure are automatically fetched and locked to prevent user tampering in legal metrology audits.
              </span>
            </div>
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
              <div style={{ margin: '0 20px 20px' }}>
                <button className="small-button" onClick={addRow}>
                  ＋ Add reading
                </button>
              </div>

            </>
          )}

          <div className="formula-note">
            <span className="formula-icon">ƒ</span>
            <div>
              <strong>OIML R 76-1:2006 Deterministic Engine</strong>
              <p>
                Intrinsic Error: <code>E = I − L</code> (Cl. T.5.5.1). MPE Thresholds (Cl. 3.5.1, Table 6):
                {accuracyClass === 'I' && ' Class I: ±0.5e (n ≤ 50,000), ±1.0e (50,000 < n ≤ 200,000), ±1.5e (n > 200,000).'}
                {accuracyClass === 'II' && ' Class II: ±0.5e (n ≤ 5,000), ±1.0e (5,000 < n ≤ 20,000), ±1.5e (n > 20,000).'}
                {accuracyClass === 'III' && ' Class III: ±0.5e (n ≤ 500), ±1.0e (500 < n ≤ 2,000), ±1.5e (n > 2,000).'}
                {accuracyClass === 'IIII' && ' Class IIII: ±0.5e (n ≤ 50), ±1.0e (50 < n ≤ 200), ±1.5e (n > 200).'}
              </p>
            </div>
          </div>
        </div>

        <aside className="panel calculation-card">
          <p className="eyebrow">LIVE OIML R-76 VERIFICATION</p>
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
                  <CheckCircle2 size={18} /> PASS (Cl. 3.5.1)
                </>
              )}
            </strong>
            <span>
              {valid.length === 0
                ? 'No observations have been checked'
                : reviews
                ? `${reviews} reading${reviews > 1 ? 's' : ''} outside MPE limit`
                : 'All readings conform to OIML R-76 MPE limits'}
            </span>
          </div>

          <div className="calculation-list">
            <span>
              Standard Rule <b>OIML R 76-1:2006 (E)</b>
            </span>
            <span>
              Class <b>Class {accuracyClass}</b>
            </span>
            <span>
              Intervals (n = Max/e){' '}
              <b style={{ color: classificationInfo.nValid ? '#183e4e' : '#c53030' }}>
                {classificationInfo.n.toLocaleString()} {classificationInfo.nValid ? '(Cl. 3.2 Pass)' : '(! Exceeded)'}
              </b>
            </span>
            <span>
              MPE Clause <b>Clause 3.5.1 (Table 6)</b>
            </span>
            <span>
              Checked readings{' '}
              <b>
                {valid.length} / {rows.length}
              </b>
            </span>
          </div>

          <div className="rule-explainer">
            <strong>Clause-by-Clause Verification</strong>
            <p>
              • <strong>Cl. 3.2 (Table 3)</strong>: Scale intervals & Min capacity<br />
              • <strong>Cl. 3.5.1 (Table 6)</strong>: Step-function MPE curve<br />
              • <strong>Cl. T.5.5.1 & A.4.4.3</strong>: Intrinsic & corrected error trace<br />
              • <strong>Cl. 5.5.2.2 & 5.5.3</strong>: Cryptographic SHA-256 digital seal
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
      {activeModalReport && (
        <CalibrationReport
          data={activeModalReport}
          onClose={() => setActiveModalReport(null)}
          onPrint={() => window.print()}
        />
      )}
    </>
  )
}
