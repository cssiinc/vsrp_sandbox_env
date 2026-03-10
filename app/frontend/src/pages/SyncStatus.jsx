import { useState, useEffect, useCallback } from 'react'
import { AccountName } from '../hooks/useAccountMap'

const STATUS_COLORS = {
  completed: 'var(--success)',
  running: 'var(--accent)',
  failed: 'var(--error)',
}

export default function SyncStatus() {
  const [syncData, setSyncData] = useState({ running: [], syncs: [] })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchStatus = useCallback(() => {
    fetch('/api/sync/status')
      .then((r) => r.json())
      .then((data) => {
        setSyncData(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const triggerSync = async (module) => {
    setSyncing(true)
    try {
      await fetch(`/api/sync/${module}`, { method: 'POST' })
      setTimeout(() => {
        fetchStatus()
        setSyncing(false)
      }, 5000)
    } catch {
      setSyncing(false)
    }
  }

  const formatTime = (t) => {
    if (!t) return '--'
    return new Date(t).toLocaleString()
  }

  const duration = (start, end) => {
    if (!start || !end) return '--'
    const ms = new Date(end) - new Date(start)
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Sync Status</h1>
          <p className="page-subtitle">
            Background sync history and health
            {syncData.running.length > 0 && (
              <span style={{ color: 'var(--accent)', marginLeft: 12 }}>
                Running: {syncData.running.join(', ')}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => triggerSync('security-hub')} disabled={syncing}>
            Sync Security Hub
          </button>
          <button className="btn-secondary" onClick={() => triggerSync('cloudtrail')} disabled={syncing}>
            Sync CloudTrail
          </button>
          <button className="btn-primary" onClick={() => triggerSync('all')} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync All'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading sync status...</p>
      ) : syncData.syncs.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <h3>No sync history</h3>
            <p>Add accounts and trigger a sync to see status here.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Account</th>
                <th>Status</th>
                <th>Records</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {syncData.syncs.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{s.module}</td>
                  <td><AccountName id={s.account_id} /></td>
                  <td>
                    <span className="severity-badge" style={{ color: STATUS_COLORS[s.status] || 'var(--muted)', borderColor: STATUS_COLORS[s.status] || 'var(--muted)' }}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.records_synced ?? '--'}</td>
                  <td className="muted">{formatTime(s.started_at)}</td>
                  <td className="muted">{duration(s.started_at, s.completed_at)}</td>
                  <td style={{ color: 'var(--error)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.error || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
