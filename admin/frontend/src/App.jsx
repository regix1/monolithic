import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Config from './pages/Config'
import Upstream from './pages/Upstream'
import Logs from './pages/Logs'
import { EmptyState } from './components'
import { useTimeFormat } from './hooks/useTimeFormat'

function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <EmptyState
        type="empty"
        title="Nothing here, just bamboo..."
        description="This page doesn't exist. Maybe the panda ate it?"
        action={{ label: 'Go to Dashboard', onClick: () => window.location.assign('/') }}
        size="lg"
      />
    </div>
  )
}

/** Page titles per route */
const TITLES = {
  '/': 'Dashboard',
  '/config': 'Configuration',
  '/upstream': 'Upstream',
  '/logs': 'Logs',
}

export default function App() {
  const location = useLocation()
  const { is24h, toggle } = useTimeFormat()

  // Update document title
  const title = TITLES[location.pathname]
  if (title) {
    document.title = `${title} — LANCache Monolithic`
  } else {
    document.title = 'LANCache Monolithic'
  }

  return (
    <div className="noise-bg flex h-screen overflow-hidden bg-panda-bg">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 relative">
        {/* Time format toggle — top right, always visible */}
        <button
          onClick={toggle}
          className="fixed top-4 right-5 z-40 flex items-center gap-2 rounded-lg bg-panda-surface border border-panda-border px-3 py-2 text-panda-dim hover:text-panda-text hover:border-bamboo/30 transition-colors shadow-lg"
          title={is24h ? 'Switch to 12-hour time' : 'Switch to 24-hour time'}
        >
          <Clock size={14} />
          <span className="text-sm font-mono font-medium">{is24h ? '24H' : '12H'}</span>
        </button>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="h-full max-w-7xl mx-auto"
          >
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/config" element={<Config />} />
              <Route path="/upstream" element={<Upstream />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
