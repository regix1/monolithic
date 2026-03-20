import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Settings, Network, ScrollText, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import pandaIcon from '../assets/panda.svg'
import { useTimeFormat } from '../hooks/useTimeFormat'
import { useIsMobile } from '../hooks/useBreakpoint'
import useTimeRange from '../hooks/useTimeRange'
import { TIME_RANGES } from '../lib/constants'

/** @type {{ to: string, icon: import('lucide-react').LucideIcon, label: string }[]} */
const NAV_ITEMS = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/config',   icon: Settings,        label: 'Config' },
  { to: '/upstream', icon: Network,          label: 'Upstream' },
  { to: '/logs',     icon: ScrollText,       label: 'Logs' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { is24h, toggle } = useTimeFormat()
  const isMobile = useIsMobile()
  const { timeRange, setTimeRange } = useTimeRange()

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 1024) setCollapsed(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <>
      {/* ── Mobile bottom tab bar ──────────────────────────────────── */}
      <div className="lg:hidden fixed! bottom-0 left-0 right-0 z-50 flex flex-col border-t border-panda-border bg-panda-surface/95 backdrop-blur-md safe-bottom">
        {/* Time range pills row */}
        <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 border-b border-panda-border/50">
          {TIME_RANGES.map(({ label, hours }) => (
            <button
              key={hours}
              onClick={() => setTimeRange(hours)}
              className={[
                'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                timeRange === hours
                  ? 'bg-bamboo/20 text-bamboo ring-1 ring-bamboo/30'
                  : 'text-panda-muted hover:text-panda-text hover:bg-panda-bg',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <nav className="flex items-stretch">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-colors duration-150',
                isActive
                  ? 'text-bamboo'
                  : 'text-panda-dim active:text-panda-text',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex items-center justify-center">
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute -inset-1.5 rounded-lg bg-bamboo/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </div>
                <span className={[
                  'text-[11px] font-medium leading-none',
                  isActive ? 'font-semibold' : '',
                ].join(' ')}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
        </nav>
      </div>

      {/* ── Desktop sidebar ────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240, x: 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="relative hidden lg:flex flex-col overflow-y-auto overflow-x-hidden bg-panda-surface border-r border-panda-border shrink-0 h-screen"
      >
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

        {/* Time range pills */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="time-range-pills"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden px-3 pb-2"
            >
              <div className="flex gap-1 flex-wrap">
                {TIME_RANGES.map(({ label, hours }) => (
                  <button
                    key={hours}
                    onClick={() => setTimeRange(hours)}
                    className={[
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                      timeRange === hours
                        ? 'bg-bamboo/20 text-bamboo ring-1 ring-bamboo/30'
                        : 'text-panda-muted hover:text-panda-text hover:bg-panda-bg',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Time format + Collapse + version */}
        <div className="px-3 pb-5 flex flex-col gap-1">
          <button
            onClick={toggle}
            className={[
              'flex items-center gap-3 rounded-xl transition-colors duration-150 text-panda-muted hover:text-panda-text hover:bg-panda-elevated/60',
              collapsed ? 'px-3 py-2.5 justify-center' : 'px-4 py-2.5',
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
