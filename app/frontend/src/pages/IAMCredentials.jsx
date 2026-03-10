import { useState, useEffect, useCallback } from 'react'
import { AccountName, useAccountMap, accountOptions } from '../hooks/useAccountMap'

const KEY_AGE_WARN_DAYS = 90

function daysSince(dateStr) {
  if (!dateStr) return null
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.floor(ms / 86400000)
}

function AgeBadge({ dateStr, warnDays = KEY_AGE_WARN_DAYS }) {
  const days = daysSince(dateStr)
  if (days === null) return <span className="muted">--</span>
  const color = days > warnDays ? 'var(--error)' : days > 60 ? 'var(--warning, orange)' : 'var(--success)'
  return <span style={{ color, fontWeight: 500 }}>{days}d</span>
}

function BoolBadge({ value, trueLabel = 'Yes', falseLabel = 'No', invert = false }) {
  const isGood = invert ? !value : value
  return (
    <span className="severity-badge" style={{
      color: isGood ? 'var(--success)' : 'var(--error)',
      borderColor: isGood ? 'var(--success)' : 'var(--error)',
    }}>
      {value ? trueLabel : falseLabel}
    </span>
  )
}

export default function IAMCredentials() {
  const [data, setData] = useState({ credentials: [], total: 0 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ account: '', mfa: '', key_active: '', search: '' })
  const accountMap = useAccountMap()

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 50 })
    if (filters.account) params.set('account', filters.account)
    if (filters.mfa) params.set('mfa', filters.mfa)
    if (filters.key_active) params.set('key_active', filters.key_active)
    if (filters.search) params.set('search', filters.search)

    Promise.all([
      fetch(`/api/iam?${params}`).then(r => r.json()),
      fetch('/api/iam/summary').then(r => r.json()),
    ]).then(([d, s]) => {
      setData(d)
      setSummary(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [page, filters])

  useEffect(() => { fetchData() }, [fetchData])

  const updateFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
    setPage(1)
  }

  const totalPages = Math.ceil(data.total / 50)

  return (
    <div className="page">
      <div className="page-header">
        <h1>IAM Credential Report</h1>
        <p className="page-subtitle">User credential hygiene across all accounts — MFA status, access key age, password activity</p>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Total Users" value={summary.total_users} />
          <SummaryCard label="No MFA" value={summary.no_mfa} color={summary.no_mfa > 0 ? 'var(--error)' : 'var(--success)'} />
          <SummaryCard label="Root No MFA" value={summary.root_no_mfa} color={summary.root_no_mfa > 0 ? 'var(--error)' : 'var(--success)'} />
          <SummaryCard label="Stale Keys (>90d)" value={summary.stale_keys} color={summary.stale_keys > 0 ? 'var(--error)' : 'var(--success)'} />
          <SummaryCard label="Unused Keys" value={summary.unused_keys} color={summary.unused_keys > 0 ? 'var(--warning, orange)' : 'var(--success)'} />
          <SummaryCard label="With Access Keys" value={summary.users_with_keys} />
          <SummaryCard label="Accounts" value={summary.account_count} />
        </div>
      )}

      <div className="filter-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filters.account} onChange={e => updateFilter('account', e.target.value)}>
          <option value="">All Accounts</option>
          {accountOptions(accountMap).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={filters.mfa} onChange={e => updateFilter('mfa', e.target.value)}>
          <option value="">MFA: All</option>
          <option value="true">MFA Enabled</option>
          <option value="false">MFA Disabled</option>
        </select>
        <select value={filters.key_active} onChange={e => updateFilter('key_active', e.target.value)}>
          <option value="">Keys: All</option>
          <option value="true">Has Active Keys</option>
          <option value="stale">Stale Keys (&gt;90d)</option>
        </select>
        <input
          type="text" placeholder="Search user or ARN..."
          value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          style={{ minWidth: 200 }}
        />
      </div>

      {loading ? (
        <p className="muted">Loading credential report...</p>
      ) : data.credentials.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No credential data</h3>
            <p>Trigger a sync to pull IAM credential reports from your accounts.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Account</th>
                  <th>MFA</th>
                  <th>Password</th>
                  <th>Key 1</th>
                  <th>Key 1 Age</th>
                  <th>Key 2</th>
                  <th>Key 2 Age</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {data.credentials.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, color: c.iam_user === '<root_account>' ? 'var(--error)' : 'var(--text)' }}>
                      {c.iam_user === '<root_account>' ? 'ROOT' : c.iam_user}
                    </td>
                    <td><AccountName id={c.account_id} /></td>
                    <td><BoolBadge value={c.mfa_active} /></td>
                    <td><BoolBadge value={c.password_enabled} trueLabel="Enabled" falseLabel="None" /></td>
                    <td><BoolBadge value={c.access_key_1_active} trueLabel="Active" falseLabel="--" /></td>
                    <td>{c.access_key_1_active ? <AgeBadge dateStr={c.access_key_1_last_rotated} /> : <span className="muted">--</span>}</td>
                    <td><BoolBadge value={c.access_key_2_active} trueLabel="Active" falseLabel="--" /></td>
                    <td>{c.access_key_2_active ? <AgeBadge dateStr={c.access_key_2_last_rotated} /> : <span className="muted">--</span>}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {c.access_key_1_last_used_service || c.access_key_2_last_used_service || c.password_last_used
                        ? (c.access_key_1_last_used_service || c.access_key_2_last_used_service || new Date(c.password_last_used).toLocaleDateString())
                        : '--'}
                    </td>
                  </tr>
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
