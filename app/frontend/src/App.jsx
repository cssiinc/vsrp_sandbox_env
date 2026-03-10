import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Findings from './pages/Findings'
import Changes from './pages/Changes'
import Inventory from './pages/Inventory'
import Costs from './pages/Costs'
import Compliance from './pages/Compliance'
import HealthEvents from './pages/HealthEvents'
import SyncStatus from './pages/SyncStatus'
import OpsHealth from './pages/OpsHealth'
import LogExplorer from './pages/LogExplorer'
import IAMCredentials from './pages/IAMCredentials'
import GuardDuty from './pages/GuardDuty'
import TrustedAdvisor from './pages/TrustedAdvisor'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="findings" element={<Findings />} />
          <Route path="changes" element={<Changes />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="costs" element={<Costs />} />
          <Route path="compliance" element={<Compliance />} />
          <Route path="health-events" element={<HealthEvents />} />
          <Route path="logs" element={<LogExplorer />} />
          <Route path="iam" element={<IAMCredentials />} />
          <Route path="guardduty" element={<GuardDuty />} />
          <Route path="trusted-advisor" element={<TrustedAdvisor />} />
          <Route path="sync-status" element={<SyncStatus />} />
          <Route path="ops-health" element={<OpsHealth />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
