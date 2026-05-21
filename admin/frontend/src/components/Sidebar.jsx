import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Settings,
  Network,
  ScrollText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import pandaIcon from '../assets/panda.svg'
import { useTimeFormat } from '../hooks/useTimeFormat'
import useTimeRange from '../hooks/useTimeRange'
import { TIME_RANGES } from '../lib/constants'

/** @type {{ to: string, icon: import('lucide-react').LucideIcon, label: string }[]} */
const NAV_ITEMS = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/config',   icon: Settings,        label: 'Config'    },
  { to: '/upstream', icon: Network,         label: 'Upstream'  },
  { to: '/logs',     icon: ScrollText,      label: 'Logs'      },
]

const VERSION = 'v3.1.0'

/**
 * Re-renders every second so the clock ticks. Returns the current Date.
 * Aligns the first tick to the next whole second so all components stay in
 * lock-step regardless of when the component mounted.
 */
function useLiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let intervalId
    const msToNextSecond = 1000 - (Date.now() % 1000)
    const initialTimeout = setTimeout(() => {
      setNow(new Date())
      intervalId = setInterval(() => setNow(new Date()), 1000)
    }, msToNextSecond)
    return () => {
      clearTimeout(initialTimeout)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  return now
}

/**
 * Format the live clock as HH:MM:SS in either 12-hour or 24-hour mode.
 * @param {Date} date
 * @param {boolean} is24h
 */
function formatClockTime(date, is24h) {
  if (is24h) {
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    return `${h}:${m}:${s}`
  }
  let h = date.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s} ${ampm}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Format the date as `Wed · 20 May`.
 * @param {Date} date
 */
function formatClockDate(date) {
  return `${WEEKDAYS[date.getDay()]} · ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/**
 * Compact clock string for the collapsed-sidebar chip. Honors the user's
 * 12h/24h preference — previously this was hard-coded to 24h.
 *   24h → "13:34"
 *   12h → "1:34 PM"
 *
 * @param {Date} date
 * @param {boolean} is24h
 */
function formatClockCompact(date, is24h) {
  const m = String(date.getMinutes()).padStart(2, '0')
  if (is24h) {
    const h = String(date.getHours()).padStart(2, '0')
    return `${h}:${m}`
  }
  let h = date.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

/* ────────────────────────────────────────────────────────────────────
 * Sidebar
 * ──────────────────────────────────────────────────────────────────── */
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { is24h, toggle } = useTimeFormat()
  const { timeRange, setTimeRange } = useTimeRange()
  const now = useLiveClock()

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 1024) setCollapsed(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const time = formatClockTime(now, is24h)
  const date = formatClockDate(now)
  const compactTime = formatClockCompact(now, is24h)

  return (
    <>
      {/* ── Mobile bottom tab bar ──────────────────────────────────── */}
      <MobileTabBar timeRange={timeRange} setTimeRange={setTimeRange} />

      {/* ── Desktop sidebar ────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 248 }}
        transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
        className="relative hidden lg:flex flex-col overflow-hidden bg-panda-surface border-r border-panda-border shrink-0 h-screen"
      >
        {/* Brand block */}
        <BrandBlock collapsed={collapsed} />

        {/* Scrollable middle (nav + time range) */}
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto overflow-x-hidden pb-3 min-h-0">
          {/* NAVIGATE section */}
          <div className="flex flex-col">
            <SectionLabel collapsed={collapsed}>Navigate</SectionLabel>
            <nav className="flex flex-col gap-0.5 px-3">
              {NAV_ITEMS.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </nav>
          </div>

          {/* TIME RANGE section */}
          <div className="flex flex-col">
            <SectionLabel collapsed={collapsed}>Time Range</SectionLabel>
            <TimeRangePicker
              collapsed={collapsed}
              value={timeRange}
              onChange={setTimeRange}
            />
          </div>
        </div>

        {/* Live clock + collapse toggle (sticky footer) */}
        <div className="shrink-0 px-3 pt-2 pb-4 flex flex-col gap-2 border-t border-panda-border/60">
          <ClockCard
            collapsed={collapsed}
            time={time}
            date={date}
            compactTime={compactTime}
            is24h={is24h}
            onToggleFormat={toggle}
          />
          <CollapseToggle
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
          />
          {!collapsed && (
            <p className="text-center text-[11px] text-panda-dim/70 font-mono tracking-wider select-none">
              {VERSION}
            </p>
          )}
        </div>
      </motion.aside>
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Brand block (logo + wordmark + tiny version pill)
 * ──────────────────────────────────────────────────────────────────── */
function BrandBlock({ collapsed }) {
  return (
    <div className="shrink-0 px-3 pt-5 pb-4">
      <div
        className={[
          'flex items-center gap-3 rounded-2xl bg-panda-bg/40 border border-panda-border/60 transition-colors',
          collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2.5',
        ].join(' ')}
      >
        <div className="flex items-center justify-center w-9 h-9 shrink-0">
          <motion.img
            src={pandaIcon}
            alt="LanCache"
            className="w-9 h-9"
            whileHover={{ rotate: [0, -8, 8, -4, 0], scale: 1.08 }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="brand-text"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col min-w-0 flex-1"
            >
              <div className="flex items-baseline gap-2">
                <p className="text-panda-text font-semibold text-[15px] leading-none tracking-wide font-display truncate">
                  LANCache
                </p>
                <span className="text-[10px] font-mono text-bamboo/85 bg-bamboo/10 px-1.5 py-0.5 rounded leading-none shrink-0">
                  {VERSION}
                </span>
              </div>
              <p className="text-[11px] text-panda-dim tracking-[0.14em] uppercase mt-1 font-medium">
                Monolithic
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Section header
 * ──────────────────────────────────────────────────────────────────── */
function SectionLabel({ collapsed, children }) {
  return (
    <AnimatePresence initial={false}>
      {!collapsed ? (
        <motion.p
          key="section-label"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="px-5 pb-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-panda-dim select-none"
        >
          {children}
        </motion.p>
      ) : (
        <div key="section-divider" className="mx-4 mb-2 h-px bg-panda-border/40" />
      )}
    </AnimatePresence>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Nav item
 * ──────────────────────────────────────────────────────────────────── */
function NavItem({ item, collapsed }) {
  const { to, icon: Icon, label } = item
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        [
          'group relative flex items-center rounded-xl transition-colors duration-150',
          collapsed ? 'justify-center px-2.5 py-2.5' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'text-bamboo bg-bamboo/10'
            : 'text-panda-muted hover:text-panda-text hover:bg-panda-elevated/55',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {/* Slim left accent bar (only on active) */}
          {isActive && (
            <motion.span
              layoutId="nav-accent-bar"
              className="absolute left-1 top-2 bottom-2 w-[3px] rounded-full bg-bamboo"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          <Icon
            size={18}
            strokeWidth={isActive ? 2.4 : 2}
            className={[
              'shrink-0 transition-colors duration-150',
              isActive ? 'text-bamboo' : 'text-panda-dim group-hover:text-panda-muted',
            ].join(' ')}
          />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key={`label-${to}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.16 }}
                className={[
                  'text-[14px] font-medium tracking-tight whitespace-nowrap',
                  isActive ? 'text-bamboo' : '',
                ].join(' ')}
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {/* Active dot on the right (expanded only) */}
          {isActive && !collapsed && (
            <motion.span
              key="active-dot"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.18 }}
              className="ml-auto w-1.5 h-1.5 rounded-full bg-bamboo breathe-green"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Time range picker (expanded = pills, collapsed = stacked mini pills)
 * ──────────────────────────────────────────────────────────────────── */
function TimeRangePicker({ collapsed, value, onChange }) {
  if (collapsed) {
    return (
      <div className="flex flex-col gap-1 px-2">
        {TIME_RANGES.map(({ label, hours }) => {
          const active = value === hours
          return (
            <button
              key={hours}
              onClick={() => onChange(hours)}
              title={`Time range: ${label}`}
              className={[
                'w-full rounded-md py-1 text-[11px] font-mono font-medium transition-colors',
                active
                  ? 'bg-bamboo/15 text-bamboo'
                  : 'text-panda-dim hover:text-panda-text hover:bg-panda-elevated/55',
              ].join(' ')}
            >
              {label}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="px-3">
      <div className="inline-flex gap-1 rounded-xl bg-panda-bg/50 border border-panda-border/60 p-1">
        {TIME_RANGES.map(({ label, hours }) => {
          const active = value === hours
          return (
            <button
              key={hours}
              onClick={() => onChange(hours)}
              className={[
                'relative px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors',
                active
                  ? 'text-bamboo'
                  : 'text-panda-muted hover:text-panda-text',
              ].join(' ')}
            >
              {active && (
                <motion.span
                  layoutId="time-range-active"
                  className="absolute inset-0 rounded-lg bg-bamboo/15 ring-1 ring-bamboo/30"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-[1]">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Live clock card — featured at the bottom. Click anywhere to toggle format.
 * ──────────────────────────────────────────────────────────────────── */
function ClockCard({ collapsed, time, date, compactTime, is24h, onToggleFormat }) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleFormat}
        title={`Live clock · click to toggle ${is24h ? '12-hour' : '24-hour'} format`}
        className="w-full rounded-lg bg-panda-bg/50 border border-panda-border/60 py-1.5 hover:border-bamboo/40 transition-colors"
      >
        <span className="block text-[11px] font-mono font-medium text-panda-text tracking-tight">
          {compactTime}
        </span>
        <span className="block text-[8px] font-mono text-panda-dim/70 mt-0.5 leading-none">
          {is24h ? '24h' : '12h'}
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggleFormat}
      title={`Click to switch to ${is24h ? '12-hour' : '24-hour'} format`}
      className="group w-full rounded-xl bg-panda-bg/60 border border-panda-border/60 hover:border-bamboo/40 transition-colors px-3.5 py-2.5 text-left"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="relative inline-flex w-1.5 h-1.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-bamboo breathe-green" />
        </span>
        <span className="text-[9.5px] font-semibold tracking-[0.2em] uppercase text-bamboo/85">
          Live
        </span>
      </div>
      <p className="text-[20px] font-mono font-semibold text-panda-text leading-none tabular-nums tracking-tight">
        {time}
      </p>
      <p className="mt-1.5 text-[11px] text-panda-dim font-medium tracking-wide flex items-center gap-2">
        <span>{date}</span>
        <span className="text-panda-dim/50">·</span>
        <span className="font-mono uppercase tracking-wider text-panda-muted group-hover:text-bamboo/80 transition-colors">
          {is24h ? '24h' : '12h'}
        </span>
      </p>
    </button>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Collapse toggle — small chevron, right-aligned
 * ──────────────────────────────────────────────────────────────────── */
function CollapseToggle({ collapsed, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={[
        'flex items-center rounded-lg text-panda-dim hover:text-panda-text hover:bg-panda-elevated/50 transition-colors',
        collapsed ? 'justify-center w-full py-2' : 'justify-end px-2 py-1.5',
      ].join(' ')}
    >
      {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      {!collapsed && (
        <span className="ml-1.5 text-[11px] font-medium tracking-wide select-none">
          Collapse
        </span>
      )}
    </button>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Mobile bottom tab bar
 * ──────────────────────────────────────────────────────────────────── */
function MobileTabBar({ timeRange, setTimeRange }) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-panda-border bg-panda-surface/95 backdrop-blur-md safe-bottom">
      {/* Time-range pills row */}
      <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 border-b border-panda-border/50">
        {TIME_RANGES.map(({ label, hours }) => {
          const active = timeRange === hours
          return (
            <button
              key={hours}
              onClick={() => setTimeRange(hours)}
              className={[
                'relative px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors',
                active
                  ? 'text-bamboo'
                  : 'text-panda-muted hover:text-panda-text hover:bg-panda-bg',
              ].join(' ')}
            >
              {active && (
                <motion.span
                  layoutId="mobile-time-range-active"
                  className="absolute inset-0 rounded-md bg-bamboo/20 ring-1 ring-bamboo/30"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-[1]">{label}</span>
            </button>
          )
        })}
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
                isActive ? 'text-bamboo' : 'text-panda-dim active:text-panda-text',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex items-center justify-center">
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <motion.div
                      layoutId="mobile-tab-indicator"
                      className="absolute -inset-1.5 rounded-lg bg-bamboo/12"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </div>
                <span
                  className={[
                    'text-[11px] font-medium leading-none',
                    isActive ? 'font-semibold' : '',
                  ].join(' ')}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
