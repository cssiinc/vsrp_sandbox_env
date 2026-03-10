import { useState, useEffect } from 'react'

const SEVERITY_COLORS = {
  CRITICAL: 'var(--error)',
  HIGH: 'var(--warning)',
  MEDIUM: '#f59e0b',
  LOW: 'var(--accent)',
  INFORMATIONAL: 'var(--muted)',
}

export default function Findings() {
  const [findings, setFindings] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ severity: '', source: '', account: '' })
  const [syncing, setSyncing] = useState(false)
  const limit = 25

  const fetchFindings = () => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit })
    if (filters.severity) params.set('severity', filters.severity)
    if (filters.source) params.set('source', filters.source)
    if (filters.account) params.set('account', filters.account)

    fetch(`/api/findings?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setFindings(data.findings || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchFindings() }, [page, filters])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/security-hub', { method: 'POST' })
      // Poll for completion
      setTimeout(() => {
        fetchFindings()
        setSyncing(false)
      }, 5000)
    } catch {
      setSyncing(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Security Findings</h1>
          <p className="page-subtitle">
            {total} findings across all accounts
          </p>
        </div>
        <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="filter-bar">
        <select
          className="form-input filter-select"
          value={filters.severity}
          onChange={(e) => { setPage(1); setFilters({ ...filters, severity: e.target.value }) }}
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
          <option value="INFORMATIONAL">Informational</option>
        </select>
        <select
          className="form-input filter-select"
          value={filters.source}
          onChange={(e) => { setPage(1); setFilters({ ...filters, source: e.target.value }) }}
        >
          <option value="">All Sources</option>
          <option value="securityhub">Security Hub</option>
          <option value="guardduty">GuardDuty</option>
          <option value="access-analyzer">Access Analyzer</option>
        </select>
        <input
          className="form-input filter-select"
          placeholder="Account ID"
          value={filters.account}
          onChange={(e) => { setPage(1); setFilters({ ...filters, account: e.target.value }) }}
        />
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading findings...</p>
      ) : findings.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3>No findings yet</h3>
            <p>Add accounts and click "Sync Now" to pull Security Hub findings.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Title</th>
                  <th>Account</th>
                  <th>Source</th>
                  <th>Resource</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="severity-badge" style={{ color: SEVERITY_COLORS[f.severity], borderColor: SEVERITY_COLORS[f.severity] }}>
                        {f.severity}
                      </span>
                    </td>
                    <td style={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                      {f.title}
                    </td>
                    <td className="mono">{f.account_id}</td>
                    <td>{f.source}</td>
                    <td className="mono" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.resource_type || '--'}
                    </td>
                    <td>{f.status}</td>
                    <td className="muted">{f.last_seen ? new Date(f.last_seen).toLocaleDateString() : '--'}</td>
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
