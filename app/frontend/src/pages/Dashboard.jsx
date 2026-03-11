import { useState, useEffect, useCallback } from 'react'
import { useAccountContext } from '../hooks/useAccountContext'

const REFRESH_INTERVAL = 60000

function StatCard({ title, value, subtitle, color, borderColor }) {
  return (
    <div className="stat-card" style={borderColor ? { borderTop: `3px solid ${borderColor}` } : undefined}>
      <p className="stat-title">{title}</p>
      <p className="stat-value" style={color ? { color } : undefined}>{value}</p>
      {subtitle && <p className="stat-subtitle">{subtitle}</p>}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const { selectedAccount } = useAccountContext()
  const [accounts, setAccounts] = useState([])
  const [findingSummary, setFindingSummary] = useState(null)
  const [changesSummary, setChangesSummary] = useState(null)
  const [recentChanges, setRecentChanges] = useState([])
  const [syncStatus, setSyncStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [inventorySummary, setInventorySummary] = useState(null)
  const [costSummary, setCostSummary] = useState(null)
  const [complianceSummary, setComplianceSummary] = useState(null)
  const [healthSummary, setHealthSummary] = useState(null)
  const [dashSummary, setDashSummary] = useState(null)

  const fetchAll = useCallback(() => {
    const q = selectedAccount ? `?account=${selectedAccount}` : ''
    Promise.all([
      fetch('/api/accounts').then((r) => r.json()).catch(() => []),
      fetch(`/api/findings/summary${q}`).then((r) => r.json()).catch(() => null),
      fetch('/api/changes/summary').then((r) => r.json()).catch(() => null),
      fetch('/api/changes?limit=8').then((r) => r.json()).catch(() => ({ changes: [] })),
      fetch('/api/sync/status').then((r) => r.json()).catch(() => null),
      fetch(`/api/inventory/summary${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/costs/summary${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/compliance/summary${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/health-events/summary${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/dashboard/summary${q}`).then((r) => r.json()).catch(() => null),
    ]).then(([accts, findings, changes, recent, sync, inv, cost, comp, health, dash]) => {
      setAccounts(Array.isArray(accts) ? accts : [])
      setFindingSummary(findings)
      setChangesSummary(changes)
      setRecentChanges(recent.changes || [])
      setSyncStatus(sync)
      setInventorySummary(inv)
      setCostSummary(cost)
      setComplianceSummary(comp)
      setHealthSummary(health)
      setDashSummary(dash)
      setLoading(false)
    })
  }, [selectedAccount])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchAll])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/all', { method: 'POST' })
      setTimeout(() => { fetchAll(); setSyncing(false) }, 8000)
    } catch {
      setSyncing(false)
    }
  }

  const enabled = accounts.filter((a) => a.enabled).length
  const fs = findingSummary || {}
  const gd = dashSummary?.guardduty || {}
  const insp = dashSummary?.inspector || {}
  const iam = dashSummary?.iam || {}
  const ta = dashSummary?.trusted_advisor || {}
  const shortService = (s) => s ? s.replace('.amazonaws.com', '') : ''
  const lastSync = syncStatus?.syncs?.find((s) => s.status === 'completed')
  const fmt$ = (v) => v ? `$${parseFloat(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '$0'

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">
            Multi-account health overview across your AWS organization
            {selectedAccount && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>— account filtered</span>}
          </p>
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

      <SectionLabel>Infrastructure</SectionLabel>
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard
          title="Monitored Accounts"
          value={loading ? '--' : accounts.length}
          subtitle={loading ? '' : `${enabled} active`}
          borderColor="var(--accent)"
        />
        <StatCard
          title="Resources"
          value={inventorySummary?.total ?? '--'}
          subtitle={inventorySummary ? `${inventorySummary.types?.length || 0} types` : 'Sync to populate'}
          borderColor="var(--accent)"
        />
        <StatCard
          title="MTD Spend"
          value={costSummary?.total != null
            ? `$${costSummary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '--'}
          subtitle={costSummary?.by_account ? `${costSummary.by_account.length} account(s)` : 'Sync to populate'}
          borderColor="#f59e0b"
        />
        <StatCard
          title="Change Events (24h)"
          value={changesSummary?.total ?? '--'}
          subtitle={changesSummary ? `across ${changesSummary.services?.length || 0} services` : 'Sync to populate'}
          borderColor="var(--muted)"
        />
        <StatCard
          title="Health Events"
          value={healthSummary?.open ?? '--'}
          subtitle={healthSummary ? `${healthSummary.upcoming || 0} upcoming · ${healthSummary.total || 0} total` : 'Sync to populate'}
          borderColor={healthSummary?.open > 0 ? 'var(--error)' : 'var(--muted)'}
          color={healthSummary?.open > 0 ? 'var(--error)' : undefined}
        />
      </div>

      <SectionLabel>Security Posture</SectionLabel>
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard
          title="Critical Findings"
          value={fs.CRITICAL ?? '--'}
          subtitle={fs.total != null ? `of ${fs.total} Security Hub` : 'Sync to populate'}
          borderColor="var(--error)"
          color={(fs.CRITICAL || 0) > 0 ? 'var(--error)' : undefined}
        />
        <StatCard
          title="High Findings"
          value={fs.HIGH ?? '--'}
          subtitle={fs.total != null ? `of ${fs.total} Security Hub` : 'Sync to populate'}
          borderColor="var(--warning)"
          color={(fs.HIGH || 0) > 0 ? 'var(--warning)' : undefined}
        />
        <StatCard
          title="GuardDuty HIGH"
          value={gd.HIGH ?? '--'}
          subtitle={gd.total != null ? `${gd.MEDIUM || 0} medium · ${gd.total} total` : 'Sync to populate'}
          borderColor={(gd.HIGH || 0) > 0 ? 'var(--error)' : 'var(--muted)'}
          color={(gd.HIGH || 0) > 0 ? 'var(--error)' : undefined}
        />
        <StatCard
          title="Inspector Critical"
          value={insp.critical ?? '--'}
          subtitle={insp.total != null ? `${insp.exploitable || 0} exploitable · ${insp.total} total` : 'Sync to populate'}
          borderColor={(parseInt(insp.critical) || 0) > 0 ? 'var(--error)' : 'var(--muted)'}
          color={(parseInt(insp.critical) || 0) > 0 ? 'var(--error)' : undefined}
        />
        <StatCard
          title="IAM No-MFA"
          value={iam.no_mfa ?? '--'}
          subtitle={iam.total_users != null ? `${iam.stale_keys || 0} stale keys · ${iam.total_users} users` : 'Sync to populate'}
          borderColor={(parseInt(iam.no_mfa) || 0) > 0 ? 'var(--warning)' : 'var(--muted)'}
          color={(parseInt(iam.no_mfa) || 0) > 0 ? 'var(--warning)' : undefined}
        />
        <StatCard
          title="Compliance"
          value={complianceSummary?.summary?.COMPLIANT != null
            ? `${Math.round((complianceSummary.summary.COMPLIANT / Math.max(1, Object.values(complianceSummary.summary).reduce((a, b) => a + b, 0))) * 100)}%`
            : '--'}
          subtitle={complianceSummary?.summary?.NON_COMPLIANT
            ? `${complianceSummary.summary.NON_COMPLIANT} non-compliant`
            : 'Sync to populate'}
          borderColor="var(--success)"
          color={complianceSummary?.summary?.NON_COMPLIANT > 0 ? 'var(--warning)' : 'var(--success)'}
        />
        <StatCard
          title="Trusted Advisor"
          value={ta.errors ?? '--'}
          subtitle={ta.warnings != null
            ? `${ta.warnings} warnings · ${fmt$(ta.total_savings)}/mo savings`
            : 'Sync to populate'}
          borderColor={(parseInt(ta.errors) || 0) > 0 ? 'var(--error)' : 'var(--muted)'}
          color={(parseInt(ta.errors) || 0) > 0 ? 'var(--error)' : undefined}
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
                <p>The backend syncs all modules every 15 minutes. Or click Sync Now to run immediately.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
