import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

import AppLayout from './layouts/AppLayout'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Policies from './pages/Policies'
import Runs from './pages/Runs'
import RunDetails from './pages/RunDetails'
import Approvals from './pages/Approvals'
import Incidents from './pages/Incidents'
import Settings from './pages/Settings'
import BrowserSessions from './pages/BrowserSessions'
import BrowserSessionDetails from './pages/BrowserSessionDetails'
import AuditLog from './pages/AuditLog'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="agents" element={<Agents />} />
            <Route path="policies" element={<Policies />} />
            <Route path="runs" element={<Runs />} />
            <Route path="runs/:id" element={<RunDetails />} />
            <Route path="browser-sessions" element={<BrowserSessions />} />
            <Route path="browser-sessions/:id" element={<BrowserSessionDetails />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<div className="p-8 text-center text-slate-500">Page not found</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
