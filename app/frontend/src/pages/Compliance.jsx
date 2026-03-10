import { useState, useEffect } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'

const COMPLIANCE_COLORS = {
  COMPLIANT: 'var(--success)',
  NON_COMPLIANT: 'var(--error)',
  NOT_APPLICABLE: 'var(--muted)',
  INSUFFICIENT_DATA: 'var(--warning)',
}

export default function Compliance() {
  const accountMap = useAccountMap()
  const [rules, setRules] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ compliance_type: '', account: '', rule_name: '' })
  const [syncing, setSyncing] = useState(false)
  const limit = 30

  const fetchRules = () => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit })
    if (filters.compliance_type) params.set('compliance_type', filters.compliance_type)
    if (filters.account) params.set('account', filters.account)
    if (filters.rule_name) params.set('rule_name', filters.rule_name)

    fetch(`/api/compliance?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setRules(data.rules || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchRules() }, [page, filters])
  useEffect(() => {
    fetch('/api/compliance/summary').then(r => r.json()).then(setSummary).catch(() => {})
  }, [])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/config-compliance', { method: 'POST' })
      setTimeout(() => { fetchRules(); setSyncing(false) }, 8000)
    } catch { setSyncing(false) }
  }

  const totalPages = Math.ceil(total / limit)
  const s = summary?.summary || {}
  const compliant = s.COMPLIANT || 0
  const nonCompliant = s.NON_COMPLIANT || 0
  const totalRules = compliant + nonCompliant + (s.NOT_APPLICABLE || 0) + (s.INSUFFICIENT_DATA || 0)
  const compPct = totalRules > 0 ? Math.round((compliant / totalRules) * 100) : '--'

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Config Compliance</h1>
          <p className="page-subtitle">{total} rules evaluated across all accounts</p>
        </div>
        <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {summary && totalRules > 0 && (
        <div className="stat-grid">
          <div className="stat-card" style={{ borderTop: '3px solid var(--success)' }}>
            <p className="stat-title">Compliant</p>
            <p className="stat-value" style={{ color: 'var(--success)' }}>{compliant}</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--error)' }}>
            <p className="stat-title">Non-Compliant</p>
            <p className="stat-value" style={{ color: nonCompliant > 0 ? 'var(--error)' : undefined }}>{nonCompliant}</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--accent)' }}>
            <p className="stat-title">Compliance Score</p>
            <p className="stat-value">{compPct}%</p>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--muted)' }}>
            <p className="stat-title">Total Rules</p>
            <p className="stat-value">{totalRules}</p>
          </div>
        </div>
      )}

      <div className="filter-bar" style={{ marginTop: summary && totalRules > 0 ? 16 : 0 }}>
        <select
          className="form-input filter-select"
          value={filters.compliance_type}
          onChange={(e) => { setPage(1); setFilters({ ...filters, compliance_type: e.target.value }) }}
        >
          <option value="">All Statuses</option>
          <option value="COMPLIANT">Compliant</option>
          <option value="NON_COMPLIANT">Non-Compliant</option>
          <option value="NOT_APPLICABLE">Not Applicable</option>
          <option value="INSUFFICIENT_DATA">Insufficient Data</option>
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
          placeholder="Rule name"
          value={filters.rule_name}
          onChange={(e) => { setPage(1); setFilters({ ...filters, rule_name: e.target.value }) }}
        />
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading compliance data...</p>
      ) : rules.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3>No compliance data yet</h3>
            <p>Enable AWS Config rules and click "Sync Now" to evaluate compliance.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Rule Name</th>
                  <th>Account</th>
                  <th>Compliant</th>
                  <th>Non-Compliant</th>
                  <th>Region</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="severity-badge" style={{ color: COMPLIANCE_COLORS[r.compliance_type], borderColor: COMPLIANCE_COLORS[r.compliance_type] }}>
                        {r.compliance_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text)', fontWeight: 500, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.config_rule_name}
                    </td>
                    <td><AccountName id={r.account_id} /></td>
                    <td style={{ color: 'var(--success)' }}>{r.compliant_count}</td>
                    <td style={{ color: r.non_compliant_count > 0 ? 'var(--error)' : 'var(--muted)' }}>{r.non_compliant_count}</td>
                    <td>{r.aws_region || '--'}</td>
                    <td className="muted">{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '--'}</td>
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
