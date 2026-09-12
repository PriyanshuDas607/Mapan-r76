import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Weight, UserPlus, LogIn, UserCheck, Briefcase } from 'lucide-react'
import { authenticateUser, registerNewUser } from '../../backend/authStore.ts'
import type { User } from '../../backend/authStore.ts'
import '../styles/login.css'

type Props = {
  onLogin: (user: User) => void
}

export default function LoginView({ onLogin }: Props) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [jobTitle, setJobTitle] = useState('Laboratory Metrologist / Verification Officer')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)
    try {
      const res = await authenticateUser(email, password)
      if (!res.success || !res.user) {
        setError(res.error || 'Authentication failed.')
        setLoading(false)
        return
      }

      setSuccessMsg('Authenticated! Signing in...')
      setTimeout(() => {
        onLogin(res.user!)
      }, 300)
    } catch {
      setError('An error occurred during authentication. Please try again.')
      setLoading(false)
    }
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    if (!name.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.')
      return
    }

    if (!email.includes('@') || !email.includes('.')) {
      setError('Please provide a valid official email address.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      // Normal public user creation registers strictly as an Operator
      const res = await registerNewUser(name, email, password, jobTitle)
      if (!res.success || !res.user) {
        setError(res.error || 'Registration failed.')
        setLoading(false)
        return
      }

      setSuccessMsg('Personnel account registered successfully! Signing in...')
      setTimeout(() => {
        onLogin(res.user!)
      }, 600)
    } catch {
      setError('Failed to create account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-brand-panel">
        <div className="login-logo">
          <span>M</span>
          <strong>mapan</strong>
        </div>
        <div className="login-message">
          <p className="eyebrow">LEGAL METROLOGY OPERATIONS</p>
          <h1>
            Evidence you can
            <br />
            <em>stand behind.</em>
          </h1>
          <p>
            Authenticate with verified laboratory credentials to access calibration testing, instrument registries, and tamper-evident certificates.
          </p>
        </div>
        <div className="login-proof">
          <span>
            <ShieldCheck size={16} /> OIML R 76 Compliance Architecture
          </span>
          <span>
            <LockKeyhole size={16} /> Encrypted Database Records
          </span>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="mobile-login-logo">
            <span>M</span>
            <strong>mapan</strong>
          </div>

          {/* Tab Switcher: Sign In vs Sign Up */}
          <div
            style={{
              display: 'flex',
              background: '#eef4f1',
              borderRadius: '8px',
              padding: '4px',
              marginBottom: '20px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTab('signin')
                setError('')
                setSuccessMsg('')
              }}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                background: tab === 'signin' ? '#ffffff' : 'transparent',
                color: tab === 'signin' ? '#0f7c76' : '#647e7d',
                boxShadow: tab === 'signin' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <LogIn size={14} /> Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup')
                setError('')
                setSuccessMsg('')
              }}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                background: tab === 'signup' ? '#ffffff' : 'transparent',
                color: tab === 'signup' ? '#0f7c76' : '#647e7d',
                boxShadow: tab === 'signup' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <UserPlus size={14} /> Create Account
            </button>
          </div>

          <div className="login-heading">
            <span className="login-icon">
              <Weight size={19} />
            </span>
            <p className="eyebrow">CENTRAL STANDARDS LAB</p>
            <h2>{tab === 'signin' ? 'Laboratory Sign In' : 'Register Laboratory Personnel'}</h2>
            <p>
              {tab === 'signin'
                ? 'Enter your registered credentials to access your testing workspace.'
                : 'Create an official personnel account to start recording metrology tests.'}
            </p>
          </div>

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn}>
              <label>
                Official Email Address
                <div className="input-wrap">
                  <Mail size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="officer@laboratory.gov"
                    autoComplete="email"
                  />
                </div>
              </label>

              <label>
                Password
                <div className="input-wrap">
                  <LockKeyhole size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {error && <div className="login-error">! {error}</div>}
              {successMsg && <div style={{ color: '#1a7f37', fontSize: '11px', margin: '8px 0', fontWeight: 700 }}>✓ {successMsg}</div>}

              <button className="login-submit" type="submit" disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Authenticating...' : 'Sign in to Workspace'} <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp}>
              <label>
                Full Name *
                <div className="input-wrap">
                  <UserCheck size={16} />
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Rohit Sharma"
                    autoComplete="name"
                  />
                </div>
              </label>

              <label>
                Official Email Address *
                <div className="input-wrap">
                  <Mail size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="rohit@laboratory.gov"
                    autoComplete="email"
                  />
                </div>
              </label>

              <label>
                Laboratory Designation / Role *
                <div className="input-wrap" style={{ padding: '0 8px' }}>
                  <Briefcase size={16} color="#70878a" />
                  <select
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      border: 'none',
                      outline: 'none',
                      fontSize: '10.5px',
                      color: '#2b4d52',
                      background: 'transparent',
                    }}
                  >
                    <option value="Laboratory Metrologist / Verification Officer">Laboratory Metrologist / Verification Officer</option>
                    <option value="Calibration Specialist">Calibration Specialist</option>
                    <option value="Standards Testing Assistant">Standards Testing Assistant</option>
                    <option value="Quality Inspection Officer">Quality Inspection Officer</option>
                  </select>
                </div>
              </label>

              <label>
                Create Password (Min 6 characters) *
                <div className="input-wrap">
                  <LockKeyhole size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {error && <div className="login-error">! {error}</div>}
              {successMsg && <div style={{ color: '#1a7f37', fontSize: '11px', margin: '8px 0', fontWeight: 700 }}>✓ {successMsg}</div>}

              <button className="login-submit" type="submit" disabled={loading} style={{ marginTop: '12px', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Registering...' : 'Create Account & Sign In'} <ArrowRight size={16} />
              </button>
            </form>
          )}

          <p className="login-note">
            Legal metrology compliance workspace. All logins, calibration observations, and certificate sealing actions are cryptographically recorded.
          </p>
        </div>
        <div className="login-footer">
          Mapan Metrology OS <span>·</span> Secured Laboratory Access
        </div>
      </section>
    </main>
  )
}
