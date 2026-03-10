import { useState, useEffect } from 'react'

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ account_id: '', account_name: '', role_arn: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchAccounts = () => {
    setLoading(true)
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((data) => {
        setAccounts(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchAccounts() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || res.statusText)
      }
      setForm({ account_id: '', account_name: '', role_arn: '' })
      setShowForm(false)
      fetchAccounts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Remove account "${name}"?`)) return
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
      fetchAccounts()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleEnabled = async (account) => {
    try {
      await fetch(`/api/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !account.enabled }),
      })
      fetchAccounts()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Monitored Accounts</h1>
          <p className="page-subtitle">AWS accounts tracked across your organization</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Account'}
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {showForm && (
        <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
          <div className="form-row">
            <label>
              <span className="form-label">Account ID</span>
              <input
                type="text"
                className="form-input"
                placeholder="123456789012"
                maxLength={12}
                value={form.account_id}
                onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                required
              />
            </label>
            <label>
              <span className="form-label">Account Name</span>
              <input
                type="text"
                className="form-input"
                placeholder="prod-workloads"
                value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                required
              />
            </label>
            <label>
              <span className="form-label">Role ARN (optional)</span>
              <input
                type="text"
                className="form-input"
                placeholder="arn:aws:iam::123456789012:role/HealthDashboardReadRole"
                value={form.role_arn}
                onChange={(e) => setForm({ ...form, role_arn: e.target.value })}
              />
            </label>
          </div>
          <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: 16 }}>
            {saving ? 'Saving...' : 'Add Account'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading accounts...</p>
      ) : accounts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3>No accounts configured</h3>
            <p>Add your first AWS account to start monitoring. Each account needs the HealthDashboardReadRole deployed via StackSet.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Name</th>
                <th>Role ARN</th>
                <th>Status</th>
                <th>Last Synced</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.account_id}</td>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{a.account_name}</td>
                  <td className="mono" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.role_arn || '--'}
                  </td>
                  <td>
                    <button
                      className={`badge ${a.enabled ? 'badge-green' : 'badge-gray'}`}
                      onClick={() => toggleEnabled(a)}
                      title="Click to toggle"
                    >
                      {a.enabled ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="muted">{a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : 'Never'}</td>
                  <td>
                    <button className="btn-danger-sm" onClick={() => handleDelete(a.id, a.account_name)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
