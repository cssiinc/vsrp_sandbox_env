import { useState, useEffect, useCallback } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'
import { useAccountContext } from '../hooks/useAccountContext'

const SEVERITY_COLORS = {
  HIGH: 'var(--error)',
  MEDIUM: 'var(--warning, orange)',
  LOW: 'var(--accent)',
}

export default function GuardDuty() {
  const [data, setData] = useState({ findings: [], total: 0 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const { selectedAccount: ctxAccount } = useAccountContext()
  const [filters, setFilters] = useState({ account: ctxAccount, severity: '', type: '', search: '' })
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const accountMap = useAccountMap()

  useEffect(() => { setFilters(f => ({ ...f, account: ctxAccount })); setPage(1) }, [ctxAccount])

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 50 })
    if (filters.account) params.set('account', filters.account)
    if (filters.severity) params.set('severity', filters.severity)
    if (filters.type) params.set('type', filters.type)
    if (filters.search) params.set('search', filters.search)

    Promise.all([
      fetch(`/api/guardduty?${params}`).then(r => r.json()),
      fetch('/api/guardduty/summary').then(r => r.json()),
    ]).then(([d, s]) => {
      setData(d)
      setSummary(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [page, filters])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); setDetail(null); return }
    setExpanded(id)
    try {
      const res = await fetch(`/api/guardduty/${id}`)
      setDetail(await res.json())
    } catch { setDetail(null) }
  }

  const updateFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
    setPage(1)
  }

  const totalPages = Math.ceil(data.total / 50)

  return (
    <div className="page">
      <div className="page-header">
        <h1>GuardDuty Threats</h1>
        <p className="page-subtitle">Active threat detection findings across all accounts</p>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Total Active" value={summary.total} />
          <SummaryCard label="High Severity" value={summary.by_severity?.HIGH || 0} color={summary.by_severity?.HIGH > 0 ? 'var(--error)' : 'var(--success)'} />
          <SummaryCard label="Medium" value={summary.by_severity?.MEDIUM || 0} color={summary.by_severity?.MEDIUM > 0 ? 'var(--warning, orange)' : 'var(--success)'} />
          <SummaryCard label="Low" value={summary.by_severity?.LOW || 0} />
        </div>
      )}

      {summary?.top_types?.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--muted)' }}>Top Finding Types</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {summary.top_types.map(t => (
              <button
                key={t.type}
                className="severity-badge"
                style={{ cursor: 'pointer', borderColor: 'var(--border)', color: 'var(--text)', background: 'none', fontSize: 12 }}
                onClick={() => updateFilter('type', t.type)}
              >
                {t.type.split('/').pop()} ({t.count})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filter-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filters.account} onChange={e => updateFilter('account', e.target.value)}>
          <option value="">All Accounts</option>
          {accountOptions(accountMap).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={filters.severity} onChange={e => updateFilter('severity', e.target.value)}>
          <option value="">All Severities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <input
          type="text" placeholder="Filter by type..."
          value={filters.type}
          onChange={e => updateFilter('type', e.target.value)}
          style={{ minWidth: 180 }}
        />
        <input
          type="text" placeholder="Search title or description..."
          value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          style={{ minWidth: 200 }}
        />
      </div>

      {loading ? (
        <p className="muted">Loading GuardDuty findings...</p>
      ) : data.findings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No GuardDuty findings</h3>
            <p>Either GuardDuty is not enabled or there are no active threats. Trigger a sync to check.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Resource</th>
                  <th>Count</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {data.findings.map(f => (
                  <>
                    <tr key={f.id} onClick={() => toggleExpand(f.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="severity-badge" style={{
                          color: SEVERITY_COLORS[f.severity_label] || 'var(--muted)',
                          borderColor: SEVERITY_COLORS[f.severity_label] || 'var(--muted)',
                        }}>
                          {f.severity_label} ({f.severity?.toFixed(1)})
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.title}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{f.type?.split('/').pop()}</td>
                      <td><AccountName id={f.account_id} /></td>
                      <td className="mono" style={{ fontSize: 11 }}>{f.resource_id || '--'}</td>
                      <td>{f.count}</td>
                      <td className="muted">{f.last_seen ? new Date(f.last_seen).toLocaleString() : '--'}</td>
                    </tr>
                    {expanded === f.id && detail && (
                      <tr key={`${f.id}-detail`}>
                        <td colSpan="7" style={{ background: 'var(--bg-secondary, #1a1a2e)', padding: 16 }}>
                          <div style={{ marginBottom: 8 }}><strong>Description:</strong> {detail.description}</div>
                          <div style={{ marginBottom: 8 }}><strong>Type:</strong> <span className="mono">{detail.type}</span></div>
                          <div style={{ marginBottom: 8 }}><strong>Region:</strong> {detail.region}</div>
                          <div style={{ marginBottom: 8 }}><strong>First Seen:</strong> {detail.first_seen ? new Date(detail.first_seen).toLocaleString() : '--'}</div>
                          {detail.raw_json && (
                            <details style={{ marginTop: 8 }}>
                              <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>Raw JSON</summary>
                              <pre style={{ fontSize: 11, maxHeight: 400, overflow: 'auto', marginTop: 8, padding: 12, background: 'var(--bg, #0d0d1a)', borderRadius: 6 }}>
                                {JSON.stringify(detail.raw_json, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
              <span className="muted" style={{ lineHeight: '32px' }}>Page {page} of {totalPages}</span>
              <button className="btn-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)' }}>{value ?? '--'}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  )
}
