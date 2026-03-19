import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Settings, Network, ScrollText, ChevronLeft, ChevronRight, Menu, X, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import pandaIcon from '../assets/panda.svg'
import { useTimeFormat } from '../hooks/useTimeFormat'
import { useIsMobile } from '../hooks/useBreakpoint'

/** @type {{ to: string, icon: import('lucide-react').LucideIcon, label: string }[]} */
const NAV_ITEMS = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/config',   icon: Settings,        label: 'Configuration' },
  { to: '/upstream', icon: Network,          label: 'Upstream' },
  { to: '/logs',     icon: ScrollText,       label: 'Logs' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { is24h, toggle } = useTimeFormat()
  const isMobile = useIsMobile()

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) setMobileOpen(false)
      else setCollapsed(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden !fixed top-4 left-4 z-50 rounded-xl bg-panda-surface border border-panda-border p-3 text-panda-muted hover:text-panda-text hover:bg-panda-elevated transition-colors shadow-lg"
        aria-label="Open menu"
        aria-expanded={mobileOpen}
      >
        <Menu size={18} />
      </button>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden !fixed inset-0 z-40 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240, x: 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className={[
          'relative flex-col overflow-y-auto overflow-x-hidden bg-panda-surface border-r border-panda-border shrink-0 h-screen',
          mobileOpen ? 'flex !fixed inset-y-0 left-0 z-50 shadow-2xl' : 'hidden lg:flex',
        ].join(' ')}
      >
        {/* Mobile close */}
        {mobileOpen && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden absolute top-4 right-3 z-10 rounded-lg p-2.5 text-panda-dim hover:text-panda-text hover:bg-panda-elevated transition-colors"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        )}

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <div className="flex items-center justify-center w-9 h-9 shrink-0">
            <motion.img
              src={pandaIcon}
              alt="LanCache"
              className="w-9 h-9"
              whileHover={{ rotate: [0, -10, 10, -5, 0], scale: 1.1 }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="logo-text"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div>
                  <p className="text-panda-text font-semibold text-base leading-tight tracking-wide whitespace-nowrap font-display">
                    LANCache
                  </p>
                  <p className="text-xs text-panda-dim font-medium tracking-wider whitespace-nowrap">
                    Monolithic
                  </p>
                </div>
                <div className="mt-1.5 h-0.5 w-12 rounded-full bg-gradient-to-r from-bamboo to-bamboo-deep" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3 rounded-xl transition-all duration-200 relative overflow-hidden',
                  collapsed ? 'px-3 py-3.5 justify-center' : 'px-4 py-3.5',
                  isActive
                    ? 'bg-bamboo/12 text-bamboo border-l-2 border-bamboo pl-[10px]'
                    : 'text-panda-muted hover:text-panda-text hover:bg-panda-elevated/60 border-l-2 border-transparent',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={19}
                    className={[
                      'shrink-0 transition-colors duration-150',
                      isActive ? 'text-bamboo' : 'text-panda-dim group-hover:text-panda-muted',
                    ].join(' ')}
                  />
                  <AnimatePresence initial={false}>
                    {!collapsed && (
                      <motion.span
                        key={`label-${to}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.18 }}
                        className={[
                          'text-base font-medium whitespace-nowrap overflow-hidden',
                          isActive ? 'text-bamboo' : '',
                        ].join(' ')}
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {isActive && (
                    <motion.div
                      layoutId="nav-glow"
                      className="absolute inset-0 rounded-xl bg-bamboo/5 pointer-events-none"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Time format + Collapse + version */}
        <div className="px-3 pb-5 flex flex-col gap-1">
          <button
            onClick={toggle}
            className={[
              'flex items-center gap-3 rounded-xl transition-colors duration-150 text-panda-muted hover:text-panda-text hover:bg-panda-elevated/60',
              collapsed ? 'px-3 py-3 lg:py-2.5 justify-center' : 'px-4 py-3 lg:py-2.5',
            ].join(' ')}
            title={is24h ? 'Switch to 12-hour time' : 'Switch to 24-hour time'}
          >
            <Clock size={19} className="shrink-0" />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="time-label"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.18 }}
                  className="text-sm font-mono font-medium whitespace-nowrap"
                >
                  {is24h ? '24-hour' : '12-hour'}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex items-center justify-center w-full rounded-xl py-2.5 text-panda-dim hover:text-panda-muted hover:bg-panda-elevated/60 transition-colors duration-150"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.p
                key="version"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-center text-xs text-panda-dim font-mono select-none"
              >
                v3.1.0
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  )
}
