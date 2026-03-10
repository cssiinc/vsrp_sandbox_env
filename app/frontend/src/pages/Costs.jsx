import { useState, useEffect } from 'react'

function StatCard({ title, value, subtitle, borderColor }) {
  return (
    <div className="stat-card" style={borderColor ? { borderTop: `3px solid ${borderColor}` } : undefined}>
      <p className="stat-title">{title}</p>
      <p className="stat-value">{value}</p>
      {subtitle && <p className="stat-subtitle">{subtitle}</p>}
    </div>
  )
}

export default function Costs() {
  const [summary, setSummary] = useState(null)
  const [trend, setTrend] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/costs/summary').then(r => r.json()).catch(() => null),
      fetch('/api/costs/trend').then(r => r.json()).catch(() => ({ trend: [] })),
      fetch('/api/costs/forecast').then(r => r.json()).catch(() => ({ forecasts: [] })),
    ]).then(([sum, tr, fc]) => {
      setSummary(sum)
      setTrend(tr.trend || [])
      setForecasts(fc.forecasts || [])
      setLoading(false)
    })
  }

  useEffect(() => { fetchAll() }, [])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/cost-explorer', { method: 'POST' })
      setTimeout(() => { fetchAll(); setSyncing(false) }, 10000)
    } catch { setSyncing(false) }
  }

  const fmt = (n) => {
    if (n == null) return '--'
    return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const totalForecast = forecasts.reduce((s, f) => s + parseFloat(f.mean_value || 0), 0)
  const dailyAvg = summary?.total && trend.length ? summary.total / trend.length : 0
  const maxDaily = trend.length ? Math.max(...trend.map(t => parseFloat(t.daily_total))) : 0

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Cost Overview</h1>
          <p className="page-subtitle">AWS spending across all accounts</p>
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
          <div className="stat-grid">
            <StatCard title="Month-to-Date" value={fmt(summary.total)} borderColor="var(--accent)" />
            <StatCard title="Forecast (Remaining)" value={fmt(totalForecast)} subtitle="Rest of month" borderColor="var(--warning)" />
            <StatCard title="Daily Average" value={fmt(dailyAvg)} subtitle={`Over ${trend.length} days`} borderColor="var(--muted)" />
            <StatCard
              title="Top Account"
              value={fmt(summary.by_account?.[0]?.total_spend)}
              subtitle={summary.by_account?.[0]?.account_id || '--'}
              borderColor="var(--error)"
            />
          </div>

          {trend.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h3>Daily Spend (30 days)</h3>
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
                        flex: 1,
                        height: `${Math.max(pct, 2)}%`,
                        background: 'var(--accent)',
                        borderRadius: '2px 2px 0 0',
                        opacity: 0.8,
                        transition: 'height 0.3s',
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

          {summary.by_service?.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h3>Top Services (MTD)</h3>
              </div>
              <div className="mini-table">
                {summary.by_service.map((s) => (
                  <div key={s.service} className="mini-row">
                    <span className="mini-service" style={{ flex: 1 }}>{s.service}</span>
                    <span className="mini-count">{fmt(s.total_spend)}</span>
                    <div className="mini-bar-track">
                      <div
                        className="mini-bar"
                        style={{ width: `${(parseFloat(s.total_spend) / parseFloat(summary.by_service[0].total_spend)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.by_account?.length > 1 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h3>Spend by Account (MTD)</h3>
              </div>
              <div className="mini-table">
                {summary.by_account.map((a) => (
                  <div key={a.account_id} className="mini-row">
                    <span className="mono" style={{ flex: 1 }}>{a.account_id}</span>
                    <span className="mini-count">{fmt(a.total_spend)}</span>
                    <div className="mini-bar-track">
                      <div
                        className="mini-bar"
                        style={{ width: `${(parseFloat(a.total_spend) / parseFloat(summary.by_account[0].total_spend)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
