import { useState } from 'react'
import { Bell, Building2, FileCheck2, LockKeyhole, Save, ShieldCheck, UserRound } from 'lucide-react'
import type { User } from '../services/authStore.ts'
import { updateUser } from '../services/authStore.ts'
import '../styles/settings.css'

type SettingsTab = 'Laboratory' | 'Standards' | 'Reports' | 'Security' | 'Notifications'
type AccountTab = 'Profile' | 'Security' | 'Sessions'

export function SettingsView({ userRole = 'OPERATOR' }: { userRole?: 'ADMIN' | 'OPERATOR' }) {
  const [tab, setTab] = useState<SettingsTab>('Laboratory')
  const [saved, setSaved] = useState(false)
  const tabs: [SettingsTab, typeof Building2][] = [
    ['Laboratory', Building2],
    ['Standards', ShieldCheck],
    ['Reports', FileCheck2],
    ['Security', LockKeyhole],
    ['Notifications', Bell],
  ]

  const save = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  return (
    <>
      <SettingsHeader
        title="Laboratory System Settings"
        description="Configure rulesets, verification standards, and operational security controls."
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          {tabs.map(([name, Icon]) => (
            <button
              className={tab === name ? 'settings-nav-item active' : 'settings-nav-item'}
              onClick={() => setTab(name)}
              key={name}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
        </aside>
        <section className="settings-content">
          <div className="settings-title">
            <div>
              <p className="eyebrow">{tab.toUpperCase()} CONFIGURATION</p>
              <h2>{tab} Settings</h2>
            </div>
            {saved && <span className="saved-message">✓ Changes saved successfully</span>}
          </div>
          <SettingsTabContent tab={tab} />
          {userRole === 'ADMIN' ? (
            <div className="settings-actions">
              <button className="button primary" onClick={save}>
                <Save size={14} style={{ marginRight: '5px' }} /> Save system changes
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '20px', padding: '10px 14px', background: '#f5f8f7', borderRadius: '6px', fontSize: '10px', color: '#687d7b' }}>
              🔒 System-level settings are read-only for Metrologist accounts. Contact your Laboratory Supervisor to request changes.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function SettingsTabContent({ tab }: { tab: SettingsTab }) {
  if (tab === 'Laboratory') {
    return (
      <>
        <div className="settings-form two-col">
          <label>
            Laboratory name
            <input defaultValue="Central Standards Laboratory" />
          </label>
          <label>
            Laboratory code
            <input defaultValue="CSL-IND-01" />
          </label>
          <label className="wide">
            Official Address
            <textarea defaultValue="Directorate of Legal Metrology, Standards Complex, New Delhi - 110001" />
          </label>
          <label>
            Default timezone
            <select defaultValue="Asia/Kolkata">
              <option>Asia/Kolkata (IST +5:30)</option>
              <option>UTC</option>
            </select>
          </label>
          <label>
            Default language
            <select defaultValue="English">
              <option>English</option>
              <option>Hindi</option>
            </select>
          </label>
        </div>
        <SettingCard title="Laboratory accreditation" description="Displayed on official certificates and verification QR payloads.">
          <div className="logo-upload">
            <div className="logo-preview">M</div>
            <div>
              <strong>Mapan Legal Metrology Directorate</strong>
              <p>NABL / ISO/IEC 17025 Accredited Testing Facility</p>
            </div>
          </div>
        </SettingCard>
      </>
    )
  }

  if (tab === 'Standards') {
    return (
      <>
        <SettingCard title="Active standard" description="The selected ruleset is applied to all new weighing sessions.">
          <label>
            Default standard
            <select defaultValue="OIML R 76-1:2006">
              <option>OIML R 76-1:2006 (Non-Automatic Weighing Instruments)</option>
              <option>OIML R 76-1:1992</option>
              <option>Legal Metrology (General) Rules 2011</option>
            </select>
          </label>
          <div className="standard-status">
            <ShieldCheck size={18} />
            <div>
              <strong>Ruleset Verified Active</strong>
              <p>OIML R 76-1:2006 active for MPE evaluation and tolerance bands.</p>
            </div>
            <span>Active</span>
          </div>
        </SettingCard>
        <SettingCard title="MPE Rule Policy" description="Tolerance region multipliers according to OIML R 76.">
          <div className="rule-table">
            <span>Load region (n = m / e)</span>
            <span>Class I</span>
            <span>Class II</span>
            <span>Class III / IIII</span>
            <span>0 ≤ n ≤ 50,000 / 5,000 / 500</span>
            <b>±0.5 e</b>
            <b>±0.5 e</b>
            <b>±0.5 e</b>
            <span>50,000 &lt; n ≤ 200,000 / 20,000 / 2,000</span>
            <b>±1.0 e</b>
            <b>±1.0 e</b>
            <b>±1.0 e</b>
            <span>n &gt; 200,000 / 20,000 / 2,000</span>
            <b>±1.5 e</b>
            <b>±1.5 e</b>
            <b>±1.5 e</b>
          </div>
        </SettingCard>
      </>
    )
  }

  if (tab === 'Reports') {
    return (
      <SettingCard title="Certificate format & integrity" description="Control cryptographic sealing and digital verification elements.">
        <div className="settings-form two-col">
          <label>
            Report number prefix
            <input defaultValue="MPN-CERT-" />
          </label>
          <label>
            Hash algorithm
            <select defaultValue="SHA-256">
              <option>SHA-256 (Tamper-evident digest)</option>
              <option>SHA-512</option>
            </select>
          </label>
          <label className="toggle-row">
            <input type="checkbox" defaultChecked /> Include live calculation trace
          </label>
          <label className="toggle-row">
            <input type="checkbox" defaultChecked /> Include scannable QR verification code
          </label>
          <label className="toggle-row">
            <input type="checkbox" defaultChecked /> Require supervisor signature & stamp
          </label>
          <label className="toggle-row">
            <input type="checkbox" defaultChecked /> Enforce OIML error tolerance checks
          </label>
        </div>
      </SettingCard>
    )
  }

  if (tab === 'Security') {
    return (
      <SettingCard title="Access protection" description="Role-based access control and cryptographic audit retention.">
        <div className="settings-form two-col">
          <label>
            Session timeout
            <select defaultValue="30 minutes">
              <option>15 minutes</option>
              <option>30 minutes</option>
              <option>60 minutes</option>
            </select>
          </label>
          <label>
            Audit log retention
            <select defaultValue="Indefinite">
              <option>7 years</option>
              <option>10 years</option>
              <option>Indefinite (Legal metrology compliant)</option>
            </select>
          </label>
          <label className="toggle-row">
            <input type="checkbox" defaultChecked /> Enforce role permissions (Admin vs Operator)
          </label>
          <label className="toggle-row">
            <input type="checkbox" defaultChecked /> Cryptographically hash all audit events
          </label>
        </div>
      </SettingCard>
    )
  }

  return (
    <SettingCard title="Notification preferences" description="Operational alerts for calibration and review events.">
      <NotificationRow icon={<Bell size={17} />} title="Approval requests" detail="Notify supervisors when a session is submitted for review." />
      <NotificationRow icon={<FileCheck2 size={17} />} title="Certificate generated" detail="Notify metrologist when a certificate is sealed." />
      <NotificationRow icon={<ShieldCheck size={17} />} title="Tolerance anomaly" detail="Alert when a reading exceeds allowable MPE limits." />
    </SettingCard>
  )
}

export function AccountSettings({
  currentUser,
  onUpdateProfile,
  onLogout,
}: {
  currentUser: User
  onUpdateProfile: (updated: User) => void
  onLogout: () => void
}) {
  const [tab, setTab] = useState<AccountTab>('Profile')
  const [name, setName] = useState(currentUser.name)
  const [phone, setPhone] = useState(currentUser.phone || '')
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const handleSaveProfile = () => {
    setError('')
    setMsg('')
    if (!name.trim()) {
      setError('Name cannot be blank.')
      return
    }

    updateUser(currentUser.id, { name, phone })
    onUpdateProfile({ ...currentUser, name, phone })
    setMsg('Profile updated successfully!')
  }

  const handlePasswordChange = () => {
    setError('')
    setMsg('')
    if (!currentPass || !newPass) {
      setError('Please fill in current and new password.')
      return
    }

    if (currentPass !== currentUser.passwordHash) {
      setError('Current password is incorrect.')
      return
    }

    if (newPass.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    if (newPass !== confirmPass) {
      setError('New password and confirmation do not match.')
      return
    }

    updateUser(currentUser.id, { passwordHash: newPass })
    onUpdateProfile({ ...currentUser, passwordHash: newPass })
    setCurrentPass('')
    setNewPass('')
    setConfirmPass('')
    setMsg('Password changed successfully!')
  }

  return (
    <>
      <SettingsHeader
        title="Personal Account & Security"
        description="Manage your profile information, credentials, and active laboratory sessions."
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          <button
            className={tab === 'Profile' ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => {
              setTab('Profile')
              setMsg('')
              setError('')
            }}
          >
            <UserRound size={16} />
            My Profile
          </button>
          <button
            className={tab === 'Security' ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => {
              setTab('Security')
              setMsg('')
              setError('')
            }}
          >
            <LockKeyhole size={16} />
            Password & Security
          </button>
          <button
            className={tab === 'Sessions' ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => {
              setTab('Sessions')
              setMsg('')
              setError('')
            }}
          >
            <ShieldCheck size={16} />
            Active Sessions
          </button>
        </aside>

        <section className="settings-content">
          <div className="settings-title">
            <div>
              <p className="eyebrow">ACCOUNT SETTINGS</p>
              <h2>
                {tab === 'Profile'
                  ? 'Your Laboratory Profile'
                  : tab === 'Security'
                  ? 'Sign-in & Password Protection'
                  : 'Active Device Sessions'}
              </h2>
            </div>
            {msg && <span className="saved-message">✓ {msg}</span>}
            {error && <span style={{ color: '#cf222e', fontSize: '11px', fontWeight: 700 }}>! {error}</span>}
          </div>

          {tab === 'Profile' && (
            <>
              <div className="account-identity">
                <div className="large-avatar">{currentUser.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <h3>{currentUser.name}</h3>
                  <p>
                    {currentUser.role === 'ADMIN' ? 'Laboratory Supervisor' : 'Testing Metrologist'} · {currentUser.laboratory}
                  </p>
                </div>
              </div>
              <div className="settings-form two-col">
                <label>
                  Full Name
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  Email address
                  <input value={currentUser.email} readOnly style={{ background: '#f0f3f2' }} />
                </label>
                <label>
                  Assigned Role
                  <input
                    value={currentUser.role === 'ADMIN' ? 'Laboratory Supervisor (Admin - Full CRUD)' : 'Testing Metrologist (Operator)'}
                    readOnly
                    style={{ background: '#f0f3f2' }}
                  />
                </label>
                <label>
                  Phone number
                  <input
                    value={phone}
                    placeholder="+91 98765 43210"
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>
              <div className="settings-actions">
                <button className="button primary" onClick={handleSaveProfile}>
                  <Save size={14} style={{ marginRight: '5px' }} /> Save Profile
                </button>
              </div>
            </>
          )}

          {tab === 'Security' && (
            <>
              <SettingCard title="Change Password" description="Update your laboratory credentials regularly to safeguard legal records.">
                <div className="settings-form">
                  <label>
                    Current Password
                    <input
                      type="password"
                      value={currentPass}
                      onChange={(e) => setCurrentPass(e.target.value)}
                      placeholder="Enter current password"
                    />
                  </label>
                  <label>
                    New Password
                    <input
                      type="password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </label>
                  <label>
                    Confirm New Password
                    <input
                      type="password"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      placeholder="Repeat new password"
                    />
                  </label>
                </div>
              </SettingCard>
              <div className="settings-actions">
                <button className="button primary" onClick={handlePasswordChange}>
                  <LockKeyhole size={14} style={{ marginRight: '5px' }} /> Update Password
                </button>
              </div>
            </>
          )}

          {tab === 'Sessions' && (
            <SessionsPanel onLogout={onLogout} />
          )}
        </section>
      </div>
    </>
  )
}

function SessionsPanel({ onLogout }: { onLogout: () => void }) {
  return (
    <SettingCard title="Signed-in Devices" description="Revoke any session you do not recognize.">
      <div className="session-row">
        <div className="device-dot" />
        <div>
          <strong>Current browser session</strong>
          <p>Active authenticated metrology session</p>
        </div>
        <span className="current-label">Current Active</span>
      </div>
      <div style={{ marginTop: '20px' }}>
        <button className="button secondary" onClick={onLogout} style={{ color: '#cf222e' }}>
          Sign out of this session
        </button>
      </div>
    </SettingCard>
  )
}

function NotificationRow({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="notification-setting">
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <input type="checkbox" defaultChecked />
    </div>
  )
}

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">CONTROL CENTRE</p>
        <h1>{title}</h1>
        <p className="subheading">{description}</p>
      </div>
    </div>
  )
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="setting-card">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  )
}
