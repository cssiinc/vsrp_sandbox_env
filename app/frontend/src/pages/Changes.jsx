export default function Changes() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Infrastructure Change Log</h1>
        <p className="page-subtitle">CloudTrail events across your organization — who changed what, when</p>
      </div>
      <div className="card">
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3>Phase 3 — Change Log</h3>
          <p>CloudTrail event sync, timeline view with filters by account, service, user, and time range. Diff views for security group and IAM policy changes.</p>
        </div>
      </div>
    </div>
  )
}
