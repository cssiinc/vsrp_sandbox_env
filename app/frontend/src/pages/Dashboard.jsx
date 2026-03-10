import { useState, useEffect } from 'react'

function StatCard({ title, value, subtitle, color, borderColor }) {
  return (
    <div className="stat-card" style={borderColor ? { borderTop: `3px solid ${borderColor}` } : undefined}>
      <p className="stat-title">{title}</p>
      <p className="stat-value" style={color ? { color } : undefined}>{value}</p>
      {subtitle && <p className="stat-subtitle">{subtitle}</p>}
    </div>
  )
}

function EmptyState({ icon, title, description }) {
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
        <path d={icon} />
      </svg>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((data) => {
        setAccounts(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const enabled = accounts.filter((a) => a.enabled).length

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">Multi-account health overview across your AWS organization</p>
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
          value="--"
          subtitle="Security Hub sync pending"
          borderColor="var(--error)"
          color="var(--error)"
        />
        <StatCard
          title="High Findings"
          value="--"
          subtitle="Security Hub sync pending"
          borderColor="var(--warning)"
          color="var(--warning)"
        />
        <StatCard
          title="Config Compliance"
          value="--"
          subtitle="Config sync pending"
          borderColor="var(--success)"
        />
        <StatCard
          title="Cost Anomalies"
          value="--"
          subtitle="Cost Explorer sync pending"
          borderColor="#a78bfa"
        />
        <StatCard
          title="Change Events"
          value="--"
          subtitle="CloudTrail sync pending"
          borderColor="var(--muted)"
        />
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3>Recent Changes</h3>
            <span className="card-badge">CloudTrail</span>
          </div>
          <EmptyState
            icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            title="No change events yet"
            description="Configure accounts and run a CloudTrail sync to see infrastructure changes across your organization."
          />
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Top Findings by Severity</h3>
            <span className="card-badge">Security Hub</span>
          </div>
          <EmptyState
            icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            title="No findings synced"
            description="Deploy the HealthDashboardReadRole via StackSet, add accounts, then trigger a Security Hub sync."
          />
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
                <p>Deploy the HealthDashboardReadRole CloudFormation StackSet to your Control Tower OUs for cross-account read access.</p>
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
                <strong>Sync Data</strong>
                <p>Trigger syncs to pull Security Hub findings, CloudTrail events, Config compliance, and cost data.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
