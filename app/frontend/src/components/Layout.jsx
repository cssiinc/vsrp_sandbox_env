import { NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>VSRP Sandbox</h2>
          <span className="sidebar-subtitle">AWS Health Dashboard</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">&#9632;</span>
            Dashboard
          </NavLink>
          <NavLink to="/accounts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">&#9670;</span>
            Accounts
          </NavLink>
          <NavLink to="/findings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">&#9888;</span>
            Findings
          </NavLink>
          <NavLink to="/changes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">&#8634;</span>
            Change Log
          </NavLink>
          <div className="nav-divider" />
          <NavLink to="/apis" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">&#10148;</span>
            Public APIs
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-env">DEV</span>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
