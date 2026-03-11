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

function RolloutBadge({ state }) {
  if (!state) return null
  const color = state === 'COMPLETED' ? 'var(--success)' : state === 'FAILED' ? 'var(--error)' : 'var(--warning)'
  return <span style={{ fontSize: 11, color, fontWeight: 600, marginLeft: 6 }}>{state}</span>
}

export default function OpsHealth() {
  const [data, setData] = useState(null)
  const [appData, setAppData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [appLoading, setAppLoading] = useState(true)

  const fetchHealth = useCallback(() => {
    fetch('/api/ops-health')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const fetchAppMetrics = useCallback(() => {
    fetch('/api/app-metrics')
      .then(r => r.json())
      .then(d => { setAppData(d); setAppLoading(false) })
      .catch(() => setAppLoading(false))
  }, [])

  useEffect(() => {
    fetchHealth()
    fetchAppMetrics()
    const interval = setInterval(fetchHealth, 30000)
    const appInterval = setInterval(fetchAppMetrics, 60000)
    return () => { clearInterval(interval); clearInterval(appInterval) }
  }, [fetchHealth, fetchAppMetrics])

  if (loading) return <div className="page"><p className="muted">Loading operational health...</p></div>
  if (!data) return <div className="page"><p className="muted">Failed to load operational health data.</p></div>

  const db = data.database
  const maxRows = Math.max(...data.tables.map(t => t.rows), 1)
  const maxSize = Math.max(...data.tables.map(t => t.total_bytes), 1)

  // ECS service helpers
  const ecsServices = appData?.ecs ? Object.entries(appData.ecs) : []
  const allServicesHealthy = ecsServices.length > 0 && ecsServices.every(([, s]) => s.running > 0 && s.running === s.desired)

  return (
    <div className="page">
      <div className="page-header">
        <h1>Operational Health</h1>
        <p className="page-subtitle">Application infrastructure, database, and sync performance monitoring</p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* APPLICATION INFRASTRUCTURE                                          */}
      {/* ------------------------------------------------------------------ */}
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Application Infrastructure
      </h2>

      {appLoading ? (
        <p className="muted" style={{ marginBottom: 16 }}>Loading infrastructure metrics...</p>
      ) : !appData?.configured ? (
        <div className="card" style={{ marginBottom: 16, padding: '16px 20px', color: 'var(--muted)', fontSize: 13 }}>
          Infrastructure monitoring not configured. Set <code>APP_ACCOUNT_ID</code>, <code>ECS_CLUSTER</code>,{' '}
          <code>BACKEND_SERVICE</code>, <code>FRONTEND_SERVICE</code>, <code>RDS_INSTANCE_ID</code>, and{' '}
          <code>ALB_NAME</code> environment variables on the backend container.
        </div>
      ) : (
        <>
          {/* ECS Services */}
          <div className="stat-grid" style={{ marginBottom: 12 }}>
            {ecsServices.map(([name, svc]) => {
              const healthy = !svc.error && svc.running > 0 && svc.running === svc.desired
              return (
                <div key={name} className="stat-card" style={{ borderTop: `3px solid ${healthy ? 'var(--success)' : 'var(--error)'}` }}>
                  <p className="stat-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusDot ok={healthy} />
                    {name}
                  </p>
                  {svc.error ? (
                    <p className="stat-value" style={{ color: 'var(--error)', fontSize: 13 }}>{svc.error}</p>
                  ) : (
                    <>
                      <p className="stat-value">{svc.running}/{svc.desired}</p>
                      <p className="stat-subtitle">
                        running/desired{svc.pending > 0 ? ` · ${svc.pending} pending` : ''}
                        <RolloutBadge state={svc.rollout_state} />
                      </p>
                      {svc.task_definition && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontFamily: 'monospace' }}>{svc.task_definition}</p>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {/* RDS stat card */}
            {appData.rds && (
              <div className="stat-card" style={{ borderTop: `3px solid ${appData.rds.status === 'available' ? 'var(--success)' : 'var(--warning)'}` }}>
                <p className="stat-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot ok={appData.rds.status === 'available'} />
                  RDS
                </p>
                <p className="stat-value">{appData.rds.cpu_percent != null ? `${appData.rds.cpu_percent}%` : appData.rds.status}</p>
                <p className="stat-subtitle">
                  {appData.rds.cpu_percent != null ? 'CPU' : appData.rds.instance_class}
                  {appData.rds.connections != null ? ` · ${appData.rds.connections} conn` : ''}
                </p>
              </div>
            )}

            {/* ALB stat card */}
            {appData.alb && (
              <div className="stat-card" style={{ borderTop: `3px solid ${appData.alb.state === 'active' ? 'var(--success)' : 'var(--warning)'}` }}>
                <p className="stat-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot ok={appData.alb.state === 'active'} />
                  ALB
                </p>
                <p className="stat-value">{appData.alb.requests_5min != null ? appData.alb.requests_5min.toLocaleString() : appData.alb.state}</p>
                <p className="stat-subtitle">
                  {appData.alb.requests_5min != null ? 'requests (5m)' : ''}
                  {appData.alb.errors_5xx > 0 ? ` · ${appData.alb.errors_5xx} 5xx` : ''}
                </p>
              </div>
            )}
          </div>

          {/* RDS + ALB detail cards */}
          <div className="dashboard-grid" style={{ marginBottom: 12 }}>
            {appData.rds && (
              <div className="card">
                <div className="card-header">
                  <h3>RDS Database</h3>
                  <span className="card-badge" style={{ color: appData.rds.status === 'available' ? 'var(--success)' : 'var(--warning)' }}>
                    {appData.rds.status}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', padding: '4px 0', fontSize: 13 }}>
                  <div><span style={{ color: 'var(--muted)' }}>Instance class</span><br /><strong>{appData.rds.instance_class}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Engine</span><br /><strong>{appData.rds.engine} {appData.rds.engine_version}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>CPU</span><br /><strong>{appData.rds.cpu_percent != null ? `${appData.rds.cpu_percent}%` : '--'}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Free storage</span><br /><strong>{appData.rds.free_storage_gb != null ? `${appData.rds.free_storage_gb} GB` : `${appData.rds.allocated_storage_gb} GB alloc`}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Connections</span><br /><strong>{appData.rds.connections ?? '--'}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>IOPS (R/W)</span><br /><strong>{appData.rds.read_iops ?? '--'} / {appData.rds.write_iops ?? '--'}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Multi-AZ</span><br /><strong>{appData.rds.multi_az ? 'Yes' : 'No'}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Backup retention</span><br /><strong>{appData.rds.backup_retention_days != null ? `${appData.rds.backup_retention_days} days` : '--'}</strong></div>
                </div>
              </div>
            )}

            {appData.alb && (
              <div className="card">
                <div className="card-header">
                  <h3>Load Balancer</h3>
                  <span className="card-badge" style={{ color: appData.alb.state === 'active' ? 'var(--success)' : 'var(--warning)' }}>
                    {appData.alb.state}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', padding: '4px 0 12px', fontSize: 13 }}>
                  <div><span style={{ color: 'var(--muted)' }}>Requests (5m)</span><br /><strong>{appData.alb.requests_5min?.toLocaleString() ?? '--'}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>5xx errors (5m)</span><br /><strong style={{ color: appData.alb.errors_5xx > 0 ? 'var(--error)' : undefined }}>{appData.alb.errors_5xx ?? '--'}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Avg response</span><br /><strong>{appData.alb.avg_response_ms != null ? `${appData.alb.avg_response_ms}ms` : '--'}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Name</span><br /><strong>{appData.alb.name}</strong></div>
                </div>
                {appData.alb.target_groups?.length > 0 && (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>TARGET GROUPS</p>
                    {appData.alb.target_groups.map(tg => (
                      <div key={tg.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, fontSize: 13 }}>
                        <StatusDot ok={tg.healthy === tg.total && tg.total > 0} />
                        <span style={{ flex: 1 }}>{tg.name}</span>
                        <span style={{ color: tg.healthy === tg.total ? 'var(--success)' : 'var(--error)' }}>
                          {tg.healthy}/{tg.total} healthy
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Last event log per ECS service */}
          {ecsServices.some(([, s]) => s.last_event) && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-header">
                <h3>Recent Service Events</h3>
                <span className="card-badge">ECS</span>
              </div>
              {ecsServices.filter(([, s]) => s.last_event).map(([name, svc]) => (
                <div key={name} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 100, color: 'var(--text)' }}>{name}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {svc.last_event_time ? new Date(svc.last_event_time).toLocaleString() : ''}
                  </span>
                  <span style={{ flex: 1 }}>{svc.last_event}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* DATABASE                                                            */}
      {/* ------------------------------------------------------------------ */}
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 12px' }}>
        Database (CloudOps Store)
      </h2>

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

      {/* ------------------------------------------------------------------ */}
      {/* SYNC PERFORMANCE                                                    */}
      {/* ------------------------------------------------------------------ */}
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '24px 0 12px' }}>
        Sync Performance
      </h2>

      <div className="card">
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
