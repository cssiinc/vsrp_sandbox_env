import { useState, useEffect, useCallback } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'
import { useAccountContext } from '../hooks/useAccountContext'

const STATUS_COLORS = {
  error: 'var(--error)',
  warning: 'var(--warning, orange)',
  ok: 'var(--success)',
  not_available: 'var(--muted)',
}

const CATEGORY_LABELS = {
  cost_optimizing: 'Cost Optimization',
  security: 'Security',
  fault_tolerance: 'Fault Tolerance',
  performance: 'Performance',
  service_limits: 'Service Limits',
}

export default function TrustedAdvisor() {
  const [data, setData] = useState({ checks: [], total: 0 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const { selectedAccount: ctxAccount } = useAccountContext()
  const [filters, setFilters] = useState({ account: ctxAccount, category: '', status: '', search: '' })
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const accountMap = useAccountMap()

  useEffect(() => { setFilters(f => ({ ...f, account: ctxAccount })); setPage(1) }, [ctxAccount])

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 50 })
    if (filters.account) params.set('account', filters.account)
    if (filters.category) params.set('category', filters.category)
    if (filters.status) params.set('status', filters.status)
    if (filters.search) params.set('search', filters.search)

    Promise.all([
      fetch(`/api/trusted-advisor?${params}`).then(r => r.json()),
      fetch('/api/trusted-advisor/summary').then(r => r.json()),
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
      const res = await fetch(`/api/trusted-advisor/${id}`)
      setDetail(await res.json())
    } catch { setDetail(null) }
  }

  const updateFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
    setPage(1)
  }

  const totalPages = Math.ceil(data.total / 50)
  const fmt$ = (v) => v ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'

  return (
    <div className="page">
      <div className="page-header">
        <h1>Trusted Advisor</h1>
        <p className="page-subtitle">AWS best-practice recommendations — cost optimization, security, fault tolerance, performance</p>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Est. Monthly Savings" value={fmt$(summary.total_estimated_savings)} color={summary.total_estimated_savings > 0 ? 'var(--success)' : 'var(--text)'} />
          <SummaryCard label="Action Required" value={summary.by_status?.error || 0} color={(summary.by_status?.error || 0) > 0 ? 'var(--error)' : 'var(--success)'} />
          <SummaryCard label="Warnings" value={summary.by_status?.warning || 0} color={(summary.by_status?.warning || 0) > 0 ? 'var(--warning, orange)' : 'var(--success)'} />
          <SummaryCard label="All Good" value={summary.by_status?.ok || 0} color="var(--success)" />
        </div>
      )}

      {summary?.by_category?.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--muted)' }}>By Category</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {summary.by_category.map(c => (
              <div key={c.category}
                style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => updateFilter('category', c.category)}
              >
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{CATEGORY_LABELS[c.category] || c.category}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  {c.errors > 0 && <span style={{ color: 'var(--error)' }}>{c.errors} errors</span>}
                  {c.warnings > 0 && <span style={{ color: 'var(--warning, orange)' }}>{c.warnings} warnings</span>}
                  <span className="muted">{c.total} total</span>
                </div>
              </div>
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
        <select value={filters.category} onChange={e => updateFilter('category', e.target.value)}>
          <option value="">All Categories</option>
          <option value="cost_optimizing">Cost Optimization</option>
          <option value="security">Security</option>
          <option value="fault_tolerance">Fault Tolerance</option>
          <option value="performance">Performance</option>
          <option value="service_limits">Service Limits</option>
        </select>
        <select value={filters.status} onChange={e => updateFilter('status', e.target.value)}>
          <option value="">All Statuses</option>
          <option value="error">Action Required</option>
          <option value="warning">Warning</option>
          <option value="ok">OK</option>
        </select>
        <input
          type="text" placeholder="Search check name..."
          value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          style={{ minWidth: 200 }}
        />
      </div>

      {loading ? (
        <p className="muted">Loading Trusted Advisor checks...</p>
      ) : data.checks.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No Trusted Advisor data</h3>
            <p>Requires Business or Enterprise Support plan. Trigger a sync to check availability.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Check Name</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Flagged</th>
                  <th>Savings</th>
                  <th>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {data.checks.map(c => (
                  <>
                    <tr key={c.id} onClick={() => toggleExpand(c.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="severity-badge" style={{
                          color: STATUS_COLORS[c.status] || 'var(--muted)',
                          borderColor: STATUS_COLORS[c.status] || 'var(--muted)',
                        }}>
                          {c.status === 'error' ? 'Action Required' : c.status === 'warning' ? 'Warning' : c.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{c.check_name}</td>
                      <td>{CATEGORY_LABELS[c.category] || c.category}</td>
                      <td><AccountName id={c.account_id} /></td>
                      <td>{c.resources_flagged > 0 ? <span style={{ color: 'var(--error)' }}>{c.resources_flagged}</span> : '0'}</td>
                      <td>{c.estimated_savings > 0 ? <span style={{ color: 'var(--success)', fontWeight: 500 }}>{fmt$(c.estimated_savings)}/mo</span> : '--'}</td>
                      <td className="muted">{c.synced_at ? new Date(c.synced_at).toLocaleString() : '--'}</td>
                    </tr>
                    {expanded === c.id && detail && (
                      <tr key={`${c.id}-detail`}>
                        <td colSpan="7" style={{ background: 'var(--bg-secondary, #1a1a2e)', padding: 16 }}>
                          {detail.description && (
                            <div style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.5 }}>
                              {detail.description}
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                            <MiniStat label="Processed" value={detail.resources_processed} />
                            <MiniStat label="Flagged" value={detail.resources_flagged} color="var(--error)" />
                            <MiniStat label="Suppressed" value={detail.resources_suppressed} />
                            <MiniStat label="Ignored" value={detail.resources_ignored} />
                          </div>
                          {detail.flagged_resources && detail.flagged_resources.length > 0 && (
                            <details style={{ marginTop: 8 }}>
                              <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>Flagged Resources ({detail.flagged_resources.length})</summary>
                              <pre style={{ fontSize: 11, maxHeight: 300, overflow: 'auto', marginTop: 8, padding: 12, background: 'var(--bg, #0d0d1a)', borderRadius: 6 }}>
                                {JSON.stringify(detail.flagged_resources, null, 2)}
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

function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || 'var(--text)' }}>{value || 0}</div>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
    </div>
  )
}
