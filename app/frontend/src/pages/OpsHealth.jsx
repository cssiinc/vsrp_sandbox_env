import { useState, useEffect, useCallback } from 'react'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? 'var(--success)' : 'var(--error)',
      boxShadow: ok ? '0 0 6px rgba(34,197,94,0.5)' : '0 0 6px rgba(239,68,68,0.5)',
    }} />
  )
}

export default function OpsHealth() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(() => {
    fetch('/api/ops-health')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (loading) return <div className="page"><p className="muted">Loading operational health...</p></div>
  if (!data) return <div className="page"><p className="muted">Failed to load operational health data.</p></div>

  const db = data.database
  const maxRows = Math.max(...data.tables.map(t => t.rows), 1)
  const maxSize = Math.max(...data.tables.map(t => t.total_bytes), 1)

  return (
    <div className="page">
      <div className="page-header">
        <h1>Operational Health</h1>
        <p className="page-subtitle">Database, sync performance, and data growth monitoring</p>
      </div>

      {/* Database overview */}
      <div className="stat-grid">
        <div className="stat-card" style={{ borderTop: '3px solid var(--accent)' }}>
          <p className="stat-title">Database Size</p>
          <p className="stat-value">{db.size_mb} MB</p>
          <p className="stat-subtitle">{db.total_data_size_mb} MB in tables</p>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--success)' }}>
          <p className="stat-title">Total Rows</p>
          <p className="stat-value">{db.total_rows.toLocaleString()}</p>
          <p className="stat-subtitle">Across all tables</p>
        </div>
        <div className="stat-card" style={{ borderTop: db.active_connections > 8 ? '3px solid var(--warning)' : '3px solid var(--muted)' }}>
          <p className="stat-title">DB Connections</p>
          <p className="stat-value" style={{ color: db.active_connections > 8 ? 'var(--warning)' : undefined }}>{db.active_connections}</p>
          <p className="stat-subtitle">Pool: {db.pool.total} total, {db.pool.idle} idle, {db.pool.waiting} waiting</p>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--muted)' }}>
          <p className="stat-title">Tables Tracked</p>
          <p className="stat-value">{data.tables.length}</p>
          <p className="stat-subtitle">{data.tables.filter(t => t.rows > 0).length} with data</p>
        </div>
      </div>

      {/* Table breakdown */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <h3>Table Breakdown</h3>
          <span className="card-badge">PostgreSQL</span>
        </div>
        <div className="table-wrapper" style={{ marginTop: 0, border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
                <th style={{ width: 120 }}></th>
                <th>Size</th>
                <th style={{ width: 120 }}></th>
                <th>24h Growth</th>
              </tr>
            </thead>
            <tbody>
              {data.tables.map((t) => {
                const growth = data.data_growth_24h?.find(g => g.table === t.table)
                return (
                  <tr key={t.table}>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{t.label}</td>
                    <td className="mono">{t.rows.toLocaleString()}</td>
                    <td>
                      <div className="mini-bar-track" style={{ width: '100%' }}>
                        <div className="mini-bar" style={{ width: `${(t.rows / maxRows) * 100}%` }} />
                      </div>
                    </td>
                    <td className="mono">{formatBytes(t.total_bytes)}</td>
                    <td>
                      <div className="mini-bar-track" style={{ width: '100%' }}>
                        <div className="mini-bar" style={{ width: `${(t.total_bytes / maxSize) * 100}%`, background: 'var(--warning)' }} />
                      </div>
                    </td>
                    <td style={{ color: growth?.rows_24h > 0 ? 'var(--success)' : 'var(--muted)' }}>
                      {growth ? `+${growth.rows_24h.toLocaleString()}` : '--'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync performance */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <h3>Sync Performance (24h)</h3>
          <span className="card-badge">Background Scheduler</span>
        </div>
        {data.sync_performance.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>No sync activity in the last 24 hours.</p>
        ) : (
          <div className="table-wrapper" style={{ marginTop: 0, border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Runs</th>
                  <th>Succeeded</th>
                  <th>Failed</th>
                  <th>Avg Duration</th>
                  <th>Max Duration</th>
                  <th>Records Synced</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {data.sync_performance.map((s) => (
                  <tr key={s.module}>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{s.module}</td>
                    <td>{s.sync_count}</td>
                    <td style={{ color: 'var(--success)' }}>{s.succeeded}</td>
                    <td style={{ color: parseInt(s.failed) > 0 ? 'var(--error)' : 'var(--muted)' }}>{s.failed}</td>
                    <td className="mono">{s.avg_duration_sec ? `${s.avg_duration_sec}s` : '--'}</td>
                    <td className="mono">{s.max_duration_sec ? `${Math.round(s.max_duration_sec)}s` : '--'}</td>
                    <td>{parseInt(s.total_records || 0).toLocaleString()}</td>
                    <td><StatusDot ok={parseInt(s.failed) === 0} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Last successful sync per module */}
      {data.last_syncs.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header">
            <h3>Last Successful Sync</h3>
          </div>
          <div className="table-wrapper" style={{ marginTop: 0, border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Records</th>
                  <th>Duration</th>
                  <th>Completed At</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {data.last_syncs.map((s) => {
                  const age = s.completed_at ? Math.round((Date.now() - new Date(s.completed_at)) / 60000) : null
                  return (
                    <tr key={s.module}>
                      <td style={{ fontWeight: 500, color: 'var(--text)' }}>{s.module}</td>
                      <td>{s.records_synced ?? '--'}</td>
                      <td className="mono">{s.duration_sec ? `${Math.round(s.duration_sec)}s` : '--'}</td>
                      <td className="muted">{s.completed_at ? new Date(s.completed_at).toLocaleString() : '--'}</td>
                      <td style={{ color: age > 30 ? 'var(--warning)' : age > 60 ? 'var(--error)' : 'var(--muted)' }}>
                        {age != null ? `${age}m ago` : '--'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
