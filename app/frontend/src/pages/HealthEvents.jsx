import { useState, useEffect } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'
import { useAccountContext } from '../hooks/useAccountContext'

const STATUS_COLORS = {
  open: 'var(--error)',
  upcoming: 'var(--warning)',
  closed: 'var(--success)',
}

const CATEGORY_LABELS = {
  issue: 'Issue',
  scheduledChange: 'Scheduled',
  accountNotification: 'Notification',
}

export default function HealthEvents() {
  const { selectedAccount: ctxAccount } = useAccountContext()
  const accountMap = useAccountMap()
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', service: '', category: '', account: ctxAccount })

  useEffect(() => { setFilters(f => ({ ...f, account: ctxAccount })); setPage(1) }, [ctxAccount])
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const limit = 30

  const fetchEvents = () => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit })
    if (filters.status) params.set('status', filters.status)
    if (filters.service) params.set('service', filters.service)
    if (filters.category) params.set('category', filters.category)
    if (filters.account) params.set('account', filters.account)

    fetch(`/api/health-events?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchEvents() }, [page, filters])
  useEffect(() => {
    fetch('/api/health-events/summary').then(r => r.json()).then(setSummary).catch(() => {})
  }, [])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/health-events', { method: 'POST' })
      setTimeout(() => { fetchEvents(); setSyncing(false) }, 8000)
    } catch { setSyncing(false) }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>AWS Health Events</h1>
          <p className="page-subtitle">
            {summary ? `${summary.total} events, ${summary.open} currently active` : 'Loading...'}
          </p>
        </div>
        <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {summary && summary.total > 0 && (
        <div className="stat-grid">
          <div className="stat-card" style={{ borderTop: '3px solid var(--error)' }}>
            <p className="stat-title">Open Issues</p>
            <p className="stat-value" style={{ color: summary.open > 0 ? 'var(--error)' : undefined }}>{summary.open}</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
            <p className="stat-title">Upcoming</p>
            <p className="stat-value" style={{ color: summary.upcoming > 0 ? 'var(--warning)' : undefined }}>{summary.upcoming}</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--success)' }}>
            <p className="stat-title">Closed (30d)</p>
            <p className="stat-value">{summary.closed}</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--muted)' }}>
            <p className="stat-title">Total Events</p>
            <p className="stat-value">{summary.total}</p>
          </div>
        </div>
      )}

      <div className="filter-bar" style={{ marginTop: summary && summary.total > 0 ? 16 : 0 }}>
        <select
          className="form-input filter-select"
          value={filters.status}
          onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }) }}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="upcoming">Upcoming</option>
          <option value="closed">Closed</option>
        </select>
        <select
          className="form-input filter-select"
          value={filters.category}
          onChange={(e) => { setPage(1); setFilters({ ...filters, category: e.target.value }) }}
        >
          <option value="">All Categories</option>
          <option value="issue">Issue</option>
          <option value="scheduledChange">Scheduled Change</option>
          <option value="accountNotification">Account Notification</option>
        </select>
        <input
          className="form-input filter-select"
          placeholder="Service (e.g. EC2)"
          value={filters.service}
          onChange={(e) => { setPage(1); setFilters({ ...filters, service: e.target.value }) }}
        />
        <select
          className="form-input filter-select"
          value={filters.account}
          onChange={(e) => { setPage(1); setFilters({ ...filters, account: e.target.value }) }}
        >
          <option value="">All Accounts</option>
          {accountOptions(accountMap).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading health events...</p>
      ) : events.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <h3>No health events</h3>
            <p>Click "Sync Now" to check for AWS service health events affecting your accounts.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Service</th>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Region</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <>
                    <tr key={e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="severity-badge" style={{ color: STATUS_COLORS[e.status], borderColor: STATUS_COLORS[e.status] }}>
                          {e.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text)' }}>{e.service}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.event_type_code}
                      </td>
                      <td>{CATEGORY_LABELS[e.event_type_category] || e.event_type_category}</td>
                      <td><AccountName id={e.account_id} /></td>
                      <td>{e.aws_region || 'global'}</td>
                      <td className="muted">{e.start_time ? new Date(e.start_time).toLocaleDateString() : '--'}</td>
                    </tr>
                    {expanded === e.id && e.description && (
                      <tr key={`${e.id}-desc`}>
                        <td colSpan={7} style={{ background: 'var(--bg-raised)', padding: 16, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {e.description}
                        </td>
                      </tr>
                    )}
                  </>
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
