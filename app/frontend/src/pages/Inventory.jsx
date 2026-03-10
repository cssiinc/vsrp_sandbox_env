import { useState, useEffect } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'

const shortType = (t) => t ? t.replace('AWS::', '') : '--'

export default function Inventory() {
  const accountMap = useAccountMap()
  const [resources, setResources] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ resource_type: '', account: '', name: '' })
  const [syncing, setSyncing] = useState(false)
  const limit = 30

  const fetchResources = () => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit })
    if (filters.resource_type) params.set('resource_type', filters.resource_type)
    if (filters.account) params.set('account', filters.account)
    if (filters.name) params.set('name', filters.name)

    fetch(`/api/inventory?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setResources(data.resources || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchResources() }, [page, filters])
  useEffect(() => {
    fetch('/api/inventory/summary').then(r => r.json()).then(setSummary).catch(() => {})
  }, [])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/resource-inventory', { method: 'POST' })
      setTimeout(() => { fetchResources(); setSyncing(false) }, 8000)
    } catch { setSyncing(false) }
  }

  const totalPages = Math.ceil(total / limit)
  const types = summary?.types || []

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Resource Inventory</h1>
          <p className="page-subtitle">
            {summary ? `${summary.total} resources across ${summary.account_count} account(s)` : 'Loading...'}
          </p>
        </div>
        <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {types.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          {types.slice(0, 6).map((t) => (
            <div key={t.resource_type} className="stat-card" style={{ borderTop: '3px solid var(--accent)' }}>
              <p className="stat-title">{shortType(t.resource_type)}</p>
              <p className="stat-value">{t.count}</p>
            </div>
          ))}
        </div>
      )}

      <div className="filter-bar">
        <select
          className="form-input filter-select"
          value={filters.resource_type}
          onChange={(e) => { setPage(1); setFilters({ ...filters, resource_type: e.target.value }) }}
        >
          <option value="">All Types</option>
          {types.map((t) => (
            <option key={t.resource_type} value={t.resource_type}>{shortType(t.resource_type)} ({t.count})</option>
          ))}
        </select>
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
          placeholder="Resource name"
          value={filters.name}
          onChange={(e) => { setPage(1); setFilters({ ...filters, name: e.target.value }) }}
        />
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading resources...</p>
      ) : resources.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
            <h3>No resources discovered</h3>
            <p>Enable AWS Config in your accounts and click "Sync Now" to discover resources.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Resource ID</th>
                  <th>Account</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Last Captured</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{shortType(r.resource_type)}</td>
                    <td style={{ color: 'var(--text)', fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.resource_name || '--'}
                    </td>
                    <td className="mono" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.resource_id}
                    </td>
                    <td><AccountName id={r.account_id} /></td>
                    <td>{r.aws_region}</td>
                    <td>
                      <span style={{ color: r.resource_status === 'OK' ? 'var(--success)' : 'var(--muted)' }}>
                        {r.resource_status || '--'}
                      </span>
                    </td>
                    <td className="muted">{r.config_capture_time ? new Date(r.config_capture_time).toLocaleDateString() : '--'}</td>
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
