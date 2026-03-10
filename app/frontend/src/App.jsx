import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Findings from './pages/Findings'
import Changes from './pages/Changes'
import SyncStatus from './pages/SyncStatus'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="findings" element={<Findings />} />
          <Route path="changes" element={<Changes />} />
          <Route path="sync-status" element={<SyncStatus />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
