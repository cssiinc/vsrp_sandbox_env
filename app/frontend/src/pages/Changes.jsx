import { useState, useEffect } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'
import { useAccountContext } from '../hooks/useAccountContext'

export default function Changes() {
  const { selectedAccount: ctxAccount } = useAccountContext()
  const accountMap = useAccountMap()
  const [changes, setChanges] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ account: ctxAccount, username: '', service: '', event_name: '' })

  useEffect(() => { setFilters(f => ({ ...f, account: ctxAccount })); setPage(1) }, [ctxAccount])
  const [syncing, setSyncing] = useState(false)
  const limit = 30

  const fetchChanges = () => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit })
    if (filters.account) params.set('account', filters.account)
    if (filters.username) params.set('username', filters.username)
    if (filters.service) params.set('service', filters.service)
    if (filters.event_name) params.set('event_name', filters.event_name)

    fetch(`/api/changes?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setChanges(data.changes || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchChanges() }, [page, filters])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/cloudtrail', { method: 'POST' })
      setTimeout(() => {
        fetchChanges()
        setSyncing(false)
      }, 5000)
    } catch {
      setSyncing(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  const formatTime = (t) => {
    if (!t) return '--'
    const d = new Date(t)
    return d.toLocaleString()
  }

  const shortService = (s) => s ? s.replace('.amazonaws.com', '') : '--'

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Infrastructure Change Log</h1>
          <p className="page-subtitle">
            {total} write events across all accounts
          </p>
        </div>
        <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="filter-bar">
        <select
          className="form-input filter-select"
          value={filters.account}
          onChange={(e) => { setPage(1); setFilters({ ...filters, account: e.target.value }) }}
        >
          <option value="">All Accounts</option>
          {accountOptions(accountMap).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <input
          className="form-input filter-select"
          placeholder="Username"
          value={filters.username}
          onChange={(e) => { setPage(1); setFilters({ ...filters, username: e.target.value }) }}
        />
        <input
          className="form-input filter-select"
          placeholder="Service (e.g. ec2.amazonaws.com)"
          value={filters.service}
          onChange={(e) => { setPage(1); setFilters({ ...filters, service: e.target.value }) }}
        />
        <input
          className="form-input filter-select"
          placeholder="Event name"
          value={filters.event_name}
          onChange={(e) => { setPage(1); setFilters({ ...filters, event_name: e.target.value }) }}
        />
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading events...</p>
      ) : changes.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3>No change events yet</h3>
            <p>Add accounts and click "Sync Now" to pull CloudTrail events.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Service</th>
                  <th>User</th>
                  <th>Account</th>
                  <th>Region</th>
                  <th>Source IP</th>
                  {/* Error column */}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatTime(c.event_time)}</td>
                    <td style={{ color: 'var(--text)', fontWeight: 500 }}>{c.event_name}</td>
                    <td className="mono">{shortService(c.event_source)}</td>
                    <td>{c.username || '--'}</td>
                    <td><AccountName id={c.account_id} /></td>
                    <td>{c.aws_region || '--'}</td>
                    <td className="mono">{c.source_ip || '--'}</td>
                    <td>
                      {c.error_code ? (
                        <span className="severity-badge" style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>
                          {c.error_code}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--success)' }}>OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-page" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button className="btn-page" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
