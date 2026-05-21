import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import useTimeRange from '../hooks/useTimeRange'
import {
  PieChart as PieChartIcon,
  TrendingUp,
  AlertCircle,
  Ban,
  CheckCircle,
  AlertTriangle,
  Wifi,
  Globe,
  HelpCircle,
  Server,
  Database,
  Users,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Download,
  Shield,
  RefreshCw,
  Tag,
  X,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { useTimeFormat } from '../hooks/useTimeFormat'
import { CollapsibleSection, ServiceBadge, Tabs } from '../components'

/* ── Helpers ──────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(1)} TB`
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// Hit-rate colors deliberately never use `err` (red). A low hit rate means the
// cache is serving fewer requests from local storage — it is *underperforming*,
// not *erroring*. Red is reserved across the app for actual failures (errors,
// conn refused, disk critical, etc.). Hit rate uses a green → amber gradient:
//   ≥ 80%  bamboo   — healthy, cache earning its keep
//   ≥ 50%  warn     — mediocre, room for improvement
//   < 50%  warn/70  — low but not an error (e.g. new content, cold cache)
function hitRateColor(rate) {
  if (rate >= 80) return 'text-bamboo'
  if (rate >= 50) return 'text-warn'
  return 'text-warn/70'
}

function hitRateBg(rate) {
  if (rate >= 80) return 'bg-bamboo'
  if (rate >= 50) return 'bg-warn'
  return 'bg-warn/60'
}

function hitRateDot(rate) {
  if (rate >= 80) return 'bg-bamboo breathe-green'
  if (rate >= 50) return 'bg-warn breathe-amber'
  return 'bg-warn/60 breathe-amber'
}

/* ── Custom tooltips ──────────────────────────────────────────── */

function CustomPieTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const entry = payload[0].payload
  return (
    <div
      className="rounded-lg px-4 py-3 text-sm shadow-xl border border-white/10 backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(42, 42, 44, 0.92)' }}
    >
      <div className="font-semibold text-base" style={{ color: entry.color }}>{entry.name}</div>
      <div className="text-panda-muted mt-0.5">
        {entry.value.toFixed(1)}% &mdash; {entry.count.toLocaleString()} requests
      </div>
    </div>
  )
}

function CustomLineTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div
      className="rounded-lg px-4 py-3 text-sm shadow-xl border border-white/10 backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(42, 42, 44, 0.92)' }}
    >
      <div className="font-mono text-sm text-panda-dim">{label}</div>
      <div className="font-semibold text-base text-err mt-0.5">
        {payload[0].value} {payload[0].value === 1 ? 'error' : 'errors'}
      </div>
    </div>
  )
}

/* ── Generic sub-components ───────────────────────────────────── */

function LevelBadge({ level }) {
  const map = {
    error: 'bg-err/10 text-err',
    warn: 'bg-warn/10 text-warn',
    info: 'bg-info/10 text-info',
  }
  const cls = map[level] ?? map.info
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium uppercase ${cls}`}>
      {level}
    </span>
  )
}

/* ── Hero KPI strip ───────────────────────────────────────────── */

function HeroKPIStrip({ bw }) {
  const ratio = bw.total_served > 0 ? (bw.bandwidth_saved / bw.total_served) * 100 : 0
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
      {/* Bandwidth Saved — 2x-wide hero */}
      <div className="lg:col-span-2 rounded-xl bg-panda-surface border border-bamboo/30 p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-bamboo/8 to-transparent pointer-events-none" />
        <div className="relative flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-panda-dim">
            <Download size={16} className="text-bamboo" />
            Bandwidth Saved
          </div>
          <p
            className="text-4xl sm:text-5xl font-bold font-mono text-bamboo leading-none"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatBytes(bw.bandwidth_saved)}
          </p>
          {bw.total_served > 0 ? (
            <p className="text-sm text-panda-dim">
              <span className="text-bamboo font-mono font-medium">{ratio.toFixed(1)}%</span> of bytes served from cache
            </p>
          ) : (
            <p className="text-sm text-panda-dim">No traffic yet in this window</p>
          )}
        </div>
      </div>

      <KPICard
        label="Cache Hit Rate"
        icon={Shield}
        iconClass={bw.total_served > 0 ? hitRateColor(bw.hit_rate_bytes) : 'text-panda-dim'}
        value={bw.total_served > 0 ? `${bw.hit_rate_bytes.toFixed(1)}%` : '—'}
        valueClass={bw.total_served > 0 ? hitRateColor(bw.hit_rate_bytes) : 'text-panda-dim'}
      />
      <KPICard label="Total Served" icon={Database} value={formatBytes(bw.total_served)} />
      <KPICard label="Active Clients" icon={Users} value={bw.unique_clients.toLocaleString()} />
    </div>
  )
}

function KPICard({ label, icon: Icon, iconClass = 'text-panda-muted', value, valueClass = 'text-panda-text' }) {
  return (
    <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col gap-3 justify-center">
      <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-panda-dim">
        <Icon size={16} className={iconClass} />
        {label}
      </div>
      <p
        className={`text-2xl sm:text-3xl font-bold font-mono ${valueClass}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  )
}

/* ── Performance panel (Error trend + Cache mix + Upstream Health) ── */

function PerformancePanel({ hasErrors, errorRate, cacheStatus, totalRequests, uh }) {
  return (
    <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr_1.4fr] gap-6">
        {/* Error Rate trend */}
        <PerformanceColumn title="Error Rate" icon={TrendingUp} iconClass="text-err/80">
          {hasErrors ? (
            <div className="h-60 sm:h-65">
              <ResponsiveContainer width="100%" height="100%" minHeight={0}>
                <AreaChart data={errorRate} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef5350" stopOpacity={0.4} />
                      <stop offset="40%" stopColor="#ef5350" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#ef5350" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#8a8a8e', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a8a8e', fontSize: 11 }} width={26} allowDecimals={false} />
                  <Tooltip content={<CustomLineTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="errors"
                    stroke="#ef5350"
                    strokeWidth={2.5}
                    fill="url(#errorGrad)"
                    dot={{ fill: '#ef5350', r: 3.5, strokeWidth: 0 }}
                    activeDot={{ fill: '#ef5350', r: 5, strokeWidth: 2, stroke: '#1c1c1e' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <QuietHealthy>No errors in window</QuietHealthy>
          )}
        </PerformanceColumn>

        {/* Cache mix donut */}
        <PerformanceColumn title="Cache Mix" icon={PieChartIcon} iconClass="text-bamboo">
          {totalRequests > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-50 h-50 sm:w-55 sm:h-55">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={cacheStatus} dataKey="value" innerRadius={62} outerRadius={92} paddingAngle={2}>
                      {cacheStatus.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
                {cacheStatus.slice(0, 4).map((e) => (
                  <div key={e.name} className="inline-flex items-center gap-1 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />
                    <span className="text-panda-dim">{e.name}</span>
                    <span className="text-panda-muted font-mono">{e.value.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <QuietHealthy variant="muted">No requests in window</QuietHealthy>
          )}
        </PerformanceColumn>

        {/* Upstream Health
           Color semantics:
             timeouts     — amber (transient network issue)
             conn refused — red   (hard upstream failure)
             dns          — amber (resolver problem; recoverable)
             other        — amber (unknown error class; lean caution)
           A count of 0 is dimmed regardless (handled in MiniStat). */}
        <PerformanceColumn title="Upstream Health" icon={Server} iconClass="text-bamboo">
          {uh.total_errors === 0 ? (
            <QuietHealthy>No upstream errors</QuietHealthy>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat icon={AlertTriangle} count={uh.timeouts} label="Timeouts" colorClass="text-warn" />
                <MiniStat icon={Wifi} count={uh.conn_refused} label="Conn refused" colorClass="text-err" />
                <MiniStat icon={Globe} count={uh.dns_failures} label="DNS" colorClass="text-warn" />
                <MiniStat icon={HelpCircle} count={uh.other} label="Other" colorClass="text-warn" />
              </div>
              {uh.top_hosts && uh.top_hosts.length > 0 && (
                <div className="flex flex-col gap-1">
                  {uh.top_hosts.slice(0, 3).map((h) => (
                    <div
                      key={h.host}
                      className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-panda-bg/60 border border-panda-border/50"
                    >
                      <ServiceBadge service={h.service} dense />
                      <span className="font-mono text-panda-muted truncate flex-1 min-w-0">{h.host}</span>
                      <span
                        className={`font-mono font-semibold shrink-0 ${h.count > 50 ? 'text-err' : h.count > 10 ? 'text-warn' : 'text-warn/70'}`}
                      >
                        {h.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </PerformanceColumn>
      </div>
    </div>
  )
}

function PerformanceColumn({ title, icon: Icon, iconClass, children }) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className={iconClass} />
        <h3 className="text-xs font-semibold text-panda-muted uppercase tracking-wider">{title}</h3>
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  )
}

function QuietHealthy({ children, variant = 'bamboo' }) {
  const color = variant === 'muted' ? 'text-panda-dim' : 'text-bamboo/80'
  return (
    <div className={`flex items-center gap-2 text-sm ${color}`}>
      <CheckCircle size={14} />
      {children}
    </div>
  )
}

function MiniStat({ icon: Icon, count, label, colorClass }) {
  const color = count > 0 ? colorClass : 'text-panda-dim'
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md p-2 bg-panda-bg/60 border border-panda-border/50">
      <Icon size={13} className={color} />
      <span
        className={`font-mono text-lg font-semibold ${color}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {count}
      </span>
      <span className="text-[10px] text-panda-dim uppercase tracking-wider">{label}</span>
    </div>
  )
}

/* ── Service Health Overview ──────────────────────────────────── */

function ServiceHealthCard({ svc }) {
  const hr = svc.hit_rate
  // A service with very few requests can show a 0% hit rate that isn't really
  // "bad" — it just hasn't seen enough traffic yet. Treat < 10 requests as a
  // no-data state with muted colors instead of red.
  const hasMeaningfulData = svc.requests >= 10
  const accentClass = hasMeaningfulData ? hitRateColor(hr) : 'text-panda-muted'
  const dotClass = hasMeaningfulData ? hitRateDot(hr) : 'bg-panda-dim'
  const barColor = hasMeaningfulData ? hitRateBg(hr) : 'bg-panda-elevated'
  const displayName = svc.service.charAt(0).toUpperCase() + svc.service.slice(1)

  return (
    <Link
      to={`/logs?service=${encodeURIComponent(svc.service)}`}
      className="group rounded-xl bg-panda-surface border border-panda-border hover:border-bamboo/40 hover:bg-panda-elevated/30 transition-colors p-4 flex flex-col gap-3 min-h-40"
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <h3 className="text-base font-semibold text-panda-text truncate flex-1">{displayName}</h3>
        {!hasMeaningfulData && (
          <span className="text-[10px] uppercase tracking-wider text-panda-dim/80">low data</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-panda-dim">
          Cache hit rate
        </p>
        <p
          className={`text-3xl font-bold font-mono leading-none ${accentClass}`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {hr.toFixed(1)}
          <span className="text-xl">%</span>
        </p>
        <div className="h-1.5 w-full rounded-full bg-panda-bg overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-700`}
            style={{ width: `${Math.max(0, Math.min(hr, 100))}%` }}
          />
        </div>
        <p className="text-[11px] text-panda-dim leading-snug">
          of bytes served from cache
        </p>
      </div>

      <div className="mt-auto pt-2 border-t border-panda-border/50 flex items-center justify-between text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-panda-dim uppercase tracking-wider">Requests</span>
          <span
            className="font-mono text-panda-muted text-sm"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {svc.requests.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 items-end">
          <span className="text-panda-dim uppercase tracking-wider">Served</span>
          <span className="font-mono text-panda-muted text-sm">{formatBytes(svc.bytes)}</span>
        </div>
      </div>
    </Link>
  )
}

function ServiceHealthOverview({ services, serviceFilter }) {
  return (
    <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Server size={18} className="text-bamboo" />
        <h2 className="text-base font-semibold text-panda-text">Service Health</h2>
        {services.length > 0 && (
          <span className="rounded-full px-3 py-1 text-sm bg-panda-elevated text-panda-dim">
            {services.length} {services.length === 1 ? 'service' : 'services'}
          </span>
        )}
      </div>
      {services.length === 0 ? (
        <p className="text-sm text-panda-dim py-2">
          {serviceFilter
            ? <>No traffic recorded for <span className="font-mono text-panda-muted">{serviceFilter}</span> in this window.</>
            : 'No services have seen traffic in this window.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {services.map((svc) => <ServiceHealthCard key={svc.service} svc={svc} />)}
        </div>
      )}
    </div>
  )
}

/* ── Issues panel (Errors + No-Slice tabs) ───────────────────── */

function ErrorsTable({ rows, formatTime, serviceFilter }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-5 py-4 text-sm text-bamboo/80">
        <CheckCircle size={16} />
        {serviceFilter ? `No recent errors for ${serviceFilter}` : 'No errors in window'}
      </div>
    )
  }
  return (
    <div className="overflow-auto" style={{ maxHeight: '400px' }}>
      <table className="w-full min-w-150 text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-panda-elevated border-b border-panda-border">
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim">Time</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Service</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim">Client IP</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Level</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((err, index) => (
            <tr
              key={`${err.time}-${index}`}
              className={`border-b border-panda-border last:border-b-0 table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
            >
              <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-dim font-mono align-top">
                {formatTime(err.time)}
              </td>
              <td className="px-5 py-3 align-top whitespace-nowrap"><ServiceBadge service={err.service} dense /></td>
              <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-muted font-mono align-top">
                {err.client_ip || '-'}
              </td>
              <td className="px-5 py-3 align-top"><LevelBadge level={err.level} /></td>
              <td className="px-5 py-3 font-mono text-sm text-panda-muted leading-relaxed break-all">
                <span className="line-clamp-2">{err.message}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NosliceTable({ rows, formatTime, serviceFilter }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-5 py-4 text-sm text-bamboo/80">
        <CheckCircle size={16} />
        {serviceFilter ? `No slice failures for ${serviceFilter}` : 'No slice failures detected'}
      </div>
    )
  }
  return (
    <div className="overflow-auto" style={{ maxHeight: '400px' }}>
      <table className="w-full min-w-150 text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-panda-elevated border-b border-panda-border">
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim">Time</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Service</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim">Client IP</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Host</th>
            <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((event, index) => (
            <tr
              key={`${event.host}-${index}`}
              className={`border-b border-panda-border last:border-b-0 table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
            >
              <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-dim font-mono align-top">
                {formatTime(event.time)}
              </td>
              <td className="px-5 py-3 align-top whitespace-nowrap"><ServiceBadge service={event.service} dense /></td>
              <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-muted font-mono align-top">
                {event.client_ip || '-'}
              </td>
              <td className="px-5 py-3 font-mono text-sm text-panda-text whitespace-nowrap align-top">
                {event.host}
              </td>
              <td className="px-5 py-3 font-mono text-sm text-warn leading-relaxed break-all">
                <span className="line-clamp-2">{event.error}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IssuesPanel({ recentErrors, nosliceEvents, formatTime, serviceFilter }) {
  const errorCount = recentErrors.length
  const nosliceCount = nosliceEvents.length
  const initialTab = errorCount === 0 && nosliceCount > 0 ? 'noslice' : 'errors'
  const [tab, setTab] = useState(initialTab)

  if (errorCount === 0 && nosliceCount === 0) {
    return (
      <div className="rounded-xl bg-bamboo/5 border border-bamboo/20 px-5 py-4 flex items-center gap-2.5 text-bamboo">
        <CheckCircle size={18} />
        <span className="font-medium">
          {serviceFilter ? `No issues for ${serviceFilter} in window` : 'No issues in window'}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-panda-surface border border-panda-border overflow-hidden">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'errors',  label: 'Errors',   icon: AlertCircle, count: errorCount,    tone: 'err' },
          { value: 'noslice', label: 'No-Slice', icon: Ban,         count: nosliceCount,  tone: 'warn' },
        ]}
      />
      {tab === 'errors' ? (
        <ErrorsTable rows={recentErrors} formatTime={formatTime} serviceFilter={serviceFilter} />
      ) : (
        <NosliceTable rows={nosliceEvents} formatTime={formatTime} serviceFilter={serviceFilter} />
      )}
    </div>
  )
}

/* ── Loading skeleton ─────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {/* Hero KPI strip skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="lg:col-span-2 rounded-xl bg-panda-surface border border-bamboo/30 p-5">
          <div className="h-3 w-32 bg-panda-elevated rounded animate-pulse mb-3" />
          <div className="h-10 w-40 bg-panda-elevated rounded animate-pulse" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl bg-panda-surface border border-panda-border p-5">
            <div className="h-3 w-24 bg-panda-elevated rounded animate-pulse mb-3" />
            <div className="h-8 w-20 bg-panda-elevated rounded animate-pulse" />
          </div>
        ))}
      </div>
      {/* Performance panel skeleton */}
      <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-3 w-28 bg-panda-elevated rounded animate-pulse mb-3" />
              <div className="h-32 bg-panda-elevated/50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      {/* Service Health skeleton */}
      <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
        <div className="h-4 w-32 bg-panda-elevated rounded animate-pulse mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl bg-panda-bg border border-panda-border p-4 min-h-40">
              <div className="h-3 w-20 bg-panda-elevated rounded animate-pulse mb-3" />
              <div className="h-7 w-16 bg-panda-elevated rounded animate-pulse mb-3" />
              <div className="h-1.5 w-full bg-panda-elevated rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      {/* Issues skeleton */}
      <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
        <div className="h-4 w-32 bg-panda-elevated rounded animate-pulse mb-4" />
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 w-full bg-panda-elevated rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Sort arrow (used in the Per-Service Breakdown table) ─────── */

function SortArrow({ sortKey, currentKey, currentDir }) {
  const isActive = currentKey === sortKey
  if (isActive) {
    return currentDir === 'asc'
      ? <ChevronUp size={14} className="text-bamboo" />
      : <ChevronDown size={14} className="text-bamboo" />
  }
  return <ChevronDown size={14} className="opacity-25" />
}

/* ── Main component ───────────────────────────────────────────── */

export default function Logs() {
  const { activeLogStats, fetchingRange, showingStaleLogStats } = useTimeRange()

  const { formatTime } = useTimeFormat()
  const [searchParams, setSearchParams] = useSearchParams()
  const serviceFilter = searchParams.get('service') || ''

  // Per-Service Breakdown keeps its sortable UI for power users.
  const [serviceSortKey, setServiceSortKey] = useState('bytes')
  const [serviceSortDir, setServiceSortDir] = useState('desc')

  const logStats = activeLogStats
  const isLogStatsLoading = !logStats
  const isRefreshingLogStats = fetchingRange || showingStaleLogStats

  const totalRequests = isLogStatsLoading ? 0 : (logStats.cache_status ?? []).reduce((sum, item) => sum + item.count, 0)
  const hasErrors = isLogStatsLoading ? false : (logStats.error_rate ?? []).some((b) => b.errors > 0)
  const uh = logStats?.upstream_health ?? { total_errors: 0, timeouts: 0, conn_refused: 0, dns_failures: 0, other: 0, top_hosts: [] }
  const bw = logStats?.bandwidth ?? { total_served: 0, bandwidth_saved: 0, hit_rate_bytes: 0, unique_clients: 0 }
  const cacheStatus = logStats?.cache_status ?? []
  const errorRate = logStats?.error_rate ?? []

  // Filter applies across Service Health, Per-Service table, Errors, No-Slice.
  const matchesServiceFilter = (svc) => !serviceFilter || svc === serviceFilter

  const filteredServices = isLogStatsLoading
    ? []
    : (logStats.services ?? []).filter((s) => matchesServiceFilter(s.service))

  // Service Health Overview: always sorted by traffic volume desc.
  const serviceHealthList = [...filteredServices].sort((a, b) => b.requests - a.requests)

  // Per-Service Breakdown table: user-controlled sort.
  const sortedServices = [...filteredServices].sort((a, b) => {
    const dir = serviceSortDir === 'asc' ? 1 : -1
    return (a[serviceSortKey] > b[serviceSortKey] ? 1 : -1) * dir
  })

  function toggleServiceSort(key) {
    if (serviceSortKey === key) {
      setServiceSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setServiceSortKey(key)
      setServiceSortDir('desc')
    }
  }

  // Errors + No-Slice: newest first, no sort UI.
  const filteredErrors = isLogStatsLoading
    ? []
    : (logStats.recent_errors ?? []).filter((e) => matchesServiceFilter(e.service))
  const recentErrors = [...filteredErrors].reverse()

  const filteredNoslice = isLogStatsLoading
    ? []
    : (logStats.noslice_events ?? []).filter((e) => matchesServiceFilter(e.service))
  const nosliceEvents = [...filteredNoslice].reverse()

  function clearServiceFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('service')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-panda-text">Logs</h1>
            {(isRefreshingLogStats || isLogStatsLoading) && (
              <span className="inline-flex items-center gap-2 rounded-full border border-info/20 bg-info/10 px-3 py-1.5 text-sm text-info">
                <RefreshCw size={14} className="animate-spin" />
                {isRefreshingLogStats ? 'Updating time range...' : 'Loading log stats...'}
              </span>
            )}
            {serviceFilter && (
              <button
                type="button"
                onClick={clearServiceFilter}
                title="Clear service filter"
                className="inline-flex items-center gap-2 rounded-full border border-bamboo/30 bg-bamboo/10 px-3 py-1.5 text-sm text-bamboo hover:bg-bamboo/20 transition-colors"
              >
                <Tag size={13} />
                <span className="font-mono">{serviceFilter}</span>
                <X size={13} className="opacity-70" />
              </button>
            )}
          </div>
          <p className="mt-1 text-base text-panda-dim">
            {serviceFilter
              ? <>Showing entries for <span className="font-mono text-bamboo">{serviceFilter}</span> only.</>
              : 'Operational analytics — service health, errors, and upstream performance'}
          </p>
        </div>
      </div>

      <div
        className={`flex flex-col gap-5 transition-opacity duration-300 ${isRefreshingLogStats && !isLogStatsLoading ? 'opacity-50' : ''}`}
      >
        {isLogStatsLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Hero KPI strip */}
            <HeroKPIStrip bw={bw} />

            {/* Performance panel */}
            <PerformancePanel
              hasErrors={hasErrors}
              errorRate={errorRate}
              cacheStatus={cacheStatus}
              totalRequests={totalRequests}
              uh={uh}
            />

            {/* Service Health Overview — primary visual section */}
            <ServiceHealthOverview services={serviceHealthList} serviceFilter={serviceFilter} />

            {/* Per-Service Breakdown — collapsible (closed by default when cards are present) */}
            <CollapsibleSection
              title="Per-Service Breakdown"
              icon={ArrowUpDown}
              defaultOpen={serviceHealthList.length === 0}
              badge={
                <span className="rounded-full px-3 py-1 text-sm bg-panda-elevated text-panda-dim">
                  {sortedServices.length} {sortedServices.length === 1 ? 'service' : 'services'}
                </span>
              }
            >
              {sortedServices.length === 0 ? (
                <p className="px-5 py-4 text-sm text-panda-dim">No services have seen traffic in this window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-150 text-sm">
                    <thead>
                      <tr className="bg-panda-elevated border-b border-panda-border">
                        <th
                          onClick={() => toggleServiceSort('service')}
                          className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim hover:text-panda-text transition-colors"
                        >
                          <span className="inline-flex items-center gap-1">
                            Service <SortArrow sortKey="service" currentKey={serviceSortKey} currentDir={serviceSortDir} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleServiceSort('requests')}
                          className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim hover:text-panda-text transition-colors"
                        >
                          <span className="inline-flex items-center gap-1">
                            Requests <SortArrow sortKey="requests" currentKey={serviceSortKey} currentDir={serviceSortDir} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleServiceSort('bytes')}
                          className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim hover:text-panda-text transition-colors"
                        >
                          <span className="inline-flex items-center gap-1">
                            Bytes Served <SortArrow sortKey="bytes" currentKey={serviceSortKey} currentDir={serviceSortDir} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleServiceSort('hit_rate')}
                          className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim hover:text-panda-text transition-colors"
                        >
                          <span className="inline-flex items-center gap-1">
                            Hit Rate <SortArrow sortKey="hit_rate" currentKey={serviceSortKey} currentDir={serviceSortDir} />
                          </span>
                        </th>
                        <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedServices.map((svc, index) => (
                        <tr
                          key={svc.service}
                          className={`border-b border-panda-border last:border-b-0 table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                        >
                          <td className="px-5 py-3 text-sm font-medium text-panda-text">
                            {svc.service.charAt(0).toUpperCase() + svc.service.slice(1)}
                          </td>
                          <td
                            className="px-5 py-3 font-mono text-sm text-panda-muted"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {svc.requests.toLocaleString()}
                          </td>
                          <td
                            className="px-5 py-3 font-mono text-sm text-panda-muted"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatBytes(svc.bytes)}
                          </td>
                          <td
                            className={`px-5 py-3 font-mono text-sm font-semibold ${hitRateColor(svc.hit_rate)}`}
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {svc.hit_rate.toFixed(1)}%
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-block h-5 w-1.5 rounded-full ${hitRateBg(svc.hit_rate)}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsibleSection>

            {/* Issues panel — tabbed Errors / No-Slice */}
            <IssuesPanel
              recentErrors={recentErrors}
              nosliceEvents={nosliceEvents}
              formatTime={formatTime}
              serviceFilter={serviceFilter}
            />
          </>
        )}
      </div>
    </div>
  )
}
