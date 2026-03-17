import { motion } from 'framer-motion'
import {
  PieChart as PieChartIcon,
  Clock,
  TrendingUp,
  AlertCircle,
  Ban,
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
import Card from '../components/Card'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { mockLogStats } from '../lib/mockData'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

function CustomPieTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const entry = payload[0].payload
  return (
    <div className="rounded-lg px-3 py-2 text-sm shadow-xl bg-panda-elevated border border-panda-border text-panda-text">
      <div className="font-semibold" style={{ color: entry.color }}>{entry.name}</div>
      <div className="text-panda-muted">
        {entry.value.toFixed(1)}% &mdash; {entry.count.toLocaleString()} requests
      </div>
    </div>
  )
}

function CustomLineTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-sm shadow-xl bg-panda-elevated border border-panda-border text-panda-text">
      <div className="font-mono text-xs text-panda-dim">{label}</div>
      <div className="font-semibold text-err">
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
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${cls}`}>
      {level}
    </span>
  )
}

function ResponseTimeStat({ label, value, color }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg p-3 bg-panda-bg border border-panda-border">
      <span className="text-xs uppercase tracking-wider font-medium text-panda-dim">{label}</span>
      <span className="font-mono text-xl font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

export default function Logs() {
  const { data: apiLogStats } = usePolling(api.getLogStats, 10000)
  const logStats = apiLogStats ?? mockLogStats
  const totalRequests = logStats.cache_status.reduce((sum, item) => sum + item.count, 0)

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-panda-text">Logs</h1>
        <p className="mt-0.5 text-sm text-panda-dim">
          Operational analytics — upstream performance &amp; error monitoring
        </p>
      </motion.div>

      {/* Top row: Cache status donut + Response times */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Cache Status Distribution */}
        <motion.div variants={itemVariants}>
          <Card className="flex flex-col">
            <div className="mb-3 flex items-center gap-2">
              <PieChartIcon size={15} className="text-bamboo" />
              <h2 className="text-sm font-semibold text-panda-text">Cache Status Distribution</h2>
            </div>

            <div className="relative flex items-center justify-center" style={{ height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={logStats.cache_status}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {logStats.cache_status.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute flex flex-col items-center" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                <span className="font-mono text-lg font-semibold text-panda-text">
                  {(totalRequests / 1000).toFixed(0)}k
                </span>
                <span className="text-xs text-panda-dim">requests</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {logStats.cache_status.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: item.color }} />
                  <span className="text-xs font-mono font-medium text-panda-muted">{item.name}</span>
                  <span className="ml-auto text-xs font-mono text-panda-text">{item.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Response Times */}
        <motion.div variants={itemVariants}>
          <Card className="flex flex-col">
            <div className="mb-3 flex items-center gap-2">
              <Clock size={15} className="text-bamboo" />
              <h2 className="text-sm font-semibold text-panda-text">Upstream Response Times</h2>
            </div>

            <div className="flex flex-col gap-3 flex-1 justify-center">
              <ResponseTimeStat label="Average" value={logStats.response_times.avg} color="#4ade80" />
              <ResponseTimeStat label="P95" value={logStats.response_times.p95} color="#f9a825" />
              <ResponseTimeStat label="P99" value={logStats.response_times.p99} color="#ef5350" />
            </div>

            <p className="mt-3 text-xs text-panda-dim">
              Measured over last 1,000 upstream requests
            </p>
          </Card>
        </motion.div>
      </div>

      {/* Error Rate Chart */}
      <motion.div variants={itemVariants}>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-err" />
            <h2 className="text-sm font-semibold text-panda-text">Error Rate (Last Hour)</h2>
          </div>

          <div style={{ height: '180px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={logStats.error_rate}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef5350" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef5350" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#45454a" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#8a8a8e', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8a8a8e', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomLineTooltip />} cursor={{ stroke: '#45454a', strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="#ef5350"
                  strokeWidth={2}
                  dot={{ fill: '#ef5350', r: 3, strokeWidth: 0 }}
                  activeDot={{ fill: '#ef5350', r: 5, strokeWidth: 2, stroke: '#1c1c1e' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </motion.div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent Errors */}
        <motion.div variants={itemVariants}>
          <Card className="flex flex-col">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle size={15} className="text-err" />
              <h2 className="text-sm font-semibold text-panda-text">Recent Errors</h2>
              <span className="ml-auto rounded-full px-2 py-0.5 text-xs bg-panda-elevated text-panda-dim">
                {logStats.recent_errors.length} entries
              </span>
            </div>

            <div className="overflow-y-auto rounded-lg border border-panda-border" style={{ maxHeight: '240px' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-panda-elevated border-b border-panda-border">
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap text-panda-dim">Time</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Level</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logStats.recent_errors.map((err, index) => (
                    <tr
                      key={`${err.time}-${index}`}
                      className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                    >
                      <td className="px-4 py-2 text-xs whitespace-nowrap text-panda-dim">
                        {err.time.split(' ')[1]}
                      </td>
                      <td className="px-4 py-2"><LevelBadge level={err.level} /></td>
                      <td className="px-4 py-2 font-mono text-xs text-panda-muted max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={err.message}>
                        {err.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* No-Slice Events */}
        <motion.div variants={itemVariants}>
          <Card className="flex flex-col">
            <div className="mb-3 flex items-center gap-2">
              <Ban size={15} className="text-warn" />
              <h2 className="text-sm font-semibold text-panda-text">No-Slice Events</h2>
              {logStats.noslice_events.length > 0 && (
                <span className="ml-auto rounded-full px-2 py-0.5 text-xs bg-warn/10 text-warn">
                  {logStats.noslice_events.length} detected
                </span>
              )}
            </div>

            {logStats.noslice_events.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm bg-bamboo/5 border border-bamboo/20 text-bamboo">
                No slice failures detected
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-panda-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-panda-elevated border-b border-panda-border">
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Host</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logStats.noslice_events.map((event, index) => (
                      <tr
                        key={`${event.host}-${index}`}
                        className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                      >
                        <td className="px-4 py-2 font-mono text-sm text-bamboo">{event.host}</td>
                        <td className="px-4 py-2 font-mono text-xs text-warn max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={event.error}>
                          {event.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
