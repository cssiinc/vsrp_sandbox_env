import { useState, useEffect, useCallback } from 'react'

const fmt = (n) => {
  if (n == null) return '--'
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PctBadge({ value }) {
  if (value == null) return <span className="muted">new</span>
  const color = value > 10 ? 'var(--error)' : value > 0 ? 'var(--warning)' : 'var(--success)'
  const arrow = value > 0 ? '\u2191' : value < 0 ? '\u2193' : ''
  return <span style={{ color, fontWeight: 500, fontSize: 12 }}>{arrow}{Math.abs(value).toFixed(1)}%</span>
}

function MiniChart({ data, height = 40, color = 'var(--accent)' }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => parseFloat(d.daily_total)), 0.01)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height }}>
      {data.map((d) => {
        const pct = (parseFloat(d.daily_total) / max) * 100
        return (
          <div
            key={d.period_start}
            title={`${d.period_start}: ${fmt(d.daily_total)}`}
            style={{
              flex: 1, height: `${Math.max(pct, 3)}%`,
              background: color, borderRadius: '1px 1px 0 0', opacity: 0.8,
            }}
          />
        )
      })}
    </div>
  )
}

export default function Costs() {
  const [summary, setSummary] = useState(null)
  const [trend, setTrend] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [services, setServices] = useState([])
  const [accountServices, setAccountServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [expandedService, setExpandedService] = useState(null)
  const [serviceDetail, setServiceDetail] = useState(null)
  const [serviceFilter, setServiceFilter] = useState('')
  const [view, setView] = useState('services') // 'services' | 'accounts'

  const fetchAll = useCallback(() => {
    setLoading(true)
    const acctParam = selectedAccount ? `?account=${selectedAccount}` : ''
    Promise.all([
      fetch(`/api/costs/summary${acctParam}`).then(r => r.json()).catch(() => null),
      fetch(`/api/costs/trend${acctParam}`).then(r => r.json()).catch(() => ({ trend: [] })),
      fetch('/api/costs/forecast').then(r => r.json()).catch(() => ({ forecasts: [] })),
      fetch(`/api/costs/services${acctParam}`).then(r => r.json()).catch(() => ({ services: [] })),
      fetch(`/api/costs/account-services${acctParam}`).then(r => r.json()).catch(() => ({ accounts: [] })),
    ]).then(([sum, tr, fc, svc, acctSvc]) => {
      setSummary(sum)
      setTrend(tr.trend || [])
      setForecasts(fc.forecasts || [])
      setServices(svc.services || [])
      setAccountServices(acctSvc.accounts || [])
      setLoading(false)
    })
  }, [selectedAccount])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fetchServiceDetail = useCallback((serviceName) => {
    if (expandedService === serviceName) {
      setExpandedService(null)
      setServiceDetail(null)
      return
    }
    setExpandedService(serviceName)
    const acctParam = selectedAccount ? `&account=${selectedAccount}` : ''
    fetch(`/api/costs/services/${encodeURIComponent(serviceName)}?_=1${acctParam}`)
      .then(r => r.json())
      .then(setServiceDetail)
      .catch(() => setServiceDetail(null))
  }, [expandedService, selectedAccount])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/cost-explorer', { method: 'POST' })
      setTimeout(() => { fetchAll(); setSyncing(false) }, 10000)
    } catch { setSyncing(false) }
  }

  const totalForecast = forecasts.reduce((s, f) => s + parseFloat(f.mean_value || 0), 0)
  const dailyAvg = summary?.total && trend.length ? summary.total / trend.length : 0
  const maxDaily = trend.length ? Math.max(...trend.map(t => parseFloat(t.daily_total))) : 0
  const prevMonthTotal = summary?.prev_month_total || 0
  const momChange = prevMonthTotal > 0 ? ((summary?.total - prevMonthTotal) / prevMonthTotal) * 100 : null

  const allAccounts = summary?.by_account?.map(a => a.account_id) || []

  const filteredServices = services.filter(s =>
    !serviceFilter || s.service.toLowerCase().includes(serviceFilter.toLowerCase())
  )

  const topServiceSpend = filteredServices.length > 0 ? Math.max(...filteredServices.map(s => s.mtd_spend)) : 1

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Cost Overview</h1>
          <p className="page-subtitle">AWS spending across all accounts — detailed service breakdown</p>
        </div>
        <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading cost data...</p>
      ) : !summary || summary.total === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <h3>No cost data yet</h3>
            <p>Click "Sync Now" to pull Cost Explorer data from your accounts.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="stat-grid">
            <div className="stat-card" style={{ borderTop: '3px solid var(--accent)' }}>
              <p className="stat-title">Month-to-Date</p>
              <p className="stat-value">{fmt(summary.total)}</p>
              <p className="stat-subtitle">
                {momChange != null ? (
                  <><PctBadge value={momChange} /> vs last month</>
                ) : 'First month of data'}
              </p>
            </div>
            <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
              <p className="stat-title">Forecast (Remaining)</p>
              <p className="stat-value">{fmt(totalForecast)}</p>
              <p className="stat-subtitle">
                {totalForecast > 0 ? `Est. total: ${fmt(summary.total + totalForecast)}` : 'Rest of month'}
              </p>
            </div>
            <div className="stat-card" style={{ borderTop: '3px solid var(--muted)' }}>
              <p className="stat-title">Daily Average</p>
              <p className="stat-value">{fmt(dailyAvg)}</p>
              <p className="stat-subtitle">Over {trend.length} days</p>
            </div>
            <div className="stat-card" style={{ borderTop: '3px solid var(--error)' }}>
              <p className="stat-title">Services Active</p>
              <p className="stat-value">{services.length}</p>
              <p className="stat-subtitle">{allAccounts.length} account(s)</p>
            </div>
          </div>

          {/* Filter bar */}
          <div className="filter-bar" style={{ marginTop: 16 }}>
            {allAccounts.length > 1 && (
              <select
                className="form-input filter-select"
                value={selectedAccount}
                onChange={(e) => { setSelectedAccount(e.target.value); setExpandedService(null) }}
              >
                <option value="">All Accounts</option>
                {allAccounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            <input
              className="form-input filter-select"
              placeholder="Filter services..."
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              style={{ maxWidth: 240 }}
            />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button
                className={view === 'services' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setView('services')}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >By Service</button>
              <button
                className={view === 'accounts' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setView('accounts')}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >By Account</button>
            </div>
          </div>

          {/* Daily spend trend chart */}
          {trend.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h3>Daily Spend (30 days){selectedAccount ? ` — ${selectedAccount}` : ''}</h3>
                <span className="card-badge">Cost Explorer</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
                {trend.map((t) => {
                  const pct = maxDaily > 0 ? (parseFloat(t.daily_total) / maxDaily) * 100 : 0
                  return (
                    <div
                      key={t.period_start}
                      title={`${t.period_start}: ${fmt(t.daily_total)}`}
                      style={{
                        flex: 1, height: `${Math.max(pct, 2)}%`,
                        background: 'var(--accent)', borderRadius: '2px 2px 0 0', opacity: 0.8,
                      }}
                    />
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span className="muted" style={{ fontSize: 11 }}>{trend[0]?.period_start}</span>
                <span className="muted" style={{ fontSize: 11 }}>{trend[trend.length - 1]?.period_start}</span>
              </div>
            </div>
          )}

          {/* SERVICE DETAIL VIEW */}
          {view === 'services' && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h3>Service Breakdown (MTD)</h3>
                <span className="card-badge">{filteredServices.length} services</span>
              </div>
              <div className="table-wrapper" style={{ marginTop: 0, border: 'none' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>MTD Spend</th>
                      <th style={{ width: 140 }}></th>
                      <th>Daily Avg</th>
                      <th>Prev Month</th>
                      <th>Change</th>
                      <th>Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServices.map((s) => (
                      <>
                        <tr
                          key={s.service}
                          onClick={() => fetchServiceDetail(s.service)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ fontWeight: 500, color: 'var(--text)' }}>{s.service}</td>
                          <td className="mono">{fmt(s.mtd_spend)}</td>
                          <td>
                            <div className="mini-bar-track" style={{ width: '100%' }}>
                              <div className="mini-bar" style={{ width: `${(s.mtd_spend / topServiceSpend) * 100}%` }} />
                            </div>
                          </td>
                          <td className="mono muted">{fmt(s.daily_avg)}</td>
                          <td className="mono muted">{s.prev_month_spend > 0 ? fmt(s.prev_month_spend) : '--'}</td>
                          <td><PctBadge value={s.pct_change} /></td>
                          <td className="muted">{s.account_count}</td>
                        </tr>
                        {expandedService === s.service && serviceDetail && (
                          <tr key={`${s.service}-detail`}>
                            <td colSpan={7} style={{ padding: 0, background: 'var(--bg-raised)' }}>
                              <div style={{ padding: 16 }}>
                                <div style={{ display: 'flex', gap: 24 }}>
                                  <div style={{ flex: 2 }}>
                                    <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>
                                      Daily Spend — {s.service}
                                    </p>
                                    <MiniChart data={serviceDetail.daily || []} height={60} />
                                    {serviceDetail.daily?.length > 0 && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        <span className="muted" style={{ fontSize: 10 }}>{serviceDetail.daily[0]?.period_start}</span>
                                        <span className="muted" style={{ fontSize: 10 }}>{serviceDetail.daily[serviceDetail.daily.length - 1]?.period_start}</span>
                                      </div>
                                    )}
                                  </div>
                                  {serviceDetail.by_account?.length > 0 && (
                                    <div style={{ flex: 1 }}>
                                      <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>
                                        By Account
                                      </p>
                                      {serviceDetail.by_account.map(a => (
                                        <div key={a.account_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
                                          <span className="mono">{a.account_id}</span>
                                          <span className="mono">{fmt(a.total_spend)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACCOUNT DETAIL VIEW */}
          {view === 'accounts' && (
            <div style={{ marginTop: 12 }}>
              {accountServices.map((acct) => {
                const topSpend = acct.services.length > 0 ? acct.services[0].amount : 1
                return (
                  <div className="card" key={acct.account_id} style={{ marginBottom: 12 }}>
                    <div className="card-header">
                      <h3 style={{ fontFamily: 'var(--font-mono, monospace)' }}>{acct.account_id}</h3>
                      <span className="card-badge">{fmt(acct.total)} MTD</span>
                    </div>
                    <div className="table-wrapper" style={{ marginTop: 0, border: 'none' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Service</th>
                            <th>MTD Spend</th>
                            <th style={{ width: 200 }}></th>
                            <th>% of Account</th>
                          </tr>
                        </thead>
                        <tbody>
                          {acct.services.map((svc) => {
                            const pct = acct.total > 0 ? (svc.amount / acct.total) * 100 : 0
                            return (
                              <tr key={svc.service}>
                                <td style={{ fontWeight: 500, color: 'var(--text)' }}>{svc.service}</td>
                                <td className="mono">{fmt(svc.amount)}</td>
                                <td>
                                  <div className="mini-bar-track" style={{ width: '100%' }}>
                                    <div className="mini-bar" style={{ width: `${(svc.amount / topSpend) * 100}%` }} />
                                  </div>
                                </td>
                                <td className="muted">{pct.toFixed(1)}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Previous month comparison */}
          {prevMonthTotal > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h3>Month-over-Month</h3>
              </div>
              <div style={{ display: 'flex', gap: 24, padding: '12px 0' }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Previous Month</p>
                  <p style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>{fmt(prevMonthTotal)}</p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Current MTD</p>
                  <p style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>{fmt(summary.total)}</p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Change</p>
                  <p style={{ fontSize: 20, fontWeight: 600 }}><PctBadge value={momChange} /></p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
