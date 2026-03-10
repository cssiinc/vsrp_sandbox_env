import { useState, useEffect, useCallback } from 'react'

const REFRESH_INTERVAL = 60000 // 60 seconds

function StatCard({ title, value, subtitle, color, borderColor }) {
  return (
    <div className="stat-card" style={borderColor ? { borderTop: `3px solid ${borderColor}` } : undefined}>
      <p className="stat-title">{title}</p>
      <p className="stat-value" style={color ? { color } : undefined}>{value}</p>
      {subtitle && <p className="stat-subtitle">{subtitle}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState([])
  const [findingSummary, setFindingSummary] = useState(null)
  const [changesSummary, setChangesSummary] = useState(null)
  const [recentChanges, setRecentChanges] = useState([])
  const [syncStatus, setSyncStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch('/api/accounts').then((r) => r.json()).catch(() => []),
      fetch('/api/findings/summary').then((r) => r.json()).catch(() => null),
      fetch('/api/changes/summary').then((r) => r.json()).catch(() => null),
      fetch('/api/changes?limit=8').then((r) => r.json()).catch(() => ({ changes: [] })),
      fetch('/api/sync/status').then((r) => r.json()).catch(() => null),
    ]).then(([accts, findings, changes, recent, sync]) => {
      setAccounts(Array.isArray(accts) ? accts : [])
      setFindingSummary(findings)
      setChangesSummary(changes)
      setRecentChanges(recent.changes || [])
      setSyncStatus(sync)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchAll])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/all', { method: 'POST' })
      setTimeout(() => {
        fetchAll()
        setSyncing(false)
      }, 8000)
    } catch {
      setSyncing(false)
    }
  }

  const enabled = accounts.filter((a) => a.enabled).length
  const fs = findingSummary || {}
  const shortService = (s) => s ? s.replace('.amazonaws.com', '') : ''
  const lastSync = syncStatus?.syncs?.find((s) => s.status === 'completed')

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Multi-account health overview across your AWS organization</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastSync && (
            <span className="card-badge">
              Last sync: {new Date(lastSync.completed_at).toLocaleTimeString()}
            </span>
          )}
          <button className="btn-primary" onClick={triggerSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          title="Monitored Accounts"
          value={loading ? '--' : accounts.length}
          subtitle={loading ? '' : `${enabled} active`}
          borderColor="var(--accent)"
        />
        <StatCard
          title="Critical Findings"
          value={fs.CRITICAL ?? '--'}
          subtitle={fs.total != null ? `of ${fs.total} total` : 'Sync to populate'}
          borderColor="var(--error)"
          color={fs.CRITICAL > 0 ? 'var(--error)' : undefined}
        />
        <StatCard
          title="High Findings"
          value={fs.HIGH ?? '--'}
          subtitle={fs.total != null ? `of ${fs.total} total` : 'Sync to populate'}
          borderColor="var(--warning)"
          color={fs.HIGH > 0 ? 'var(--warning)' : undefined}
        />
        <StatCard
          title="Medium Findings"
          value={fs.MEDIUM ?? '--'}
          subtitle={fs.total != null ? `of ${fs.total} total` : 'Sync to populate'}
          borderColor="#f59e0b"
        />
        <StatCard
          title="Change Events (24h)"
          value={changesSummary?.total ?? '--'}
          subtitle={changesSummary ? `across ${changesSummary.services?.length || 0} services` : 'Sync to populate'}
          borderColor="var(--muted)"
        />
        <StatCard
          title="Low / Info"
          value={fs.total != null ? (fs.LOW || 0) + (fs.INFORMATIONAL || 0) : '--'}
          subtitle="Low + Informational"
          borderColor="var(--accent)"
        />
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3>Recent Changes</h3>
            <span className="card-badge">CloudTrail</span>
          </div>
          {recentChanges.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3>No change events yet</h3>
              <p>Add accounts and the background sync will populate this automatically.</p>
            </div>
          ) : (
            <div className="mini-table">
              {recentChanges.map((c) => (
                <div key={c.id} className="mini-row">
                  <span className="mini-time">{new Date(c.event_time).toLocaleTimeString()}</span>
                  <span className="mini-event">{c.event_name}</span>
                  <span className="mini-service">{shortService(c.event_source)}</span>
                  <span className="mini-user">{c.username || '--'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Top Services (24h)</h3>
            <span className="card-badge">CloudTrail</span>
          </div>
          {!changesSummary?.services?.length ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3>No data yet</h3>
              <p>Service activity breakdown will appear after the first CloudTrail sync.</p>
            </div>
          ) : (
            <div className="mini-table">
              {changesSummary.services.map((s) => (
                <div key={s.event_source} className="mini-row">
                  <span className="mini-service" style={{ flex: 1 }}>{shortService(s.event_source)}</span>
                  <span className="mini-count">{s.count}</span>
                  <div className="mini-bar-track">
                    <div
                      className="mini-bar"
                      style={{ width: `${(s.count / changesSummary.services[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {accounts.length === 0 && !loading && (
        <div className="card getting-started">
          <h3>Getting Started</h3>
          <div className="steps">
            <div className="step">
              <span className="step-num">1</span>
              <div>
                <strong>Deploy StackSet</strong>
                <p>Deploy the HealthDashboardReadRole CloudFormation StackSet to your Control Tower OUs.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <div>
                <strong>Add Accounts</strong>
                <p>Go to the Accounts page and register the AWS accounts you want to monitor.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <div>
                <strong>Data syncs automatically</strong>
                <p>The backend syncs Security Hub and CloudTrail every 15 minutes. Or click "Sync Now" on any page.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
