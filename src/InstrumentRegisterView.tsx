import { useState } from 'react'
import { Edit2, Trash2, Search } from 'lucide-react'
import './workflow.css'

export type Instrument = {
  serial: string
  model: string
  manufacturer: string
  accuracy: string
  status: string
  max: string
  interval: string
  location: string
  createdBy?: string
  createdByName?: string
  userEmail?: string
}

type Props = {
  instruments: Instrument[]
  userRole?: 'ADMIN' | 'OPERATOR'
  onAddInstrument: (instrument: Instrument) => void
  onUpdateInstrument?: (serial: string, updated: Partial<Instrument>) => void
  onDeleteInstrument?: (serial: string) => void
  onSelectInstrumentForTest: (instrument: Instrument) => void
  navigate: (page: string) => void
}

export default function InstrumentRegisterView({
  instruments,
  userRole = 'OPERATOR',
  onAddInstrument,
  onUpdateInstrument,
  onDeleteInstrument,
  onSelectInstrumentForTest,
  navigate,
}: Props) {
  const [open, setOpen] = useState(false)
  const [editingInst, setEditingInst] = useState<Instrument | null>(null)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('All classes')
  const [form, setForm] = useState<Instrument>({
    serial: '',
    model: '',
    manufacturer: '',
    accuracy: 'I',
    status: 'Active',
    max: '30.00',
    interval: '0.010',
    location: 'Central Standards Lab - Calibration Bay 04',
  })
  const [error, setError] = useState('')

  const update = (key: keyof Instrument, value: string) => setForm({ ...form, [key]: value })

  const submit = () => {
    if (!form.serial || !form.model || !form.manufacturer || !form.max || !form.interval) {
      setError('Serial, model, manufacturer, Max, and interval are required.')
      return
    }
    if (Number(form.max) <= 0 || Number(form.interval) <= 0 || Number(form.interval) > Number(form.max)) {
      setError('Max and interval must be positive, with interval no greater than Max.')
      return
    }
    onAddInstrument(form)
    setForm({
      serial: '',
      model: '',
      manufacturer: '',
      accuracy: 'I',
      status: 'Active',
      max: '',
      interval: '',
      location: '',
    })
    setError('')
    setOpen(false)
  }

  const handleSaveEdit = () => {
    if (!editingInst || !onUpdateInstrument) return
    onUpdateInstrument(editingInst.serial, editingInst)
    setEditingInst(null)
  }

  const handleDelete = (inst: Instrument) => {
    if (!onDeleteInstrument) return
    if (confirm(`Are you sure you want to delete instrument ${inst.model} (${inst.serial}) from the legal register?`)) {
      onDeleteInstrument(inst.serial)
    }
  }

  const filtered = instruments.filter((item) => {
    const matchesSearch =
      item.serial.toLowerCase().includes(search.toLowerCase()) ||
      item.model.toLowerCase().includes(search.toLowerCase()) ||
      item.manufacturer.toLowerCase().includes(search.toLowerCase())
    const matchesClass =
      classFilter === 'All classes' || `Class ${item.accuracy}` === classFilter
    return matchesSearch && matchesClass
  })

  const field = (
    key: keyof Instrument,
    label: string,
    placeholder: string,
    type = 'text'
  ) => (
    <label>
      {label}
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) => update(key, event.target.value)}
      />
    </label>
  )

  return (
    <>
      <div className="workflow-heading">
        <div>
          <p className="eyebrow">INSTRUMENT REPOSITORY · OIML R 76-1</p>
          <h1>Instrument Register</h1>
          <p className="subheading">
            Register, maintain, calibrate, and verify the legal metrology records of every instrument.
          </p>
        </div>
        <button className="button primary" onClick={() => setOpen(true)}>
          ＋ Register instrument
        </button>
      </div>

      <section className="view-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            placeholder="Search serial, model, or manufacturer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option>All classes</option>
          <option>Class I</option>
          <option>Class II</option>
          <option>Class III</option>
          <option>Class IIII</option>
        </select>
      </section>

      <section className="view-stats">
        <span>
          <b>{instruments.length}</b>Total instruments
        </span>
        <span>
          <b>{instruments.filter((item) => item.status === 'Active').length}</b>Active
        </span>
        <span>
          <b>{instruments.filter((item) => item.status === 'Re-verification').length}</b>Due for review
        </span>
        <span>
          <b>{instruments.filter((item) => item.status === 'Failed').length}</b>Failed
        </span>
      </section>

      <section className="panel full-table">
        <div className="panel-heading">
          <div>
            <h2>Instrument Registry ({instruments.length})</h2>
            <p>
              {instruments.length
                ? `${instruments.length} instrument record${instruments.length > 1 ? 's' : ''} saved in legal database.`
                : 'No instruments registered yet. Click below to register your first instrument.'}
            </p>
          </div>
        </div>

        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Class</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Location</th>
                  {userRole === 'ADMIN' && <th>Registered By</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.serial}>
                    <td>
                      <strong>{item.serial}</strong>
                      <small>
                        {item.manufacturer} · {item.model}
                      </small>
                    </td>
                    <td>
                      <span className="class-badge">Class {item.accuracy}</span>
                    </td>
                    <td>
                      {item.max} kg <small>e = {item.interval} kg</small>
                    </td>
                    <td>
                      <span className="status-chip info">
                        <i />
                        {item.status}
                      </span>
                    </td>
                    <td>{item.location || 'Not specified'}</td>
                    {userRole === 'ADMIN' && (
                      <td>
                        <strong style={{ fontSize: '11px', color: '#183e4e' }}>
                          {item.createdByName || 'Administrator'}
                        </strong>
                        {item.userEmail && (
                          <small style={{ display: 'block', fontSize: '10px', color: '#668087' }}>
                            {item.userEmail}
                          </small>
                        )}
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="text-button"
                          onClick={() => {
                            onSelectInstrumentForTest(item)
                            navigate('Test sessions')
                          }}
                        >
                          Start test →
                        </button>

                        {userRole === 'ADMIN' && (
                          <>
                            <button
                              className="text-button"
                              onClick={() => setEditingInst({ ...item })}
                              title="Edit instrument metadata"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                            <button
                              className="text-button"
                              onClick={() => handleDelete(item)}
                              title="Delete instrument"
                              style={{ color: '#cf222e', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state register-empty">
            <span>▣</span>
            <h2>{search ? 'No instruments match your search' : 'Your instrument register is empty'}</h2>
            <p>
              {search
                ? 'Try adjusting your search keywords or class filter.'
                : 'Capture identity and legal metrology parameters before entering observations.'}
            </p>
            <button className="button primary" onClick={() => setOpen(true)}>
              Register instrument
            </button>
          </div>
        )}
      </section>

      {/* Register Instrument Modal */}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <section className="register-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">NEW RECORD · STEP 1 OF 1</p>
                <h2>Register instrument</h2>
                <p>These values drive the later MPE and verification calculations.</p>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="form-grid">
              {field('serial', 'Serial number *', 'e.g. LAB-2026-007')}
              {field('model', 'Model designation *', 'e.g. MX-300 Precision')}
              {field('manufacturer', 'Manufacturer *', 'e.g. Mapan Metrology Ltd.')}
              <label>
                Accuracy class *
                <select value={form.accuracy} onChange={(event) => update('accuracy', event.target.value)}>
                  <option>I</option>
                  <option>II</option>
                  <option>III</option>
                  <option>IIII</option>
                </select>
              </label>
              {field('max', 'Maximum capacity, Max (kg) *', '30.00', 'number')}
              {field('interval', 'Verification interval, e (kg) *', '0.010', 'number')}
              <label className="wide">
                Installation site / Location
                <input
                  value={form.location}
                  placeholder="e.g. Calibration Bay 04"
                  onChange={(event) => update('location', event.target.value)}
                />
              </label>
            </div>
            {form.max && form.interval && Number(form.interval) > 0 && (
              <div className="derived-value">
                <span>Derived verification intervals</span>
                <strong>
                  n = Max ÷ e = {(Number(form.max) / Number(form.interval)).toLocaleString()}
                </strong>
              </div>
            )}
            {error && <div className="form-error">! {error}</div>}
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="button primary" onClick={submit}>
                Save instrument
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Edit Instrument Modal (Admin) */}
      {editingInst && (
        <div className="modal-backdrop" onClick={() => setEditingInst(null)}>
          <section className="register-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">ADMIN · EDIT INSTRUMENT RECORD</p>
                <h2>Edit {editingInst.model} ({editingInst.serial})</h2>
                <p>Modify legal metrology specifications.</p>
              </div>
              <button className="modal-close" onClick={() => setEditingInst(null)}>
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                Model designation
                <input
                  value={editingInst.model}
                  onChange={(e) => setEditingInst({ ...editingInst, model: e.target.value })}
                />
              </label>
              <label>
                Manufacturer
                <input
                  value={editingInst.manufacturer}
                  onChange={(e) => setEditingInst({ ...editingInst, manufacturer: e.target.value })}
                />
              </label>
              <label>
                Accuracy class
                <select
                  value={editingInst.accuracy}
                  onChange={(e) => setEditingInst({ ...editingInst, accuracy: e.target.value })}
                >
                  <option>I</option>
                  <option>II</option>
                  <option>III</option>
                  <option>IIII</option>
                </select>
              </label>
              <label>
                Max capacity (kg)
                <input
                  type="number"
                  value={editingInst.max}
                  onChange={(e) => setEditingInst({ ...editingInst, max: e.target.value })}
                />
              </label>
              <label>
                Verification interval, e (kg)
                <input
                  type="number"
                  value={editingInst.interval}
                  onChange={(e) => setEditingInst({ ...editingInst, interval: e.target.value })}
                />
              </label>
              <label className="wide">
                Location
                <input
                  value={editingInst.location}
                  onChange={(e) => setEditingInst({ ...editingInst, location: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setEditingInst(null)}>
                Cancel
              </button>
              <button className="button primary" onClick={handleSaveEdit}>
                Save Changes
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
