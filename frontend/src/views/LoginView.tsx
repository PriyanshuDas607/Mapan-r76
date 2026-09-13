import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Weight, UserPlus, LogIn, UserCheck, Briefcase } from 'lucide-react'
import { authenticateUser, registerNewUser } from '../services/authStore.ts'
import type { User } from '../services/authStore.ts'
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

      setLoading(false)
      setSuccessMsg('Authenticated! Signing in...')
      onLogin(res.user)
    } catch {
      setError('An error occurred during authentication. Please try again.')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = (e: FormEvent) => {
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
      const res = registerNewUser(name, email, password, jobTitle)
      if (!res.success || !res.user) {
        setError(res.error || 'Registration failed.')
        setLoading(false)
        return
      }

      setSuccessMsg('Account created successfully! Entering workspace...')
      setLoading(false)
      onLogin(res.user)
    } catch {
      setError('An error occurred during account creation. Please try again.')
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
                setName('')
                setEmail('')
                setPassword('')
                setError('')
                setSuccessMsg('')
                setLoading(false)
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
                setName('')
                setEmail('')
                setPassword('')
                setError('')
                setSuccessMsg('')
                setLoading(false)
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
            <form onSubmit={handleSignIn} autoComplete="off">
              <label>
                Official Email Address
                <div className="input-wrap">
                  <Mail size={16} />
                  <input
                    type="email"
                    name="signin_email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="officer@laboratory.gov"
                    autoComplete="off"
                  />
                </div>
              </label>

              <label>
                Password
                <div className="input-wrap">
                  <LockKeyhole size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="signin_password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="off"
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
            <form onSubmit={handleSignUp} autoComplete="off">
              <label>
                Full Name *
                <div className="input-wrap">
                  <UserCheck size={16} />
                  <input
                    type="text"
                    name="reg_fullname"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Rohit Sharma"
                    autoComplete="off"
                  />
                </div>
              </label>

              <label>
                Official Email Address *
                <div className="input-wrap">
                  <Mail size={16} />
                  <input
                    type="email"
                    name="reg_email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="rohit@laboratory.gov"
                    autoComplete="off"
                  />
                </div>
              </label>

              <label>
                Laboratory Designation / Role *
                <div className="input-wrap" style={{ padding: '0 12px' }}>
                  <Briefcase size={16} color="#70878a" />
                  <select
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      border: 'none',
                      outline: 'none',
                      fontSize: '11px',
                      color: 'inherit',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <option style={{ background: '#ffffff', color: '#17252b' }} value="Laboratory Metrologist / Verification Officer">Laboratory Metrologist / Verification Officer</option>
                    <option style={{ background: '#ffffff', color: '#17252b' }} value="Calibration Specialist">Calibration Specialist</option>
                    <option style={{ background: '#ffffff', color: '#17252b' }} value="Standards Testing Assistant">Standards Testing Assistant</option>
                    <option style={{ background: '#ffffff', color: '#17252b' }} value="Quality Inspection Officer">Quality Inspection Officer</option>
                  </select>
                </div>
              </label>

              <label>
                Create Password (Min 6 characters) *
                <div className="input-wrap">
                  <LockKeyhole size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="reg_new_password"
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

              <button className="login-submit" type="submit" style={{ marginTop: '12px' }}>
                Create Account &amp; Sign In <ArrowRight size={16} />
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
