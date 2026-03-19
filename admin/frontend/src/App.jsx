import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Config from './pages/Config'
import Upstream from './pages/Upstream'
import Logs from './pages/Logs'
import { EmptyState } from './components'

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
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="max-w-[1600px] mx-auto pb-20"
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
