import { useState, useEffect } from 'react'
import {
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import {
  getStoredUsers,
  loadUsersFromFirestore,
  adminCreateUser,
  updateUser,
  deleteUser,
  purgeNonAdminUsers,
} from './authStore'
import type { User, UserRole } from './authStore'
import './views.css'

type Props = {
  currentUserId: string
  onAddAuditEvent: (action: string, target: string) => void
}

export default function UserManagementView({
  currentUserId,
  onAddAuditEvent,
}: Props) {
  const [users, setUsers] = useState<User[]>(getStoredUsers())
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [openAddModal, setOpenAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [purging, setPurging] = useState(false)

  // Load from Firestore on mount
  useEffect(() => {
    loadUsersFromFirestore().then((cloudUsers) => {
      if (cloudUsers.length > 0) setUsers(cloudUsers)
    })
  }, [])

  // Add User Form State
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('OPERATOR')
  const [formDept, setFormDept] = useState('Precision Metrology Bay')
  const [error, setError] = useState('')

  const refreshUsers = () => {
    loadUsersFromFirestore().then((cloudUsers) => {
      setUsers(cloudUsers)
    })
  }

  const handlePurgeAll = async () => {
    if (confirm('Are you sure you want to permanently delete ALL non-admin accounts from Firebase and local database? Only Dr. Vikram Mehta (Admin) will be preserved.')) {
      setPurging(true)
      const res = await purgeNonAdminUsers()
      onAddAuditEvent('ADMIN_PURGE_USERS', `Admin purged ${res.count} personnel accounts from Firebase registry`)
      refreshUsers()
      setPurging(false)
    }
  }

  const handleAddUser = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword) {
      setError('Name, email, and password are required.')
      return
    }

    const res = await adminCreateUser(formName, formEmail, formPassword, formRole, formDept)
    if (!res.success || !res.user) {
      setError(res.error || 'Failed to create user.')
      return
    }

    if (formDept) {
      updateUser(res.user.id, { department: formDept })
    }

    onAddAuditEvent(
      'ADMIN_CREATE_USER',
      `Admin created user ${res.user.name} (${res.user.email}) as ${res.user.role}`
    )

    setFormName('')
    setFormEmail('')
    setFormPassword('')
    setFormRole('OPERATOR')
    setError('')
    setOpenAddModal(false)
    refreshUsers()
  }

  const handleToggleActive = (user: User) => {
    if (user.id === currentUserId) {
      alert('You cannot deactivate your own active session account.')
      return
    }

    const nextStatus = !user.active
    updateUser(user.id, { active: nextStatus })
    onAddAuditEvent(
      nextStatus ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      `${nextStatus ? 'Activated' : 'Deactivated'} user ${user.name} (${user.email})`
    )
    refreshUsers()
  }

  const handleSaveEdit = () => {
    if (!editingUser) return
    updateUser(editingUser.id, {
      name: editingUser.name,
      role: editingUser.role,
      department: editingUser.department,
      phone: editingUser.phone,
    })

    onAddAuditEvent(
      'ADMIN_UPDATE_USER',
      `Updated user profile & role for ${editingUser.name} (${editingUser.email})`
    )
    setEditingUser(null)
    refreshUsers()
  }

  const handleDelete = async (user: User) => {
    if (user.id === currentUserId) {
      alert('You cannot delete your own active administrator account.')
      return
    }

    if (confirm(`Are you sure you want to permanently delete user ${user.name} (${user.email}) from Firebase and system registry?`)) {
      await deleteUser(user.id)
      onAddAuditEvent('ADMIN_DELETE_USER', `Deleted user account ${user.name} (${user.email})`)
      refreshUsers()
    }
  }

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.department.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <>
      <div className="workflow-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION · ACCESS CONTROL</p>
          <h1>User & Role Management</h1>
          <p className="subheading">
            Manage authorized laboratory personnel, assign role permissions (Admin vs Metrologist), and review access status.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="button secondary"
            onClick={handlePurgeAll}
            disabled={purging}
            title="Delete all non-admin test users from Firebase & local cache"
            style={{ color: '#cf222e' }}
          >
            <RotateCcw size={14} style={{ marginRight: '5px' }} />
            {purging ? 'Purging...' : 'Purge All Non-Admin Users'}
          </button>
          <button className="button primary" onClick={() => setOpenAddModal(true)}>
            <UserPlus size={14} style={{ marginRight: '5px' }} />
            ＋ Add Personnel
          </button>
        </div>
      </div>

      <section className="view-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            placeholder="Search personnel by name, email, or department"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="ALL">All Roles</option>
          <option value="ADMIN">Administrators</option>
          <option value="OPERATOR">Laboratory Metrologists</option>
        </select>
      </section>

      <section className="view-stats">
        <span>
          <b>{users.length}</b>Total Personnel
        </span>
        <span>
          <b>{users.filter((u) => u.active).length}</b>Active Accounts
        </span>
        <span>
          <b>{users.filter((u) => u.role === 'ADMIN').length}</b>Supervisors / Admins
        </span>
        <span>
          <b>{users.filter((u) => u.role === 'OPERATOR').length}</b>Testing Metrologists
        </span>
      </section>

      <section className="panel full-table">
        <div className="panel-heading">
          <div>
            <h2>Authorized Laboratory Personnel ({filtered.length})</h2>
            <p>Full CRUD access is available for administrator accounts.</p>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Personnel</th>
                <th>Role & Permissions</th>
                <th>Department</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: user.role === 'ADMIN' ? '#183e4e' : '#e4f1ed',
                          color: user.role === 'ADMIN' ? '#ffffff' : '#0f7c76',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                        }}
                      >
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontFamily: 'DM Mono, monospace',
                        fontWeight: 700,
                        background: user.role === 'ADMIN' ? '#eaf4ff' : '#e6f4ed',
                        color: user.role === 'ADMIN' ? '#1b64b3' : '#1a7f37',
                      }}
                    >
                      {user.role === 'ADMIN' ? 'SUPERVISOR (ADMIN)' : 'METROLOGIST (OPERATOR)'}
                    </span>
                  </td>
                  <td>{user.department || 'Metrology Standards'}</td>
                  <td>
                    <button
                      onClick={() => handleToggleActive(user)}
                      style={{
                        border: 0,
                        background: 'transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: user.active ? '#1a7f37' : '#cf222e',
                      }}
                      title="Click to toggle active status"
                    >
                      {user.active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {user.active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td>
                    <small>{new Date(user.createdAt).toLocaleDateString('en-GB')}</small>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="text-button"
                        onClick={() => setEditingUser({ ...user })}
                        title="Edit user role and info"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        className="text-button"
                        onClick={() => handleDelete(user)}
                        title="Delete user"
                        style={{ color: '#cf222e', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add User Modal */}
      {openAddModal && (
        <div className="modal-backdrop" onClick={() => setOpenAddModal(false)}>
          <section className="register-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">ADMIN CONSOLE · PERSONNEL ONBOARDING</p>
                <h2>Add Laboratory Personnel</h2>
                <p>Create a verified user account with assigned metrology roles.</p>
              </div>
              <button className="modal-close" onClick={() => setOpenAddModal(false)}>
                ×
              </button>
            </div>

            <div className="form-grid">
              <label>
                Full Name *
                <input
                  value={formName}
                  placeholder="e.g. Dr. Rajesh Kumar"
                  onChange={(e) => setFormName(e.target.value)}
                />
              </label>
              <label>
                Official Email Address *
                <input
                  type="email"
                  value={formEmail}
                  placeholder="rajesh@laboratory.gov"
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </label>
              <label>
                Assigned Role *
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                >
                  <option value="OPERATOR">Laboratory Metrologist (Operator)</option>
                  <option value="ADMIN">Laboratory Supervisor (Admin - Full CRUD)</option>
                </select>
              </label>
              <label>
                Initial Password *
                <input
                  type="password"
                  value={formPassword}
                  placeholder="At least 6 characters"
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </label>
              <label className="wide">
                Department / Division
                <input
                  value={formDept}
                  placeholder="e.g. Precision Weights & Balance Section"
                  onChange={(e) => setFormDept(e.target.value)}
                />
              </label>
            </div>

            {error && <div className="form-error">! {error}</div>}

            <div className="modal-actions">
              <button className="button secondary" onClick={() => setOpenAddModal(false)}>
                Cancel
              </button>
              <button className="button primary" onClick={handleAddUser}>
                Create Account
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-backdrop" onClick={() => setEditingUser(null)}>
          <section className="register-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">ADMIN CONSOLE · EDIT PERSONNEL</p>
                <h2>Edit {editingUser.name}</h2>
                <p>Modify role and department permissions.</p>
              </div>
              <button className="modal-close" onClick={() => setEditingUser(null)}>
                ×
              </button>
            </div>

            <div className="form-grid">
              <label>
                Full Name
                <input
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </label>
              <label>
                Assigned Role
                <select
                  value={editingUser.role}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, role: e.target.value as UserRole })
                  }
                >
                  <option value="OPERATOR">Laboratory Metrologist (Operator)</option>
                  <option value="ADMIN">Laboratory Supervisor (Admin - Full CRUD)</option>
                </select>
              </label>
              <label>
                Department / Section
                <input
                  value={editingUser.department}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, department: e.target.value })
                  }
                />
              </label>
              <label>
                Contact Phone
                <input
                  value={editingUser.phone || ''}
                  placeholder="+91 ..."
                  onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="button secondary" onClick={() => setEditingUser(null)}>
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
