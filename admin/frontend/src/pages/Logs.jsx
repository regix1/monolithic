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
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { mockLogStats } from '../lib/mockData'

function CustomPieTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const entry = payload[0].payload
  return (
    <div className="rounded-lg px-4 py-3 text-sm shadow-xl bg-panda-elevated border border-panda-border text-panda-text">
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
    <div className="rounded-lg px-4 py-3 text-sm shadow-xl bg-panda-elevated border border-panda-border text-panda-text">
      <div className="font-mono text-sm text-panda-dim">{label}</div>
      <div className="font-semibold text-base text-err mt-0.5">
        {payload[0].value} {payload[0].value === 1 ? 'error' : 'errors'}
      </div>
    </div>
  )
}

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
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg p-4 bg-panda-bg border border-panda-border">
      <Icon size={18} className={colorClass} />
      <span className={`font-mono text-2xl font-semibold ${colorClass}`}>{count}</span>
      <span className="text-sm text-panda-dim">{label}</span>
    </div>
  )
}

export default function Logs() {
  const { data: apiLogStats } = usePolling(api.getLogStats, 10000)
  const logStats = apiLogStats ?? mockLogStats
  const totalRequests = logStats.cache_status.reduce((sum, item) => sum + item.count, 0)
  const hasErrors = logStats.error_rate.some(b => b.errors > 0)
  const uh = logStats.upstream_health ?? { total_errors: 0, timeouts: 0, conn_refused: 0, dns_failures: 0, other: 0, top_hosts: [] }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-panda-text">Logs</h1>
        <p className="mt-1 text-base text-panda-dim">
          Operational analytics — upstream performance &amp; error monitoring
        </p>
      </div>

      {/* Row 1: Cache status donut + Upstream Health */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 auto-rows-fr">
        {/* Cache Status Distribution */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col">
          <div className="mb-4 flex items-center gap-3">
            <PieChartIcon size={18} className="text-bamboo" />
            <h2 className="text-base font-semibold text-panda-text">Cache Status Distribution</h2>
          </div>

          {logStats.cache_status.length > 0 && totalRequests > 0 ? (
            <>
              <div className="relative flex items-center justify-center" style={{ height: '220px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={logStats.cache_status}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
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
                  <span className="font-mono text-2xl font-semibold text-panda-text">
                    {totalRequests >= 1000 ? `${(totalRequests / 1000).toFixed(0)}k` : totalRequests}
                  </span>
                  <span className="text-sm text-panda-dim">requests</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
                {logStats.cache_status.map((item) => (
                  <div key={item.name} className="flex items-center gap-2.5">
                    <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: item.color }} />
                    <span className="text-sm font-mono font-medium text-panda-muted">{item.name}</span>
                    <span className="ml-auto text-sm font-mono text-panda-text">{item.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </>
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
              {/* Summary line */}
              <p className="text-base text-panda-muted">
                <span className="font-mono text-lg font-semibold text-err">{uh.total_errors}</span>{' '}
                errors in <span className="font-mono text-panda-text">upstream-error.log</span>
              </p>

              {/* 2x2 breakdown grid */}
              <div className="grid grid-cols-2 gap-3">
                <UpstreamStatCard icon={AlertTriangle} count={uh.timeouts} label="Timeouts" colorClass="text-warn" />
                <UpstreamStatCard icon={Wifi} count={uh.conn_refused} label="Conn Refused" colorClass="text-err" />
                <UpstreamStatCard icon={Globe} count={uh.dns_failures} label="DNS Failures" colorClass="text-info" />
                <UpstreamStatCard icon={HelpCircle} count={uh.other} label="Other" colorClass="text-panda-muted" />
              </div>

              {/* Top Failing Hosts */}
              {uh.top_hosts && uh.top_hosts.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium uppercase tracking-wider text-panda-dim mb-2">Top Failing Hosts</h3>
                  <div className="flex flex-col gap-1.5">
                    {uh.top_hosts.slice(0, 5).map((h) => (
                      <div key={h.host} className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-panda-bg border border-panda-border">
                        <span className="font-mono text-sm text-panda-muted truncate mr-3">{h.host}</span>
                        <span className="font-mono text-sm font-semibold text-err flex-shrink-0">{h.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Error Rate Chart */}
      <div className="rounded-xl bg-panda-surface border border-panda-border p-5 outline-none" tabIndex={-1}>
        <div className="mb-4 flex items-center gap-3">
          <TrendingUp size={18} className="text-err" />
          <h2 className="text-base font-semibold text-panda-text">Error Rate (Last Hour)</h2>
        </div>

        {hasErrors ? (
          <div style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={logStats.error_rate}
                margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#45454a" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#8a8a8e', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8a8a8e', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomLineTooltip />} cursor={{ stroke: '#45454a', strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="#ef5350"
                  strokeWidth={2.5}
                  dot={{ fill: '#ef5350', r: 4, strokeWidth: 0 }}
                  activeDot={{ fill: '#ef5350', r: 6, strokeWidth: 2, stroke: '#1c1c1e' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2.5 rounded-lg px-5 py-10 bg-bamboo/5 border border-bamboo/20">
            <CheckCircle size={18} className="text-bamboo" />
            <span className="text-base text-bamboo">No errors in the last hour</span>
          </div>
        )}
      </div>

      {/* Row 3: Recent Errors + No-Slice Events */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Recent Errors */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col">
          <div className="mb-4 flex items-center gap-3">
            <AlertCircle size={18} className="text-err" />
            <h2 className="text-base font-semibold text-panda-text">Recent Errors</h2>
            <span className="ml-auto rounded-full px-3 py-1 text-sm bg-panda-elevated text-panda-dim">
              {logStats.recent_errors.length} entries
            </span>
          </div>

          <div className="overflow-y-auto rounded-lg border border-panda-border" style={{ maxHeight: '320px' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-panda-elevated border-b border-panda-border">
                  <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim">Time</th>
                  <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Level</th>
                  <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Message</th>
                </tr>
              </thead>
              <tbody>
                {logStats.recent_errors.map((err, index) => (
                  <tr
                    key={`${err.time}-${index}`}
                    className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                  >
                    <td className="px-5 py-3 text-sm whitespace-nowrap text-panda-dim font-mono">
                      {err.time}
                    </td>
                    <td className="px-5 py-3"><LevelBadge level={err.level} /></td>
                    <td className="px-5 py-3 font-mono text-sm text-panda-muted max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap" title={err.message}>
                      {err.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* No-Slice Events */}
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
            <div className="overflow-y-auto rounded-lg border border-panda-border" style={{ maxHeight: '320px' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-panda-elevated border-b border-panda-border">
                    <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Host</th>
                    <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logStats.noslice_events.map((event, index) => (
                    <tr
                      key={`${event.host}-${index}`}
                      className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                    >
                      <td className="px-5 py-3 font-mono text-sm text-bamboo whitespace-nowrap">{event.host}</td>
                      <td className="px-5 py-3 font-mono text-sm text-warn max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap" title={event.error}>
                        {event.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
