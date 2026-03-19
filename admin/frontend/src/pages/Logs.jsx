import { useState } from 'react'
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
import { useSSE } from '../hooks/useSSE'
import { useTimeFormat } from '../hooks/useTimeFormat'
import { api } from '../lib/api'

/* ── Helpers ──────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(1)} TB`
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function hitRateColor(rate) {
  if (rate >= 80) return 'text-bamboo'
  if (rate >= 60) return 'text-warn'
  return 'text-err'
}

function hitRateDot(rate) {
  if (rate >= 80) return 'bg-bamboo'
  if (rate >= 60) return 'bg-warn'
  return 'bg-err'
}

/* ── Custom Tooltips ──────────────────────────────────────────── */

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

/* ── Sub-components ───────────────────────────────────────────── */

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

function UpstreamStatCard({ icon: Icon, count, label, colorClass }) {
  const activeColor = count > 0 ? colorClass : 'text-panda-dim'
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg p-4 bg-panda-bg border border-panda-border">
      <Icon size={18} className={activeColor} />
      <span className={`font-mono text-2xl font-semibold ${activeColor}`}>{count}</span>
      <span className="text-sm text-panda-dim">{label}</span>
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────── */

const TIME_RANGES = [
  { label: '1 Hour', hours: 1 },
  { label: '24 Hours', hours: 24 },
  { label: '7 Days', hours: 168 },
  { label: '30 Days', hours: 720 },
]

export default function Logs() {
  const { data: sseLogStats, loading } = useSSE('logstats', api.getLogStats)

  /* All hooks MUST be called before any early return */
  const { formatTime } = useTimeFormat()
  const [timeRange, setTimeRange] = useState(720)
  const [statsCache, setStatsCache] = useState({})
  const [fetchingRange, setFetchingRange] = useState(false)
  const [serviceSortKey, setServiceSortKey] = useState('bytes')
  const [serviceSortDir, setServiceSortDir] = useState('desc')
  const [errorSortKey, setErrorSortKey] = useState('time')
  const [errorSortDir, setErrorSortDir] = useState('desc')
  const [nosliceSortKey, setNosliceSortKey] = useState('time')
  const [nosliceSortDir, setNosliceSortDir] = useState('desc')

  // When time range changes, fetch filtered data from REST API
  const apiLogStats = timeRange === 720 ? sseLogStats : (statsCache[timeRange] ?? null)

  async function handleTimeRangeChange(hours) {
    setTimeRange(hours)
    if (hours === 720) return  // SSE handles default

    // Check cache first
    if (statsCache[hours]) {
      return  // already cached, will be used via apiLogStats
    }

    setFetchingRange(true)
    const result = await fetch(`/api/logs/stats?hours=${hours}`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
    if (result) {
      setStatsCache(prev => ({ ...prev, [hours]: result }))
    }
    setFetchingRange(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-panda-text">Logs</h1>
          <p className="mt-1 text-base text-panda-dim">Loading...</p>
        </div>
      </div>
    )
  }

  const logStats = apiLogStats ?? { cache_status: [], error_rate: [], recent_errors: [], noslice_events: [], upstream_health: { total_errors: 0, timeouts: 0, conn_refused: 0, dns_failures: 0, other: 0, top_hosts: [] }, bandwidth: { total_served: 0, bandwidth_saved: 0, hit_rate_bytes: 0, unique_clients: 0 }, services: [] }

  const totalRequests = logStats.cache_status.reduce((sum, item) => sum + item.count, 0)
  const hasErrors = logStats.error_rate.some(b => b.errors > 0)
  const uh = logStats.upstream_health ?? { total_errors: 0, timeouts: 0, conn_refused: 0, dns_failures: 0, other: 0, top_hosts: [] }
  const bw = logStats.bandwidth ?? { total_served: 0, bandwidth_saved: 0, hit_rate_bytes: 0, unique_clients: 0 }

  const sortedServices = [...(logStats.services ?? [])].sort((a, b) => {
    const dir = serviceSortDir === 'asc' ? 1 : -1
    return (a[serviceSortKey] > b[serviceSortKey] ? 1 : -1) * dir
  })

  function toggleServiceSort(key) {
    if (serviceSortKey === key) {
      setServiceSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setServiceSortKey(key)
      setServiceSortDir('desc')
    }
  }

  const sortedErrors = [...(logStats.recent_errors ?? [])].sort((a, b) => {
    const dir = errorSortDir === 'asc' ? 1 : -1
    return (a[errorSortKey] > b[errorSortKey] ? 1 : -1) * dir
  })

  function toggleErrorSort(key) {
    if (errorSortKey === key) {
      setErrorSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setErrorSortKey(key)
      setErrorSortDir('desc')
    }
  }

  const sortedNoslice = [...(logStats.noslice_events ?? [])].sort((a, b) => {
    const dir = nosliceSortDir === 'asc' ? 1 : -1
    return (a[nosliceSortKey] > b[nosliceSortKey] ? 1 : -1) * dir
  })

  function toggleNosliceSort(key) {
    if (nosliceSortKey === key) {
      setNosliceSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setNosliceSortKey(key)
      setNosliceSortDir('asc')
    }
  }

  function SortArrow({ sortKey, currentKey, currentDir }) {
    const isActive = currentKey === sortKey
    if (isActive) {
      return currentDir === 'asc'
        ? <ChevronUp size={14} className="text-bamboo" />
        : <ChevronDown size={14} className="text-bamboo" />
    }
    return <ChevronDown size={14} className="opacity-25" />
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-panda-text">Logs</h1>
          <p className="mt-1 text-base text-panda-dim">
            Operational analytics — upstream performance &amp; error monitoring
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0 w-full sm:w-auto">
          {fetchingRange && (
            <span className="flex items-center gap-2 text-sm text-panda-dim">
              <span className="h-2 w-2 rounded-full bg-bamboo animate-pulse" />
              Loading...
            </span>
          )}
          <div className="flex rounded-xl bg-panda-elevated/50 border border-panda-border p-1 gap-0.5">
            {TIME_RANGES.map(({ label, hours }) => (
              <button
                key={hours}
                onClick={() => handleTimeRangeChange(hours)}
                className={[
                  'px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200',
                  timeRange === hours
                    ? 'bg-bamboo/20 text-bamboo shadow-sm'
                    : 'text-panda-dim hover:text-panda-text hover:bg-panda-elevated',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Data area — dims during fetch */}
      <div className={`flex flex-col gap-5 transition-opacity duration-300 ${fetchingRange ? 'opacity-50' : ''}`}>

      {/* ── Row 1: KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Bandwidth Saved — hero metric */}
        <div className="rounded-xl bg-panda-surface border border-bamboo/20 p-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-bamboo/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-panda-dim mb-2">
              <Download size={16} className="text-bamboo" />
              Bandwidth Saved
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-bamboo">
              {formatBytes(bw.bandwidth_saved)}
            </div>
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-panda-dim mb-2">
            <Shield size={16} className={hitRateColor(bw.hit_rate_bytes)} />
            Cache Hit Rate
          </div>
          <div className={`text-2xl sm:text-3xl font-bold font-mono ${hitRateColor(bw.hit_rate_bytes)}`}>
            {bw.hit_rate_bytes.toFixed(1)}%
          </div>
        </div>

        {/* Total Served */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-panda-dim mb-2">
            <Database size={16} className="text-panda-text" />
            Total Served
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-panda-text">
            {formatBytes(bw.total_served)}
          </div>
        </div>

        {/* Active Clients */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-panda-dim mb-2">
            <Users size={16} className="text-panda-text" />
            Active Clients
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-panda-text">
            {bw.unique_clients}
          </div>
        </div>
      </div>

      {/* ── Row 2: Error Rate Chart ───────────────────────────────── */}
      <div className="rounded-xl bg-panda-surface border border-panda-border p-5 [&_.recharts-wrapper]:outline-none">
        <div className="mb-4 flex items-center gap-3">
          <TrendingUp size={18} className="text-err" />
          <h2 className="text-base font-semibold text-panda-text">Error Rate ({TIME_RANGES.find(r => r.hours === timeRange)?.label ?? '30 Days'})</h2>
        </div>

        {hasErrors ? (
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={logStats.error_rate} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef5350" stopOpacity={0.35} />
                    <stop offset="40%" stopColor="#ef5350" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#ef5350" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#8a8a8e', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a8a8e', fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CustomLineTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="errors" stroke="#ef5350" strokeWidth={2.5} fill="url(#errorGrad)" dot={{ fill: '#ef5350', r: 4, strokeWidth: 0 }} activeDot={{ fill: '#ef5350', r: 6, strokeWidth: 2, stroke: '#1c1c1e' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg px-5 py-12 bg-bamboo/5 border border-bamboo/20">
            <CheckCircle size={24} className="text-bamboo" />
            <span className="text-base font-medium text-bamboo">No errors detected</span>
            <span className="text-sm text-bamboo/60">All clear for the selected time range</span>
          </div>
        )}
      </div>

      {/* ── Row 3: Cache Donut + Upstream Health ──────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Cache Status Distribution */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col [&_.recharts-wrapper]:outline-none">
          <div className="mb-4 flex items-center gap-3">
            <PieChartIcon size={18} className="text-bamboo" />
            <h2 className="text-base font-semibold text-panda-text">Cache Status Distribution</h2>
          </div>

          {logStats.cache_status.length > 0 && totalRequests > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center h-[280px] sm:h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={logStats.cache_status}
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="85%"
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {logStats.cache_status.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute flex flex-col items-center" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                  <span className="font-mono text-lg sm:text-2xl md:text-3xl font-bold text-panda-text">
                    {formatBytes(bw.total_served)}
                  </span>
                  <span className="text-sm uppercase tracking-wider text-panda-dim mt-1">served</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-2">
                {logStats.cache_status.map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: item.color }} />
                    <span className="text-sm font-mono font-medium text-panda-muted">{item.name}</span>
                    <span className="ml-auto text-sm font-mono text-panda-text">{item.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-base text-panda-dim">
              No cache data available yet
            </div>
          )}
        </div>

        {/* Upstream Health */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col">
          <div className="mb-4 flex items-center gap-3">
            <Server size={18} className="text-bamboo" />
            <h2 className="text-base font-semibold text-panda-text">Upstream Health</h2>
          </div>

          {uh.total_errors === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2.5 rounded-lg px-5 py-4 text-base bg-bamboo/5 border border-bamboo/20 text-bamboo">
                <CheckCircle size={18} />
                No upstream errors
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 flex-1">
              <p className="text-base text-panda-muted">
                <span className={`font-mono text-lg font-semibold ${uh.total_errors > 50 ? 'text-err' : uh.total_errors > 10 ? 'text-warn' : 'text-panda-text'}`}>{uh.total_errors}</span>{' '}
                errors in <span className="font-mono text-panda-text">upstream-error.log</span>
              </p>

              <div className="grid grid-cols-2 gap-3">
                <UpstreamStatCard icon={AlertTriangle} count={uh.timeouts} label="Timeouts" colorClass="text-warn" />
                <UpstreamStatCard icon={Wifi} count={uh.conn_refused} label="Conn Refused" colorClass="text-err" />
                <UpstreamStatCard icon={Globe} count={uh.dns_failures} label="DNS Failures" colorClass="text-info" />
                <UpstreamStatCard icon={HelpCircle} count={uh.other} label="Other" colorClass="text-panda-muted" />
              </div>

              {uh.top_hosts && uh.top_hosts.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium uppercase tracking-wider text-panda-dim mb-2">Top Failing Hosts</h3>
                  <div className="flex flex-col gap-1.5">
                    {uh.top_hosts.slice(0, 5).map((h) => (
                      <div key={h.host} className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-panda-bg border border-panda-border">
                        <span className="font-mono text-sm text-panda-muted truncate mr-3">{h.host}</span>
                        <span className={`font-mono text-sm font-semibold shrink-0 ${h.count > 50 ? 'text-err' : h.count > 10 ? 'text-warn' : 'text-panda-muted'}`}>{h.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Per-Service Breakdown ──────────────────────────── */}
      {sortedServices.length > 0 && (
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5">
          <div className="mb-4 flex items-center gap-3">
            <ArrowUpDown size={18} className="text-bamboo" />
            <h2 className="text-base font-semibold text-panda-text">Per-Service Breakdown</h2>
          </div>

          <div className="overflow-x-auto rounded-lg border border-panda-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
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
                  <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedServices.map((svc, index) => (
                  <tr
                    key={svc.service}
                    className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                  >
                    <td className="px-5 py-3 text-sm font-medium text-panda-text">
                      {svc.service.charAt(0).toUpperCase() + svc.service.slice(1)}
                    </td>
                    <td className="px-5 py-3 font-mono text-sm text-panda-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {svc.requests.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 font-mono text-sm text-panda-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatBytes(svc.bytes)}
                    </td>
                    <td className={`px-5 py-3 font-mono text-sm font-semibold ${hitRateColor(svc.hit_rate)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {svc.hit_rate.toFixed(1)}%
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block h-5 w-1.5 rounded-full ${hitRateDot(svc.hit_rate)}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Row 5: Recent Errors ──────────────────────────────────── */}
      <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col">
        <div className="mb-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-err" />
          <h2 className="text-base font-semibold text-panda-text">Recent Errors</h2>
          <span className="ml-auto rounded-full px-3 py-1 text-sm bg-panda-elevated text-panda-dim">
            {logStats.recent_errors.length} entries
          </span>
        </div>

        <div className="overflow-auto rounded-lg border border-panda-border" style={{ maxHeight: '400px' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-panda-elevated border-b border-panda-border">
                <th
                  onClick={() => toggleErrorSort('time')}
                  className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim hover:text-panda-text transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    Time <SortArrow sortKey="time" currentKey={errorSortKey} currentDir={errorSortDir} />
                  </span>
                </th>
                <th
                  onClick={() => toggleErrorSort('client_ip')}
                  className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim hover:text-panda-text transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    Client IP <SortArrow sortKey="client_ip" currentKey={errorSortKey} currentDir={errorSortDir} />
                  </span>
                </th>
                <th
                  onClick={() => toggleErrorSort('level')}
                  className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim hover:text-panda-text transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    Level <SortArrow sortKey="level" currentKey={errorSortKey} currentDir={errorSortDir} />
                  </span>
                </th>
                <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Message</th>
              </tr>
            </thead>
            <tbody>
              {sortedErrors.map((err, index) => (
                <tr
                  key={`${err.time}-${index}`}
                  className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                >
                  <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-dim font-mono align-top">
                    {formatTime(err.time)}
                  </td>
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
      </div>

      {/* ── Row 6: No-Slice Events ────────────────────────────────── */}
      <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col">
        <div className="mb-4 flex items-center gap-3">
          <Ban size={18} className="text-warn" />
          <h2 className="text-base font-semibold text-panda-text">No-Slice Events</h2>
          {logStats.noslice_events.length > 0 && (
            <span className="ml-auto rounded-full px-3 py-1 text-sm bg-warn/10 text-warn font-medium">
              {logStats.noslice_events.length} detected
            </span>
          )}
        </div>

        {logStats.noslice_events.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-lg px-5 py-4 text-base bg-bamboo/5 border border-bamboo/20 text-bamboo">
            No slice failures detected
          </div>
        ) : (
          <div className="overflow-auto rounded-lg border border-panda-border" style={{ maxHeight: '350px' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-panda-elevated border-b border-panda-border">
                  <th
                    onClick={() => toggleNosliceSort('time')}
                    className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim hover:text-panda-text transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      Time <SortArrow sortKey="time" currentKey={nosliceSortKey} currentDir={nosliceSortDir} />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleNosliceSort('client_ip')}
                    className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim hover:text-panda-text transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      Client IP <SortArrow sortKey="client_ip" currentKey={nosliceSortKey} currentDir={nosliceSortDir} />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleNosliceSort('host')}
                    className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim hover:text-panda-text transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      Host <SortArrow sortKey="host" currentKey={nosliceSortKey} currentDir={nosliceSortDir} />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleNosliceSort('error')}
                    className="cursor-pointer select-none px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim hover:text-panda-text transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      Error <SortArrow sortKey="error" currentKey={nosliceSortKey} currentDir={nosliceSortDir} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedNoslice.map((event, index) => (
                  <tr
                    key={`${event.host}-${index}`}
                    className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                  >
                    <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-dim font-mono align-top">{formatTime(event.time)}</td>
                    <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-muted font-mono align-top">{event.client_ip || '-'}</td>
                    <td className="px-5 py-3 font-mono text-sm text-bamboo whitespace-nowrap align-top">{event.host}</td>
                    <td className="px-5 py-3 font-mono text-sm text-warn leading-relaxed break-all">
                      <span className="line-clamp-2">{event.error}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>{/* end data area wrapper */}
    </div>
  )
}
