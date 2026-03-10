import { useState, useEffect } from 'react'

function StatCard({ title, value, subtitle, color }) {
  return (
    <div className="stat-card">
      <p className="stat-title">{title}</p>
      <p className="stat-value" style={color ? { color } : undefined}>{value}</p>
      {subtitle && <p className="stat-subtitle">{subtitle}</p>}
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
        <p className="page-subtitle">AWS account health overview</p>
      </div>

      <div className="stat-grid">
        <StatCard
          title="Monitored Accounts"
          value={loading ? '...' : accounts.length}
          subtitle={loading ? '' : `${enabled} enabled`}
        />
        <StatCard
          title="Critical Findings"
          value="--"
          subtitle="Coming in Phase 2"
          color="var(--error)"
        />
        <StatCard
          title="High Findings"
          value="--"
          subtitle="Coming in Phase 2"
          color="#f59e0b"
        />
        <StatCard
          title="Config Compliance"
          value="--"
          subtitle="Coming in Phase 4"
        />
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Recent Activity</h3>
        <p className="muted">CloudTrail change log will appear here in Phase 3.</p>
      </div>
    </div>
  )
}
