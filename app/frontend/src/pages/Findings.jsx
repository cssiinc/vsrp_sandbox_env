export default function Findings() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Security Findings</h1>
        <p className="page-subtitle">Aggregated findings from Security Hub, GuardDuty, and IAM Access Analyzer</p>
      </div>
      <div className="card">
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h3>Phase 2 — Security Findings</h3>
          <p>Security Hub sync, findings aggregation with severity filtering, and trend visualization. Deploy the StackSet first to enable cross-account access.</p>
        </div>
      </div>
    </div>
  )
}
