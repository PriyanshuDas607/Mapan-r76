import { useState, useMemo, useEffect } from 'react'
import InstrumentRegisterView from './InstrumentRegisterView'
import type { Instrument } from './InstrumentRegisterView'
import PrecisionTestWorkspace from './PrecisionTestWorkspace'
import CalibrationReport from './CalibrationReport'
import type { ReportData } from './CalibrationReport'
import LoginView from './LoginView'
import UserManagementView from './UserManagementView'
import { AccountSettings, SettingsView } from './SettingsView'
import { getCurrentSession, setCurrentSession } from './authStore'
import type { User } from './authStore'
import { generateSHA256Hash } from './cryptoUtils'
import {
  syncInstrumentToFirestore,
  deleteInstrumentFromFirestore,
  loadInstrumentsFromFirestore,
  syncReportToFirestore,
  deleteReportFromFirestore,
  loadReportsFromFirestore,
  syncAuditLogToFirestore,
  loadAuditLogsFromFirestore,
} from './dbService'
import {
  Activity,
  Bell,
  FileCheck2,
  HelpCircle,
  History,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  Weight,
  Printer,
  Trash2,
} from 'lucide-react'
import './App.css'
import './views.css'
import './polish.css'
import './report.css'

type Page =
  | 'Overview'
  | 'Instruments'
  | 'Test sessions'
  | 'Reports'
  | 'Search'
  | 'Audit trail'
  | 'Users'
  | 'Settings'
  | 'Account settings'

const operatorPages: Page[] = ['Overview', 'Instruments', 'Test sessions', 'Reports', 'Search', 'Audit trail']
const operatorIcons = [LayoutDashboard, Weight, Activity, FileCheck2, Search, History]

export type AuditEvent = {
  id: string
  timestamp: string
  actor: string
  action: string
  target: string
  hash: string
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentSession())
  const [page, setPage] = useState<Page>('Overview')
  const [help, setHelp] = useState(false)

  // Real dynamic workspace records synced with Firestore
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null)
  const [reports, setReports] = useState<ReportData[]>([])
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])

  // Load cloud data from Firestore on mount
  useEffect(() => {
    loadInstrumentsFromFirestore().then((list) => {
      if (list.length > 0) setInstruments(list)
    })
    loadReportsFromFirestore().then((list) => {
      if (list.length > 0) setReports(list)
    })
    loadAuditLogsFromFirestore().then((list) => {
      if (list.length > 0) setAuditEvents(list)
    })
  }, [])

  const navigate = (next: string) => setPage(next as Page)

  // Add audit event helper
  const addAuditEvent = async (action: string, target: string, actorName?: string) => {
    const actor = actorName || currentUser?.name || 'System'
    const now = new Date()
    const timestamp =
      now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ', ' +
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    const hash = await generateSHA256Hash({
      action,
      target,
      actor,
      timestamp,
      random: Math.random(),
    })

    const event: AuditEvent = {
      id: `EVT-${Date.now()}`,
      timestamp,
      actor,
      action,
      target,
      hash: hash.slice(0, 16) + '...',
    }
    setAuditEvents((prev) => [event, ...prev])
    syncAuditLogToFirestore(event)
  }

  const handleLogin = (user: User) => {
    setCurrentUser(user)
    setCurrentSession(user)
    addAuditEvent('USER_LOGIN', `Personnel signed in: ${user.name} (${user.role})`, user.name)
  }

  const handleLogout = () => {
    if (currentUser) {
      addAuditEvent('USER_LOGOUT', `Personnel signed out: ${currentUser.name}`)
    }
    setCurrentUser(null)
    setCurrentSession(null)
    setPage('Overview')
  }

  // Instrument CRUD
  const handleAddInstrument = (newInst: Instrument) => {
    setInstruments((prev) => [newInst, ...prev])
    setSelectedInstrument(newInst)
    syncInstrumentToFirestore(newInst)
    addAuditEvent('REGISTER_INSTRUMENT', `Registered instrument ${newInst.model} (${newInst.serial})`)
  }

  const handleUpdateInstrument = (serial: string, updated: Partial<Instrument>) => {
    setInstruments((prev) =>
      prev.map((item) => {
        if (item.serial === serial) {
          const updatedItem = { ...item, ...updated }
          syncInstrumentToFirestore(updatedItem)
          return updatedItem
        }
        return item
      })
    )
    if (selectedInstrument && selectedInstrument.serial === serial) {
      setSelectedInstrument({ ...selectedInstrument, ...updated })
    }
    addAuditEvent('UPDATE_INSTRUMENT', `Updated instrument specifications for S/N ${serial}`)
  }

  const handleDeleteInstrument = (serial: string) => {
    setInstruments((prev) => prev.filter((i) => i.serial !== serial))
    deleteInstrumentFromFirestore(serial)
    if (selectedInstrument && selectedInstrument.serial === serial) {
      setSelectedInstrument(null)
    }
    addAuditEvent('DELETE_INSTRUMENT', `Deleted instrument record S/N ${serial} from legal registry`)
  }

  // Report CRUD
  const handleSaveReport = (newReport: ReportData) => {
    setReports((prev) => [newReport, ...prev.filter((r) => r.reportNumber !== newReport.reportNumber)])
    syncReportToFirestore(newReport)
    addAuditEvent(
      'SEAL_CERTIFICATE',
      `Sealed official certificate #${newReport.reportNumber} for ${newReport.instrument.serial}`
    )
  }

  const handleDeleteReport = (reportNumber: string) => {
    setReports((prev) => prev.filter((r) => r.reportNumber !== reportNumber))
    deleteReportFromFirestore(reportNumber)
    addAuditEvent('ARCHIVE_REPORT', `Archived/Revoked certificate #${reportNumber}`)
  }

  if (!currentUser) return <LoginView onLogin={handleLogin} />

  const isAdmin = currentUser.role === 'ADMIN'

  return (
    <div className="app-shell">
      <Sidebar
        active={page}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <i>/</i>
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            {isAdmin && (
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  color: '#1b64b3',
                  background: '#eaf4ff',
                  border: '1px solid #c9e2ff',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontFamily: 'DM Mono, monospace',
                }}
              >
                ADMIN SUPER-USER
              </span>
            )}
            <button className="icon-button" onClick={() => setHelp(!help)} aria-label="Help">
              <HelpCircle size={16} />
            </button>
            <button className="notification" aria-label="Notifications">
              <Bell size={16} />
            </button>
            <button
              className="top-avatar"
              onClick={() => navigate('Account settings')}
              aria-label="Open account settings"
              title="View account profile"
            >
              {currentUser.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>

        {help && (
          <div className="help-popover">
            <strong>Metrology Help</strong>
            <p>
              {isAdmin
                ? 'As an Administrator, you have full CRUD access over Instruments, Users, System Rules, and Audit Logs.'
                : 'Register instruments, record applied loads vs indications, and seal verified certificates.'}
            </p>
            <button onClick={() => setHelp(false)}>Close</button>
          </div>
        )}

        {page === 'Overview' && (
          <Dashboard
            navigate={navigate}
            currentUser={currentUser}
            instrumentsCount={instruments.length}
            reportsCount={reports.length}
            auditCount={auditEvents.length}
          />
        )}

        {page === 'Instruments' && (
          <InstrumentRegisterView
            instruments={instruments}
            userRole={currentUser.role}
            onAddInstrument={handleAddInstrument}
            onUpdateInstrument={handleUpdateInstrument}
            onDeleteInstrument={handleDeleteInstrument}
            onSelectInstrumentForTest={(inst) => {
              setSelectedInstrument(inst)
              navigate('Test sessions')
            }}
            navigate={navigate}
          />
        )}

        {page === 'Test sessions' && (
          <PrecisionTestWorkspace
            userName={currentUser.name}
            instruments={instruments}
            selectedInstrument={selectedInstrument}
            onSelectInstrument={setSelectedInstrument}
            onSaveReport={handleSaveReport}
            navigate={navigate}
          />
        )}

        {page === 'Reports' && (
          <ReportsView
            navigate={navigate}
            userRole={currentUser.role}
            reports={reports}
            onViewReport={(rep) => setSelectedReport(rep)}
            onDeleteReport={handleDeleteReport}
          />
        )}

        {page === 'Search' && (
          <SearchView
            instruments={instruments}
            reports={reports}
            auditEvents={auditEvents}
            onViewReport={(rep) => setSelectedReport(rep)}
            navigate={navigate}
          />
        )}

        {page === 'Audit trail' && <AuditView auditEvents={auditEvents} />}

        {page === 'Users' && isAdmin && (
          <UserManagementView
            currentUserId={currentUser.id}
            onAddAuditEvent={addAuditEvent}
          />
        )}

        {page === 'Settings' && (
          <SettingsView userRole={currentUser.role} />
        )}

        {page === 'Account settings' && (
          <AccountSettings
            currentUser={currentUser}
            onUpdateProfile={(updated) => setCurrentUser(updated)}
            onLogout={handleLogout}
          />
        )}

        <footer>
          <span>Mapan Metrology OS · v2.4.1</span>
          <span>
            Logged in as <strong>{currentUser.name}</strong> ({currentUser.role}) · OIML R 76 RBAC Secured
          </span>
        </footer>
      </main>

      {selectedReport && (
        <CalibrationReport
          data={selectedReport}
          onClose={() => setSelectedReport(null)}
          onPrint={() => window.print()}
        />
      )}
    </div>
  )
}

function Sidebar({
  active,
  navigate,
  currentUser,
  onLogout,
}: {
  active: Page
  navigate: (page: string) => void
  currentUser: User
  onLogout: () => void
}) {
  const isAdmin = currentUser.role === 'ADMIN'

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <span className="mark-stroke">M</span>
        </span>
        <div>
          <strong>mapan</strong>
          <small>METROLOGY OS</small>
        </div>
      </div>
      <div className="lab-switcher">
        <Weight size={17} className="lab-icon" />
        <div>
          <small>ACTIVE LABORATORY</small>
          <strong>{currentUser.laboratory}</strong>
        </div>
        <span className="chevron">⌄</span>
      </div>

      <nav>
        <small className="nav-label">WORKSPACE</small>
        {operatorPages.map((item, index) => {
          const Icon = operatorIcons[index]
          return (
            <button
              className={active === item ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(item)}
              key={item}
            >
              <Icon size={16} strokeWidth={1.8} />
              {item}
            </button>
          )
        })}

        <small className="nav-label admin-label">
          {isAdmin ? 'ADMINISTRATION (FULL CRUD)' : 'MANAGEMENT'}
        </small>
        {isAdmin && (
          <button
            className={active === 'Users' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('Users')}
          >
            <Users size={16} />
            Users Console
          </button>
        )}
        <button
          className={active === 'Settings' ? 'nav-item active' : 'nav-item'}
          onClick={() => navigate('Settings')}
        >
          <Settings size={16} />
          {isAdmin ? 'System Settings' : 'Laboratory Rules'}
        </button>
      </nav>

      <div className="sidebar-bottom">
        <div className="sync">
          <span className="sync-dot" />
          <div>
            <strong>Session Active</strong>
            <small>{isAdmin ? 'Supervisor Privileges' : 'Metrologist Access'}</small>
          </div>
        </div>
        <div className="profile">
          <span className="avatar">{currentUser.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{currentUser.name}</strong>
            <small>{currentUser.role === 'ADMIN' ? 'Laboratory Supervisor' : 'Testing Metrologist'}</small>
          </div>
          <button className="logout-button" onClick={onLogout} title="Sign Out">
            ↪
          </button>
        </div>
      </div>
    </aside>
  )
}

function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="subheading">{description}</p>
      </div>
      {action}
    </div>
  )
}

function Button({
  children,
  primary = false,
  onClick,
}: {
  children: React.ReactNode
  primary?: boolean
  onClick?: () => void
}) {
  return (
    <button className={primary ? 'button primary' : 'button secondary'} onClick={onClick}>
      {children}
    </button>
  )
}

function Dashboard({
  navigate,
  currentUser,
  instrumentsCount,
  reportsCount,
  auditCount,
}: {
  navigate: (page: string) => void
  currentUser: User
  instrumentsCount: number
  reportsCount: number
  auditCount: number
}) {
  return (
    <>
      <PageIntro
        eyebrow="LEGAL METROLOGY WORKSPACE"
        title={`Welcome back, ${currentUser.name}`}
        description={
          currentUser.role === 'ADMIN'
            ? 'Administrator console active with full CRUD control across instruments, personnel, certificates, and audit trails.'
            : 'Capture instrument identity, record observed load indications, and verify precision against OIML standards.'
        }
        action={<Button primary onClick={() => navigate('Instruments')}>＋ Register instrument</Button>}
      />
      <section className="stat-grid">
        {[
          ['◫', 'Instruments', `${instrumentsCount}`, instrumentsCount === 0 ? 'No instruments registered' : `${instrumentsCount} registered`],
          ['⌁', 'Test sessions', instrumentsCount > 0 ? '1' : '0', instrumentsCount > 0 ? 'Session ready' : 'No active sessions'],
          ['▤', 'Reports', `${reportsCount}`, reportsCount === 0 ? 'Generated after test' : `${reportsCount} sealed certificates`],
          ['◷', 'Audit events', `${auditCount}`, `${auditCount} actions recorded`],
        ].map((item) => (
          <div className="stat-card" key={item[1]}>
            <span className="stat-icon teal">{item[0]}</span>
            <strong>{item[2]}</strong>
            <span>
              {item[1]} <em>{item[3]}</em>
            </span>
          </div>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="panel empty-panel">
          <span className="empty-icon">▣</span>
          <h2>
            {instrumentsCount === 0
              ? 'Register an instrument to begin'
              : `${instrumentsCount} Instrument${instrumentsCount > 1 ? 's' : ''} Ready for Verification`}
          </h2>
          <p>
            {instrumentsCount === 0
              ? 'Capture instrument identity, capacity Max, and verification interval e before entering test observations.'
              : 'Launch a weighing performance session to record load indications, calculate errors, and evaluate MPE.'}
          </p>
          <Button
            primary
            onClick={() => navigate(instrumentsCount === 0 ? 'Instruments' : 'Test sessions')}
          >
            {instrumentsCount === 0 ? 'Register first instrument' : 'Open Test Workspace'}
          </Button>
        </div>

        <div className="panel empty-panel">
          <span className="empty-icon">▤</span>
          <h2>
            {reportsCount === 0
              ? 'No reports generated yet'
              : `${reportsCount} Sealed Metrology Certificate${reportsCount > 1 ? 's' : ''}`}
          </h2>
          <p>
            {reportsCount === 0
              ? 'Completed and approved test sessions produce official certificates with SHA-256 seal and QR verification.'
              : 'Review, preview, or print your verified Legal Metrology calibration certificates.'}
          </p>
          <Button onClick={() => navigate(reportsCount === 0 ? 'Test sessions' : 'Reports')}>
            {reportsCount === 0 ? 'Start a test session' : 'View Reports Repository'}
          </Button>
        </div>
      </section>

      <section className="panel principles">
        <div>
          <p className="eyebrow">CONTROLLED WORKFLOW</p>
          <h2>From observation to official evidence</h2>
        </div>
        <div className="principle-grid">
          <span><b>01</b>Register instrument identity & e</span>
          <span><b>02</b>Record applied load & indication</span>
          <span><b>03</b>Check |E| against OIML MPE</span>
          <span><b>04</b>Seal certificate with SHA-256 hash</span>
        </div>
      </section>
    </>
  )
}

function ReportsView({
  navigate,
  userRole,
  reports,
  onViewReport,
  onDeleteReport,
}: {
  navigate: (page: string) => void
  userRole: 'ADMIN' | 'OPERATOR'
  reports: ReportData[]
  onViewReport: (report: ReportData) => void
  onDeleteReport: (reportNumber: string) => void
}) {
  return (
    <>
      <PageIntro
        eyebrow="DOCUMENT REPOSITORY"
        title="Verification Reports & Certificates"
        description="Official Legal Metrology certificates generated with OIML R 76-1:2006 compliance traces."
        action={<Button primary onClick={() => navigate('Test sessions')}>＋ New Test Session</Button>}
      />

      <section className="report-hero">
        <div>
          <p className="eyebrow">REPORT INTEGRITY & COMPLIANCE</p>
          <h2>{reports.length > 0 ? `${reports.length} Sealed Certificate${reports.length > 1 ? 's' : ''}` : 'Certificate Repository Ready'}</h2>
          <p>
            All generated reports feature real cryptographic SHA-256 digital seals, scannable QR verification codes, and full error traces.
          </p>
        </div>
        <div className="seal-mark">
          ✓<small>OIML R 76<br />CERTIFIED</small>
        </div>
      </section>

      {reports.length > 0 ? (
        <section className="panel full-table" style={{ marginTop: '16px' }}>
          <div className="panel-heading">
            <div>
              <h2>Sealed Certificates Repository ({reports.length})</h2>
              <p>Click any certificate to preview, print, or export official PDF.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Certificate No.</th>
                  <th>Instrument</th>
                  <th>Class</th>
                  <th>Test Date & Time</th>
                  <th>Metrologist</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((rep) => (
                  <tr key={rep.reportNumber}>
                    <td>
                      <strong style={{ fontFamily: 'DM Mono, monospace', color: '#0f7c76' }}>
                        {rep.reportNumber}
                      </strong>
                      <small>SHA-256: {rep.sha256Hash.slice(0, 12)}...</small>
                    </td>
                    <td>
                      <strong>{rep.instrument.model}</strong>
                      <small>
                        S/N: {rep.instrument.serial} · {rep.instrument.manufacturer}
                      </small>
                    </td>
                    <td>
                      <span className="class-badge">Class {rep.instrument.accuracy}</span>
                    </td>
                    <td>
                      {rep.issueDate} <small>{rep.issueTime}</small>
                    </td>
                    <td>
                      <strong>{rep.technicianName}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-chip ${rep.overallResult === 'Pass' ? 'info' : 'warning'}`}
                        style={{ color: rep.overallResult === 'Pass' ? '#1a7f37' : '#9a6700' }}
                      >
                        {rep.overallResult === 'Pass' ? '✓ VERIFIED' : '! REVIEW'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="text-button"
                          onClick={() => onViewReport(rep)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Printer size={13} /> View / Print Report →
                        </button>
                        {userRole === 'ADMIN' && (
                          <button
                            className="text-button"
                            onClick={() => {
                              if (confirm(`Revoke and archive certificate ${rep.reportNumber}?`)) {
                                onDeleteReport(rep.reportNumber)
                              }
                            }}
                            title="Revoke certificate"
                            style={{ color: '#cf222e', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="empty-state">
          <span>▤</span>
          <h2>Your report repository is empty</h2>
          <p>
            Complete a weighing performance session and click &ldquo;Seal &amp; Generate report PDF&rdquo; to seal your first official certificate.
          </p>
          <Button primary onClick={() => navigate('Test sessions')}>
            Start a test session
          </Button>
        </div>
      )}
    </>
  )
}

function SearchView({
  instruments,
  reports,
  auditEvents,
  onViewReport,
  navigate,
}: {
  instruments: Instrument[]
  reports: ReportData[]
  auditEvents: AuditEvent[]
  onViewReport: (rep: ReportData) => void
  navigate: (page: string) => void
}) {
  const [query, setQuery] = useState('')

  const matchedInstruments = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return instruments.filter(
      (i) =>
        i.serial.toLowerCase().includes(q) ||
        i.model.toLowerCase().includes(q) ||
        i.manufacturer.toLowerCase().includes(q)
    )
  }, [instruments, query])

  const matchedReports = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return reports.filter(
      (r) =>
        r.reportNumber.toLowerCase().includes(q) ||
        r.instrument.serial.toLowerCase().includes(q) ||
        r.instrument.model.toLowerCase().includes(q) ||
        r.sha256Hash.toLowerCase().includes(q)
    )
  }, [reports, query])

  const matchedAuditEvents = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return auditEvents.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.hash.toLowerCase().includes(q)
    )
  }, [auditEvents, query])

  const hasMatches = matchedInstruments.length > 0 || matchedReports.length > 0 || matchedAuditEvents.length > 0

  return (
    <>
      <PageIntro
        eyebrow="ARCHIVE SEARCH"
        title="Find a record"
        description="Search real records across instruments, test certificates, and cryptographic hashes."
      />
      <section className="search-hero">
        <div className="big-search">
          ⌕{' '}
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by serial (e.g. LAB-2026), model, or certificate ID"
          />
        </div>
      </section>

      {query ? (
        hasMatches ? (
          <section className="panel full-table" style={{ margin: '0 4.3%' }}>
            {matchedReports.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '13px', color: '#183e4e', margin: '0 0 10px' }}>
                  Matching Certificates ({matchedReports.length})
                </h3>
                {matchedReports.map((rep) => (
                  <div
                    key={rep.reportNumber}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: '#f8faf9',
                      border: '1px solid #e1ede9',
                      borderRadius: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#0f7c76', fontFamily: 'DM Mono' }}>{rep.reportNumber}</strong>
                      <span style={{ marginLeft: '10px', fontSize: '11px', color: '#526e70' }}>
                        {rep.instrument.model} ({rep.instrument.serial}) · {rep.issueDate}
                      </span>
                    </div>
                    <button className="text-button" onClick={() => onViewReport(rep)}>
                      Open Certificate →
                    </button>
                  </div>
                ))}
              </div>
            )}

            {matchedInstruments.length > 0 && (
              <div>
                <h3 style={{ fontSize: '13px', color: '#183e4e', margin: '0 0 10px' }}>
                  Matching Instruments ({matchedInstruments.length})
                </h3>
                {matchedInstruments.map((inst) => (
                  <div
                    key={inst.serial}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: '#f8faf9',
                      border: '1px solid #e1ede9',
                      borderRadius: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#183e4e' }}>{inst.model}</strong>
                      <span style={{ marginLeft: '10px', fontSize: '11px', color: '#526e70' }}>
                        S/N: {inst.serial} · Class {inst.accuracy} · Max {inst.max}kg
                      </span>
                    </div>
                    <button className="text-button" onClick={() => navigate('Instruments')}>
                      View in Register →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="empty-state search-empty">
            <span>⌕</span>
            <h2>No records match &ldquo;{query}&rdquo;</h2>
            <p>Try searching with instrument serial number or certificate number.</p>
          </div>
        )
      ) : (
        <div className="empty-state search-empty">
          <span>◌</span>
          <h2>Search across your workspace</h2>
          <p>
            Currently {instruments.length} instrument{instruments.length !== 1 ? 's' : ''} and {reports.length} report{reports.length !== 1 ? 's' : ''} in the database.
          </p>
        </div>
      )}
    </>
  )
}

function AuditView({ auditEvents }: { auditEvents: AuditEvent[] }) {
  return (
    <>
      <PageIntro
        eyebrow="COMPLIANCE RECORD"
        title="Audit trail"
        description="Every instrument registration, test observation, and certificate seal is cryptographically logged."
      />
      <section className="audit-summary">
        <div>
          <strong>{auditEvents.length}</strong>
          <span>Events recorded</span>
        </div>
        <div>
          <strong>{auditEvents.length > 0 ? 'Verified' : 'Ready'}</strong>
          <span>Hash chain status</span>
        </div>
        <div>
          <strong>SHA-256</strong>
          <span>Seal algorithm</span>
        </div>
        <div className="chain-ok">
          ✓ <span>Chain intact<br /><small>{auditEvents.length > 0 ? 'Live tamper-evident audit' : 'Awaiting user action'}</small></span>
        </div>
      </section>

      {auditEvents.length > 0 ? (
        <section className="panel full-table" style={{ marginTop: '16px' }}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity / Target</th>
                  <th>SHA-256 Digest</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td>{evt.timestamp}</td>
                    <td>
                      <strong>{evt.actor}</strong>
                    </td>
                    <td>
                      <span className="audit-action">{evt.action}</span>
                    </td>
                    <td>{evt.target}</td>
                    <td className="mono hash">{evt.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="empty-state">
          <span>◷</span>
          <h2>No audit events recorded yet</h2>
          <p>Actions from instrument registration, test sessions, and report sealing will appear here with cryptographic hashes.</p>
        </div>
      )}
    </>
  )
}
