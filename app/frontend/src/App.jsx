import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Findings from './pages/Findings'
import Changes from './pages/Changes'
import PublicApis from './pages/PublicApis'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="findings" element={<Findings />} />
          <Route path="changes" element={<Changes />} />
          <Route path="apis" element={<PublicApis />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
