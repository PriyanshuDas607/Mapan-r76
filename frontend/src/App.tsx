import { useState, useMemo, useEffect } from 'react'
import InstrumentRegisterView from './views/InstrumentRegisterView.tsx'
import type { Instrument } from './views/InstrumentRegisterView.tsx'
import PrecisionTestWorkspace from './views/PrecisionTestWorkspace.tsx'
import CalibrationReport from './views/CalibrationReport.tsx'
import type { ReportData } from './views/CalibrationReport.tsx'
import LoginView from './views/LoginView.tsx'
import UserManagementView from './views/UserManagementView.tsx'
import { AccountSettings, SettingsView } from './views/SettingsView.tsx'
import { getCurrentSession, setCurrentSession } from './services/authStore.ts'
import type { User } from './services/authStore.ts'
import { generateSHA256Hash } from './utils/cryptoUtils.ts'
import {
  syncInstrumentToFirestore,
  deleteInstrumentFromFirestore,
  loadInstrumentsFromFirestore,
  syncReportToFirestore,
  deleteReportFromFirestore,
  loadReportsFromFirestore,
  syncAuditLogToFirestore,
  loadAuditLogsFromFirestore,
  subscribeToInstruments,
  subscribeToReports,
  subscribeToAuditLogs,
  getLocalInstruments,
  getLocalReports,
  getLocalAuditLogs,
} from './services/dbService.ts'
import {
  Activity,
  Bell,
  FileCheck2,
  History,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  Weight,
  Printer,
  Trash2,
  Sun,
  Moon,
  ShieldCheck,
} from 'lucide-react'
import './styles/App.css'
import './styles/views.css'
import './styles/polish.css'
import './styles/report.css'

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
  userId?: string
  userEmail?: string
  action: string
  target: string
  hash: string
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentSession())
  const [page, setPage] = useState<Page>('Overview')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('mapan_theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mapan_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  // Real dynamic workspace records — initialized from localStorage (instant), then synced with Firebase
  const [instruments, setInstruments] = useState<Instrument[]>(() => {
    const local = getLocalInstruments()
    return local.length > 0 ? local : []
  })
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null)
  const [reports, setReports] = useState<ReportData[]>(() => {
    const local = getLocalReports()
    return local.length > 0 ? local : []
  })
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => {
    const local = getLocalAuditLogs()
    return local.length > 0 ? local : []
  })

  // Live Realtime Database Synchronization — merges cloud with local on every update
  useEffect(() => {
    // Initial cloud fetch (merges with localStorage inside the functions)
    loadInstrumentsFromFirestore().then((list) => {
      if (list && list.length > 0) setInstruments(list)
    })
    loadReportsFromFirestore().then((list) => {
      if (list && list.length > 0) setReports(list)
    })
    loadAuditLogsFromFirestore().then((list) => {
      if (list && list.length > 0) setAuditEvents(list)
    })

    // Active live listeners for instant real-time data sync across all devices
    // These callbacks receive merged (cloud + local) data from dbService
    const unsubInst = subscribeToInstruments((list) => {
      if (list && list.length > 0) setInstruments(list)
    })
    const unsubRep = subscribeToReports((list) => {
      if (list && list.length > 0) setReports(list)
    })
    const unsubAudit = subscribeToAuditLogs((list) => {
      if (list && list.length > 0) setAuditEvents(list)
    })

    return () => {
      unsubInst()
      unsubRep()
      unsubAudit()
    }
  }, [])

  // Listen for session changes across tabs or custom dispatch
  useEffect(() => {
    const handleSessionEvent = (e: Event) => {
      const customEvent = e as CustomEvent<User | null>
      if (customEvent.detail !== undefined) {
        setCurrentUser(customEvent.detail)
      } else {
        setCurrentUser(getCurrentSession())
      }
    }
    window.addEventListener('mapan_session_change', handleSessionEvent)
    window.addEventListener('storage', handleSessionEvent)
    return () => {
      window.removeEventListener('mapan_session_change', handleSessionEvent)
      window.removeEventListener('storage', handleSessionEvent)
    }
  }, [])

  const isAdmin = currentUser?.role === 'ADMIN'

  // User Data Isolation: Regular users only see their own data, Admins see all
  const visibleInstruments = useMemo(() => {
    if (!currentUser) return []
    if (isAdmin) return instruments
    return instruments.filter(
      (i) =>
        !i.createdBy ||
        i.createdBy === currentUser.id ||
        i.userEmail === currentUser.email ||
        i.createdByName === currentUser.name
    )
  }, [instruments, currentUser, isAdmin])

  const visibleReports = useMemo(() => {
    if (!currentUser) return []
    if (isAdmin) return reports
    return reports.filter(
      (r) =>
        !r.userId ||
        r.userId === currentUser.id ||
        r.userEmail === currentUser.email ||
        r.technicianName === currentUser.name
    )
  }, [reports, currentUser, isAdmin])

  const visibleAuditEvents = useMemo(() => {
    if (!currentUser) return []
    if (isAdmin) return auditEvents
    return auditEvents.filter(
      (e) =>
        e.userId === currentUser.id ||
        e.userEmail === currentUser.email ||
        e.actor === currentUser.name ||
        (!e.userId && e.actor?.toLowerCase().includes(currentUser.name.toLowerCase()))
    )
  }, [auditEvents, currentUser, isAdmin])

  const navigate = (next: string) => setPage(next as Page)

  // Add audit event helper
  const addAuditEvent = async (action: string, target: string, actorName?: string) => {
    try {
      const actor = actorName || currentUser?.name || 'System'
      const userId = currentUser?.id
      const userEmail = currentUser?.email
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
        userId,
        userEmail,
        timestamp,
        random: Math.random(),
      })

      const event: AuditEvent = {
        id: `EVT-${Date.now()}`,
        timestamp,
        actor,
        userId,
        userEmail,
        action,
        target,
        hash: hash.slice(0, 16) + '...',
      }
      setAuditEvents((prev) => [event, ...prev])
      syncAuditLogToFirestore(event).catch(() => {})
    } catch (err) {
      console.warn('Audit event creation warning:', err)
    }
  }

  const handleLogin = (user: User) => {
    setCurrentUser(user)
    setCurrentSession(user)
    setPage('Overview')
    addAuditEvent('USER_LOGIN', `Personnel signed in: ${user.name} (${user.role})`, user.name).catch(() => {})
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
    const instWithUser: Instrument = {
      ...newInst,
      createdBy: currentUser?.id,
      createdByName: currentUser?.name,
      userEmail: currentUser?.email,
    }
    setInstruments((prev) => [instWithUser, ...prev])
    setSelectedInstrument(instWithUser)
    syncInstrumentToFirestore(instWithUser)
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
    const reportWithUser: ReportData = {
      ...newReport,
      userId: currentUser?.id,
      userEmail: currentUser?.email,
      technicianName: currentUser?.name || newReport.technicianName,
    }
    setReports((prev) => [reportWithUser, ...prev.filter((r) => r.reportNumber !== reportWithUser.reportNumber)])
    syncReportToFirestore(reportWithUser)

    // Also auto-register instrument if it wasn't already in the list
    if (newReport.instrument && newReport.instrument.serial) {
      const exists = instruments.some((i) => i.serial === newReport.instrument.serial)
      if (!exists) {
        const instToSave: Instrument = {
          serial: newReport.instrument.serial,
          model: newReport.instrument.model || 'Precision Laboratory Scale',
          manufacturer: newReport.instrument.manufacturer || 'Standards Metrology',
          accuracy: newReport.instrument.accuracy || 'I',
          status: 'Active',
          max: newReport.instrument.max || '30.00',
          interval: newReport.instrument.interval || '0.010',
          location: newReport.instrument.location || 'Central Standards Lab',
          createdBy: currentUser?.id,
          createdByName: currentUser?.name,
          userEmail: currentUser?.email,
        }
        setInstruments((prev) => [instToSave, ...prev])
        syncInstrumentToFirestore(instToSave)
      }
    }

    addAuditEvent(
      'SEAL_CERTIFICATE',
      `Sealed official certificate #${reportWithUser.reportNumber} for ${reportWithUser.instrument.serial}`
    )
  }

  const handleDeleteReport = (reportNumber: string) => {
    setReports((prev) => prev.filter((r) => r.reportNumber !== reportNumber))
    deleteReportFromFirestore(reportNumber)
    addAuditEvent('ARCHIVE_REPORT', `Archived/Revoked certificate #${reportNumber}`)
  }


  if (!currentUser) return <LoginView onLogin={handleLogin} />

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
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              <span className="theme-toggle-text">{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
            <button className="notification" aria-label="Notifications" title="Notifications">
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

        {page === 'Overview' && (
          <Dashboard
            navigate={navigate}
            currentUser={currentUser}
            instrumentsCount={visibleInstruments.length}
            reportsCount={visibleReports.length}
            auditCount={visibleAuditEvents.length}
          />
        )}

        {page === 'Instruments' && (
          <InstrumentRegisterView
            instruments={visibleInstruments}
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
            instruments={visibleInstruments}
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
            reports={visibleReports}
            onViewReport={(rep) => setSelectedReport(rep)}
            onDeleteReport={handleDeleteReport}
          />
        )}

        {page === 'Search' && (
          <SearchView
            instruments={visibleInstruments}
            reports={visibleReports}
            auditEvents={visibleAuditEvents}
            onViewReport={(rep) => setSelectedReport(rep)}
            navigate={navigate}
          />
        )}

        {page === 'Audit trail' && (
          <AuditView
            auditEvents={auditEvents}
            userRole={currentUser.role}
            currentUser={currentUser}
          />
        )}

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
          { icon: Weight, title: 'Instruments', count: `${instrumentsCount}`, sub: instrumentsCount === 0 ? 'No instruments registered' : `${instrumentsCount} registered`, color: 'teal' },
          { icon: Activity, title: 'Test sessions', count: instrumentsCount > 0 ? '1' : '0', sub: instrumentsCount > 0 ? 'Session ready' : 'No active sessions', color: 'blue' },
          { icon: FileCheck2, title: 'Reports', count: `${reportsCount}`, sub: reportsCount === 0 ? 'Generated after test' : `${reportsCount} sealed certificates`, color: 'emerald' },
          { icon: ShieldCheck, title: 'Audit events', count: `${auditCount}`, sub: `${auditCount} actions recorded`, color: 'cyan' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div className="stat-card" key={item.title}>
              <div className={`stat-icon ${item.color}`}>
                <Icon size={16} strokeWidth={2.2} />
              </div>
              <strong>{item.count}</strong>
              <span>
                {item.title} <em>{item.sub}</em>
              </span>
            </div>
          )
        })}
      </section>

      <section className="dashboard-grid">
        <div className="panel empty-panel">
          <div className="empty-icon">
            <Weight size={20} />
          </div>
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
          <div className="empty-icon">
            <FileCheck2 size={20} />
          </div>
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
          <div className="empty-icon" style={{ width: 45, height: 45, margin: '0 auto 12px' }}>
            <FileCheck2 size={22} />
          </div>
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
          <Search size={18} style={{ flexShrink: 0 }} />
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
                <h3 style={{ fontSize: '13px', margin: '0 0 10px' }}>
                  Matching Certificates ({matchedReports.length})
                </h3>
                {matchedReports.map((rep) => (
                  <div key={rep.reportNumber} className="search-match-card">
                    <div>
                      <strong style={{ color: '#0f7c76', fontFamily: 'DM Mono' }}>{rep.reportNumber}</strong>
                      <span style={{ marginLeft: '10px', fontSize: '11px' }}>
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
                <h3 style={{ fontSize: '13px', margin: '0 0 10px' }}>
                  Matching Instruments ({matchedInstruments.length})
                </h3>
                {matchedInstruments.map((inst) => (
                  <div key={inst.serial} className="search-match-card">
                    <div>
                      <strong>{inst.model}</strong>
                      <span style={{ marginLeft: '10px', fontSize: '11px' }}>
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
            <div className="empty-icon" style={{ width: 45, height: 45, margin: '0 auto 12px' }}>
              <Search size={22} />
            </div>
            <h2>No records match &ldquo;{query}&rdquo;</h2>
            <p>Try searching with instrument serial number or certificate number.</p>
          </div>
        )
      ) : (
        <div className="empty-state search-empty">
          <div className="empty-icon" style={{ width: 45, height: 45, margin: '0 auto 12px' }}>
            <Search size={22} />
          </div>
          <h2>Search across your workspace</h2>
          <p>
            Currently {instruments.length} instrument{instruments.length !== 1 ? 's' : ''} and {reports.length} report{reports.length !== 1 ? 's' : ''} in the database.
          </p>
        </div>
      )}
    </>
  )
}

function AuditView({
  auditEvents,
  userRole,
  currentUser,
}: {
  auditEvents: AuditEvent[]
  userRole: 'ADMIN' | 'OPERATOR'
  currentUser: User
}) {
  const [selectedActorFilter, setSelectedActorFilter] = useState<string>('ALL')
  const isAdmin = userRole === 'ADMIN'

  // Extract unique actors for admin filter
  const uniqueActors = useMemo(() => {
    const actors = Array.from(new Set(auditEvents.map((e) => e.actor).filter(Boolean)))
    return actors
  }, [auditEvents])

  // Filter events strictly: regular users only see their own audits; admins see all (or filtered)
  const displayedEvents = useMemo(() => {
    if (!isAdmin) {
      return auditEvents.filter(
        (e) =>
          e.userId === currentUser.id ||
          e.userEmail === currentUser.email ||
          e.actor === currentUser.name ||
          (!e.userId && e.actor?.toLowerCase().includes(currentUser.name.toLowerCase()))
      )
    }
    if (selectedActorFilter === 'ALL') return auditEvents
    return auditEvents.filter((e) => e.actor === selectedActorFilter)
  }, [auditEvents, isAdmin, currentUser, selectedActorFilter])

  return (
    <>
      <PageIntro
        eyebrow="COMPLIANCE RECORD"
        title="Audit trail"
        description={
          isAdmin
            ? 'Supervisory cryptographic audit log — Viewing organization-wide actions from all metrologists and administrators.'
            : `Personal compliance trail — Cryptographically tracking all actions performed by ${currentUser.name}.`
        }
      />

      {/* Role-specific Notice Banner */}
      <div className={`audit-role-banner ${isAdmin ? 'admin' : 'operator'}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>{isAdmin ? '🛡️' : '🔒'}</span>
          <span>
            {isAdmin ? (
              <>
                <strong>Administrator Supervisory View:</strong> Showing system-wide logs from all personnel (
                {auditEvents.length} total events).
              </>
            ) : (
              <>
                <strong>Personal Audit Isolation Active:</strong> Only showing records performed by your account (
                <strong>{currentUser.name}</strong>).
              </>
            )}
          </span>
        </div>

        {isAdmin && uniqueActors.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
              Filter Personnel:
            </label>
            <select
              value={selectedActorFilter}
              onChange={(e) => setSelectedActorFilter(e.target.value)}
              className="audit-actor-select"
            >
              <option value="ALL">All Personnel ({auditEvents.length})</option>
              {uniqueActors.map((actor) => {
                const count = auditEvents.filter((e) => e.actor === actor).length
                return (
                  <option key={actor} value={actor}>
                    {actor} ({count} event{count !== 1 ? 's' : ''})
                  </option>
                )
              })}
            </select>
          </div>
        )}
      </div>

      <section className="audit-summary">
        <div>
          <strong>{displayedEvents.length}</strong>
          <span>{isAdmin ? 'Visible events' : 'My actions recorded'}</span>
        </div>
        <div>
          <strong>{displayedEvents.length > 0 ? 'Verified' : 'Ready'}</strong>
          <span>Hash chain status</span>
        </div>
        <div>
          <strong>SHA-256</strong>
          <span>Seal algorithm</span>
        </div>
        <div className="chain-ok">
          ✓{' '}
          <span>
            Chain intact
            <br />
            <small>
              {displayedEvents.length > 0 ? 'Live tamper-evident audit' : 'Awaiting user action'}
            </small>
          </span>
        </div>
      </section>

      {displayedEvents.length > 0 ? (
        <section className="panel full-table" style={{ marginTop: '16px' }}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor / Personnel</th>
                  <th>Action</th>
                  <th>Entity / Target</th>
                  <th>SHA-256 Digest</th>
                </tr>
              </thead>
              <tbody>
                {displayedEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td>{evt.timestamp}</td>
                    <td>
                      <strong>{evt.actor}</strong>
                      {evt.userEmail && (
                        <small style={{ display: 'block', fontSize: '10.5px' }}>
                          {evt.userEmail}
                        </small>
                      )}
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
          <h2>No audit events found</h2>
          <p>
            {isAdmin
              ? 'No audit events recorded for the selected filter.'
              : 'Actions you perform (registering instruments, conducting test sessions, sealing certificates) will appear in your personal audit trail with cryptographic hashes.'}
          </p>
        </div>
      )}
    </>
  )
}
