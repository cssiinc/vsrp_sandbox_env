import { useState, useEffect, useCallback } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'

const shortService = (s) => s ? s.replace('.amazonaws.com', '') : '--'

function MiniChart({ data, height = 50 }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => parseInt(d.total)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height }}>
      {data.map((d) => {
        const pct = (parseInt(d.total) / max) * 100
        const errorPct = parseInt(d.errors) > 0 ? (parseInt(d.errors) / parseInt(d.total)) * 100 : 0
        return (
          <div
            key={d.hour}
            title={`${new Date(d.hour).toLocaleTimeString()}: ${d.total} events, ${d.errors} errors`}
            style={{
              flex: 1, height: `${Math.max(pct, 3)}%`,
              background: errorPct > 20 ? 'var(--error)' : 'var(--accent)',
              borderRadius: '1px 1px 0 0', opacity: 0.8,
            }}
          />
        )
      })}
    </div>
  )
}

export default function LogExplorer() {
  const accountMap = useAccountMap()
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [expandedData, setExpandedData] = useState(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({
    account: '', event_name: '', event_source: '', username: '',
    source_ip: '', error_code: '', read_only: '', event_type: '',
  })
  const [timeRange, setTimeRange] = useState('24')
  const limit = 50

  const fetchLogs = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit })
    if (search) params.set('search', search)
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })

    // Time range filter
    const hours = parseInt(timeRange)
    if (hours > 0) {
      const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      params.set('from', from)
    }

    fetch(`/api/logs?${params}`)
      .then(r => r.json())
      .then(data => { setLogs(data.logs || []); setTotal(data.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [page, search, filters, timeRange])

  const fetchSummary = useCallback(() => {
    const params = new URLSearchParams({ hours: timeRange })
    if (filters.account) params.set('account', filters.account)

    Promise.all([
      fetch(`/api/logs/summary?${params}`).then(r => r.json()).catch(() => null),
      fetch(`/api/logs/timeline?${params}`).then(r => r.json()).catch(() => ({ timeline: [] })),
    ]).then(([sum, tl]) => {
      setSummary(sum)
      setTimeline(tl.timeline || [])
    })
  }, [timeRange, filters.account])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { fetchSummary() }, [fetchSummary])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/cloudtrail-s3', { method: 'POST' })
      setTimeout(() => { fetchLogs(); fetchSummary(); setSyncing(false) }, 10000)
    } catch { setSyncing(false) }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const expandRow = (id) => {
    if (expanded === id) { setExpanded(null); setExpandedData(null); return }
    setExpanded(id)
    fetch(`/api/logs/${id}`)
      .then(r => r.json())
      .then(setExpandedData)
      .catch(() => setExpandedData(null))
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Log Explorer</h1>
          <p className="page-subtitle">
            CloudTrail logs from S3 — {total.toLocaleString()} events
            {summary ? ` (${summary.errors} errors)` : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Logs'}
        </button>
      </div>

      {/* Summary cards */}
      {summary && summary.total > 0 && (
        <div className="stat-grid">
          <div className="stat-card" style={{ borderTop: '3px solid var(--accent)' }}>
            <p className="stat-title">Total Events</p>
            <p className="stat-value">{summary.total.toLocaleString()}</p>
            <p className="stat-subtitle">Last {summary.hours}h</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--error)' }}>
            <p className="stat-title">Errors</p>
            <p className="stat-value" style={{ color: summary.errors > 0 ? 'var(--error)' : undefined }}>
              {summary.errors.toLocaleString()}
            </p>
            <p className="stat-subtitle">
              {summary.total > 0 ? `${((summary.errors / summary.total) * 100).toFixed(1)}% error rate` : '--'}
            </p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
            <p className="stat-title">Write Events</p>
            <p className="stat-value">{summary.write_count.toLocaleString()}</p>
            <p className="stat-subtitle">{summary.read_count.toLocaleString()} read events</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--muted)' }}>
            <p className="stat-title">Unique Users</p>
            <p className="stat-value">{summary.top_users.length}</p>
            <p className="stat-subtitle">Top: {summary.top_users[0]?.username || '--'}</p>
          </div>
        </div>
      )}

      {/* Timeline chart */}
      {timeline.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header">
            <h3>Event Volume</h3>
            <span className="card-badge">Last {timeRange}h</span>
          </div>
          <MiniChart data={timeline} />
          {timeline.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span className="muted" style={{ fontSize: 10 }}>{new Date(timeline[0].hour).toLocaleTimeString()}</span>
              <span className="muted" style={{ fontSize: 10 }}>{new Date(timeline[timeline.length - 1].hour).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Search + filters */}
      <form onSubmit={handleSearch} style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="form-input"
            placeholder="Search events, users, services, IPs, errors..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '8px 20px' }}>Search</button>
          {search && (
            <button type="button" className="btn-secondary" style={{ padding: '8px 14px' }}
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}>Clear</button>
          )}
        </div>
      </form>

      <div className="filter-bar">
        <select className="form-input filter-select" value={timeRange}
          onChange={(e) => { setTimeRange(e.target.value); setPage(1) }}>
          <option value="1">Last 1 hour</option>
          <option value="6">Last 6 hours</option>
          <option value="24">Last 24 hours</option>
          <option value="72">Last 3 days</option>
          <option value="168">Last 7 days</option>
          <option value="720">Last 30 days</option>
        </select>
        <select className="form-input filter-select" value={filters.account}
          onChange={(e) => { setPage(1); setFilters({ ...filters, account: e.target.value }) }}>
          <option value="">All Accounts</option>
          {accountOptions(accountMap).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select className="form-input filter-select" value={filters.read_only}
          onChange={(e) => { setPage(1); setFilters({ ...filters, read_only: e.target.value }) }}>
          <option value="">All Events</option>
          <option value="false">Write Only</option>
          <option value="true">Read Only</option>
        </select>
        <input className="form-input filter-select" placeholder="Event name"
          value={filters.event_name}
          onChange={(e) => { setPage(1); setFilters({ ...filters, event_name: e.target.value }) }}
        />
        <input className="form-input filter-select" placeholder="Username"
          value={filters.username}
          onChange={(e) => { setPage(1); setFilters({ ...filters, username: e.target.value }) }}
        />
        <input className="form-input filter-select" placeholder="Source IP"
          value={filters.source_ip}
          onChange={(e) => { setPage(1); setFilters({ ...filters, source_ip: e.target.value }) }}
        />
        <input className="form-input filter-select" placeholder="Error code"
          value={filters.error_code}
          onChange={(e) => { setPage(1); setFilters({ ...filters, error_code: e.target.value }) }}
        />
      </div>

      {/* Top services + top users side-by-side */}
      {summary && summary.total > 0 && (
        <div className="dashboard-grid" style={{ marginTop: 12 }}>
          <div className="card">
            <div className="card-header">
              <h3>Top Services</h3>
              <span className="card-badge">Last {timeRange}h</span>
            </div>
            <div className="mini-table">
              {summary.top_services.map(s => (
                <div key={s.event_source} className="mini-row"
                  onClick={() => { setFilters({ ...filters, event_source: s.event_source }); setPage(1) }}
                  style={{ cursor: 'pointer' }}>
                  <span className="mini-service" style={{ flex: 1 }}>{shortService(s.event_source)}</span>
                  <span className="mini-count">{parseInt(s.count).toLocaleString()}</span>
                  <div className="mini-bar-track">
                    <div className="mini-bar" style={{ width: `${(parseInt(s.count) / parseInt(summary.top_services[0].count)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Top Users</h3>
              <span className="card-badge">Last {timeRange}h</span>
            </div>
            <div className="mini-table">
              {summary.top_users.map(u => (
                <div key={u.username} className="mini-row"
                  onClick={() => { setFilters({ ...filters, username: u.username }); setPage(1) }}
                  style={{ cursor: 'pointer' }}>
                  <span style={{ flex: 1, fontSize: 12 }}>{u.username}</span>
                  <span className="mini-count">{parseInt(u.count).toLocaleString()}</span>
                  <div className="mini-bar-track">
                    <div className="mini-bar" style={{ width: `${(parseInt(u.count) / parseInt(summary.top_users[0].count)) * 100}%`, background: 'var(--warning)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Log entries table */}
      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading logs...</p>
      ) : logs.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h3>No log entries found</h3>
            <p>Click "Sync Logs" to pull CloudTrail logs from S3, or adjust your filters.</p>
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
                  <th>R/W</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <>
                    <tr key={l.id} onClick={() => expandRow(l.id)} style={{ cursor: 'pointer' }}>
                      <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                        {new Date(l.event_time).toLocaleString()}
                      </td>
                      <td style={{ color: 'var(--text)', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.event_name}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{shortService(l.event_source)}</td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.username || '--'}
                      </td>
                      <td><AccountName id={l.account_id} /></td>
                      <td className="muted">{l.aws_region || '--'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{l.source_ip || '--'}</td>
                      <td>
                        <span style={{ color: l.read_only ? 'var(--muted)' : 'var(--warning)', fontSize: 11, fontWeight: 500 }}>
                          {l.read_only ? 'R' : 'W'}
                        </span>
                      </td>
                      <td>
                        {l.error_code ? (
                          <span className="severity-badge" style={{ color: 'var(--error)', borderColor: 'var(--error)', fontSize: 10 }}>
                            {l.error_code}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--success)', fontSize: 11 }}>OK</span>
                        )}
                      </td>
                    </tr>
                    {expanded === l.id && expandedData && (
                      <tr key={`${l.id}-detail`}>
                        <td colSpan={9} style={{ padding: 0, background: 'var(--bg-raised)' }}>
                          <div style={{ padding: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                              <div>
                                <p className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Event Type</p>
                                <p style={{ fontSize: 13 }}>{expandedData.event_type || '--'}</p>
                              </div>
                              <div>
                                <p className="muted" style={{ fontSize: 11, marginBottom: 4 }}>User Type</p>
                                <p style={{ fontSize: 13 }}>{expandedData.user_type || '--'}</p>
                              </div>
                              <div>
                                <p className="muted" style={{ fontSize: 11, marginBottom: 4 }}>User Agent</p>
                                <p style={{ fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {expandedData.user_agent || '--'}
                                </p>
                              </div>
                              <div>
                                <p className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Recipient Account</p>
                                <p style={{ fontSize: 13 }}>{expandedData.recipient_account || '--'}</p>
                              </div>
                            </div>
                            {expandedData.error_message && (
                              <div style={{ marginBottom: 12, padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 4, border: '1px solid rgba(239,68,68,0.2)' }}>
                                <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--error)', marginBottom: 4 }}>Error: {expandedData.error_code}</p>
                                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{expandedData.error_message}</p>
                              </div>
                            )}
                            {expandedData.raw_event && (
                              <details>
                                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--accent)', marginBottom: 8 }}>
                                  Raw CloudTrail Event
                                </summary>
                                <pre style={{
                                  fontSize: 11, lineHeight: 1.4, padding: 12,
                                  background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)',
                                  maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                }}>
                                  {JSON.stringify(expandedData.raw_event, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
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
              <span className="page-info">Page {page} of {totalPages} ({total.toLocaleString()} total)</span>
              <button className="btn-page" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
