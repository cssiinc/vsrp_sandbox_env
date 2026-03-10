import { useState, useEffect, useCallback } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'

const SEVERITY_COLORS = {
  CRITICAL: 'var(--error)',
  HIGH: '#e85d4a',
  MEDIUM: 'var(--warning, orange)',
  LOW: 'var(--accent)',
  INFORMATIONAL: 'var(--muted)',
}

export default function Inspector() {
  const [data, setData] = useState({ findings: [], total: 0 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ account: '', severity: '', repository: '', package_name: '', exploit: '', search: '' })
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const accountMap = useAccountMap()

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 50 })
    if (filters.account) params.set('account', filters.account)
    if (filters.severity) params.set('severity', filters.severity)
    if (filters.repository) params.set('repository', filters.repository)
    if (filters.package_name) params.set('package_name', filters.package_name)
    if (filters.exploit) params.set('exploit', filters.exploit)
    if (filters.search) params.set('search', filters.search)

    Promise.all([
      fetch(`/api/inspector?${params}`).then(r => r.json()),
      fetch('/api/inspector/summary').then(r => r.json()),
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
      const res = await fetch(`/api/inspector/${id}`)
      setDetail(await res.json())
    } catch { setDetail(null) }
  }

  const updateFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
    setPage(1)
  }

  const totalPages = Math.ceil(data.total / 50)
  const repos = summary?.by_repository?.map(r => r.repository).filter(Boolean) || []

  return (
    <div className="page">
      <div className="page-header">
        <h1>Inspector</h1>
        <p className="page-subtitle">Container image and package vulnerability findings</p>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Total Vulns" value={summary.total} />
          <SummaryCard label="Critical" value={summary.critical} color={summary.critical > 0 ? SEVERITY_COLORS.CRITICAL : 'var(--success)'} />
          <SummaryCard label="High" value={summary.high} color={summary.high > 0 ? SEVERITY_COLORS.HIGH : 'var(--success)'} />
          <SummaryCard label="Medium" value={summary.medium} color={summary.medium > 0 ? SEVERITY_COLORS.MEDIUM : 'var(--success)'} />
          <SummaryCard label="Exploitable" value={summary.exploitable} color={summary.exploitable > 0 ? 'var(--error)' : 'var(--success)'} />
          <SummaryCard label="Fix Available" value={summary.fixable} color="var(--accent)" />
        </div>
      )}

      {summary?.by_repository?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 16 }}>
          {summary.by_repository.map(r => (
            <div key={r.repository} className="card" style={{ padding: '12px 16px', cursor: 'pointer' }}
              onClick={() => updateFilter('repository', filters.repository === r.repository ? '' : r.repository)}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{r.repository || 'Unknown'}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span>{r.count} total</span>
                {r.critical > 0 && <span style={{ color: SEVERITY_COLORS.CRITICAL }}>{r.critical} critical</span>}
                {r.high > 0 && <span style={{ color: SEVERITY_COLORS.HIGH }}>{r.high} high</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary?.top_packages?.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--muted)' }}>Most Vulnerable Packages</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {summary.top_packages.map(p => (
              <button key={p.package_name} className="severity-badge"
                style={{
                  cursor: 'pointer', background: 'none', fontSize: 12,
                  color: p.has_exploit ? 'var(--error)' : 'var(--text)',
                  borderColor: p.has_exploit ? 'var(--error)' : 'var(--border)',
                }}
                onClick={() => updateFilter('package_name', p.package_name)}
              >
                {p.package_name} ({p.count}){p.has_exploit ? ' !' : ''}
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
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filters.repository} onChange={e => updateFilter('repository', e.target.value)}>
          <option value="">All Repos</option>
          {repos.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filters.exploit} onChange={e => updateFilter('exploit', e.target.value)}>
          <option value="">Exploit: All</option>
          <option value="true">Exploitable Only</option>
        </select>
        <input
          type="text" placeholder="Search CVE, package, title..."
          value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          style={{ minWidth: 200 }}
        />
      </div>

      {loading ? (
        <p className="muted">Loading Inspector findings...</p>
      ) : data.findings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No Inspector findings</h3>
            <p>Inspector may not be enabled or no vulnerabilities were found. Trigger a sync to check.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>CVE</th>
                  <th>Package</th>
                  <th>Version</th>
                  <th>Fix</th>
                  <th>Repository</th>
                  <th>Score</th>
                  <th>Exploit</th>
                </tr>
              </thead>
              <tbody>
                {data.findings.map(f => (
                  <>
                    <tr key={f.id} onClick={() => toggleExpand(f.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="severity-badge" style={{
                          color: SEVERITY_COLORS[f.severity] || 'var(--muted)',
                          borderColor: SEVERITY_COLORS[f.severity] || 'var(--muted)',
                        }}>
                          {f.severity}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{f.vuln_id || '--'}</td>
                      <td style={{ fontWeight: 500 }}>{f.package_name || '--'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{f.package_version || '--'}</td>
                      <td className="mono" style={{ fontSize: 12, color: f.fixed_in ? 'var(--success)' : 'var(--muted)' }}>
                        {f.fixed_in || '--'}
                      </td>
                      <td style={{ fontSize: 12 }}>{f.repository || '--'}</td>
                      <td>
                        <span style={{ color: f.inspector_score >= 7 ? 'var(--error)' : f.inspector_score >= 4 ? 'var(--warning, orange)' : 'var(--text)', fontWeight: 600 }}>
                          {f.inspector_score?.toFixed(1) || '--'}
                        </span>
                      </td>
                      <td>
                        {f.exploit_available ? (
                          <span style={{ color: 'var(--error)', fontWeight: 700, fontSize: 12 }}>YES</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>No</span>
                        )}
                      </td>
                    </tr>
                    {expanded === f.id && detail && (
                      <tr key={`${f.id}-detail`}>
                        <td colSpan="8" style={{ background: 'var(--bg-secondary, #1a1a2e)', padding: 16 }}>
                          <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>{detail.title}</div>
                          <div style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                            {detail.description}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 10, fontSize: 13 }}>
                            <div><strong>Account:</strong> <AccountName id={detail.account_id} /></div>
                            <div><strong>Platform:</strong> {detail.platform || '--'}</div>
                            <div><strong>Package Manager:</strong> {detail.package_manager || '--'}</div>
                            <div><strong>Image:</strong> <span className="mono" style={{ fontSize: 11 }}>{detail.image_hash?.slice(0, 20) || '--'}</span></div>
                            <div><strong>First Seen:</strong> {detail.first_seen ? new Date(detail.first_seen).toLocaleString() : '--'}</div>
                            <div><strong>Tags:</strong> {detail.image_tags?.length > 0 ? detail.image_tags.join(', ') : '--'}</div>
                          </div>
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
