import { useState } from 'react'
import {
  Server, Activity, HardDrive, Database, Fingerprint, Shield,
  CheckCircle, AlertTriangle, Copy, Check, Info, Globe,
} from 'lucide-react'

import { StatusBadge, AnimatedCounter } from '../components'
import Tooltip from '../components/Tooltip'
import { useSSE } from '../hooks/useSSE'
import { api } from '../lib/api'
import { getGreeting, getHealthMessage } from '../lib/greetings'
import { TIME_RANGES } from '../lib/constants'

const NGINX_METRIC_DEFINITIONS = {
  Reading:  'Connections currently being read by nginx. This is an instantaneous gauge — on low-traffic systems it will typically show 0.',
  Writing:  'Active connections sending responses',
  Waiting:  'Idle keepalive connections',
  Requests: 'Total requests since nginx started',
}

function SIcon({ icon: Icon, color = '#4ade80' }) {
  return (
    <div className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
      style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
      <Icon size={18} style={{ color }} />
    </div>
  )
}

export default function Dashboard() {
  const [copied, setCopied] = useState(false)
  const [timeRange, setTimeRange] = useState(720)
  const [statsCache, setStatsCache] = useState({})
  const [fetchingRange, setFetchingRange] = useState(false)

  const { data: apiHealth, loading: loadingHealth } = useSSE('health', api.getHealth)
  const { data: apiStats, loading: loadingStats } = useSSE('stats', api.getStats)
  const { data: apiFs } = useSSE('filesystem', api.getFilesystem, 60000)
  const { data: apiNoslice } = useSSE('noslice', api.getNoslice)
  const { data: sseLogStats } = useSSE('logstats', api.getLogStats)

  const activeLogStats = timeRange === 720 ? sseLogStats : (statsCache[timeRange] ?? null)

  const initialLoading = loadingHealth || loadingStats
  const isLive = apiHealth !== null
  const health = apiHealth ?? { uptime: '', version: '', processes: [] }
  const rawStats = apiStats ?? { nginx: { active_connections: 0, reading: 0, writing: 0, waiting: 0, accepts: 0, handled: 0, requests: 0 }, disk: { path: '', used: '', total: '', free: '', used_bytes: 0, total_bytes: 0, percent: 0 } }
  const { nginx, disk } = rawStats
  const configHash = rawStats.config_hash || ''
  const fs = apiFs ?? { type: '', mount_point: '', device: '', sendfile_current: '', sendfile_recommended: '', mismatch: false, warning: '' }
  const ns = apiNoslice ?? { enabled: false, blocked_count: 0, blocked_hosts: [], state: {} }
  const greeting = getGreeting()
  const allRunning = health.processes.every(p => p.status === 'RUNNING')
  const healthCheck = rawStats.health ?? { status: 'ok', warnings: [], disk_warning: false, disk_critical: false }
  const overallHealthy = healthCheck.status === 'ok' && allRunning
  const healthStatus = !allRunning ? 'warning' : healthCheck.status
  const healthWarnings = healthCheck.warnings || []
  if (!allRunning) {
    const stopped = health.processes.filter(p => p.status !== 'RUNNING').map(p => p.name)
    healthWarnings.unshift(`Services not running: ${stopped.join(', ')}`)
  }
  const recentErrorCount = activeLogStats?.recent_errors?.length ?? 0
  const upstreamErrorCount = activeLogStats?.upstream_health?.total_errors ?? 0
  if (recentErrorCount > 0) healthWarnings.push(`${recentErrorCount} recent error${recentErrorCount === 1 ? '' : 's'} in logs`)
  if (upstreamErrorCount > 0) healthWarnings.push(`${upstreamErrorCount} upstream error${upstreamErrorCount === 1 ? '' : 's'} detected`)

  function handleCopy() {
    navigator.clipboard.writeText(configHash).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleTimeRangeChange(hours) {
    setTimeRange(hours)
    if (hours === 720) return
    if (statsCache[hours]) return
    setFetchingRange(true)
    try {
      const result = await api.getLogStatsByHours(hours)
      setStatsCache(prev => ({ ...prev, [hours]: result }))
    } finally {
      setFetchingRange(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in">
        <div className="shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-panda-text">{greeting.greeting} {greeting.emoji}</h1>
          <p className="text-base text-panda-dim mt-1">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header with greeting */}
      <div className="shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-panda-text">{greeting.greeting} {greeting.emoji}</h1>
          {!isLive && (
            <span className="text-sm text-warn bg-warn/10 border border-warn/25 px-3 py-1.5 rounded-full">
              Mock Data
            </span>
          )}
        </div>
        <p className={`text-base mt-1 ${healthStatus === 'critical' ? 'text-err' : healthStatus === 'warning' ? 'text-warn' : 'text-panda-dim'}`}>
          {getHealthMessage(healthStatus, healthWarnings)}
        </p>
      </div>

      {/* Time range selector for log-based stats */}
      <div className="flex flex-wrap items-center gap-3">
        {fetchingRange && (
          <span className="flex items-center gap-2 text-sm text-panda-dim">
            <span className="h-2 w-2 rounded-full bg-bamboo animate-pulse" />
            Loading...
          </span>
        )}
        <div className="flex flex-wrap rounded-xl bg-panda-elevated/50 border border-panda-border p-1 gap-0.5">
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

      {/* Health warnings banner */}
      <div className={`transition-opacity duration-300 ${fetchingRange ? 'opacity-50' : ''}`}>
      {healthWarnings.length > 0 && (
        <div className={`rounded-xl border px-5 py-4 flex flex-col gap-2 ${
          healthStatus === 'critical'
            ? 'border-err/30 bg-err/10'
            : 'border-warn/30 bg-warn/10'
        }`}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className={healthStatus === 'critical' ? 'text-err' : 'text-warn'} />
            <span className={`text-base font-semibold ${healthStatus === 'critical' ? 'text-err' : 'text-warn'}`}>
              {healthWarnings.length} {healthWarnings.length === 1 ? 'issue' : 'issues'} detected
            </span>
          </div>
          <ul className="ml-5 sm:ml-7 flex flex-col gap-1">
            {healthWarnings.map((w, i) => (
              <li key={i} className={`text-sm ${healthStatus === 'critical' ? 'text-err/80' : 'text-warn/80'}`}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>

      {/* Row 1: Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Active connections — hero */}
        <div className="col-span-full lg:col-span-2 rounded-xl bg-panda-surface border border-panda-border p-5 flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-bamboo/10 flex items-center justify-center shrink-0">
            <Activity size={28} className="text-bamboo" />
          </div>
          <div>
            <AnimatedCounter value={nginx.active_connections} className="text-4xl font-bold text-bamboo leading-none font-mono" />
            <p className="text-sm uppercase tracking-wider text-panda-dim mt-1.5">Active Connections</p>
          </div>
        </div>
        {/* Reading */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-sm uppercase tracking-wider text-panda-dim">Reading</p>
            <Tooltip content={NGINX_METRIC_DEFINITIONS.Reading} position="top">
                <Info size={12} className="text-panda-dim/50 shrink-0 cursor-help" />
              </Tooltip>
          </div>
          <p className="text-3xl font-bold text-info font-mono">{nginx.reading}</p>
        </div>
        {/* Writing */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-sm uppercase tracking-wider text-panda-dim">Writing</p>
            <Tooltip content={NGINX_METRIC_DEFINITIONS.Writing} position="top">
                <Info size={12} className="text-panda-dim/50 shrink-0 cursor-help" />
              </Tooltip>
          </div>
          <p className="text-3xl font-bold text-bamboo font-mono">{nginx.writing}</p>
        </div>
        {/* Waiting */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-sm uppercase tracking-wider text-panda-dim">Waiting</p>
            <Tooltip content={NGINX_METRIC_DEFINITIONS.Waiting} position="top">
                <Info size={12} className="text-panda-dim/50 shrink-0 cursor-help" />
              </Tooltip>
          </div>
          <p className="text-3xl font-bold text-panda-muted font-mono">{nginx.waiting}</p>
        </div>
        {/* Requests */}
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-sm uppercase tracking-wider text-panda-dim">Requests</p>
            <Tooltip content={NGINX_METRIC_DEFINITIONS.Requests} position="top">
                <Info size={12} className="text-panda-dim/50 shrink-0 cursor-help" />
              </Tooltip>
          </div>
          <p className="text-xl font-bold text-panda-text font-mono">{nginx.requests.toLocaleString()}</p>
        </div>
      </div>

      {/* Row 2: Service Health + Cache Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Service Health */}
        <div className="lg:col-span-3 flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <SIcon icon={Server} />
              <div>
                <h3 className="text-base font-semibold text-panda-text">Service Health</h3>
                <p className="text-sm text-panda-dim">Uptime: {health.uptime}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              {health.processes.map((proc) => {
                const desc = {
                  'nginx': 'Reverse proxy & cache engine',
                  'heartbeat': 'Health check ping service',
                  'log-watcher': 'Log rotation monitor',
                  'noslice-detector': 'Slice error auto-detection',
                  'lancache-admin': 'Admin UI backend',
                }[proc.name] || ''

                return (
                  <div key={proc.name}
                    className="flex items-center justify-between rounded-lg bg-panda-bg px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${proc.status === 'RUNNING' ? 'bg-bamboo breathe-green' : 'bg-err breathe-red'}`} />
                      <div>
                        <p className="text-base font-medium text-panda-text font-mono">{proc.name}</p>
                        <p className="text-xs text-panda-dim leading-snug">{desc}</p>
                        <p className="text-sm text-panda-muted mt-0.5">
                          {proc.pid ? `PID ${proc.pid}` : proc.status === 'RUNNING' ? 'running' : 'not running'}
                          {proc.uptime ? ` · ${proc.uptime}` : ''}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={proc.status === 'RUNNING' ? 'running' : 'stopped'} label={proc.status} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Cache Volume */}
        <div className="lg:col-span-2 flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <SIcon icon={HardDrive} />
              <h3 className="text-base font-semibold text-panda-text">Cache Volume</h3>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <div className="text-center mb-4">
                <AnimatedCounter value={disk.percent} decimals={1} suffix="%" className={`text-5xl font-bold leading-none font-mono ${healthCheck.disk_critical ? 'text-err' : healthCheck.disk_warning ? 'text-warn' : 'text-bamboo'}`} />
                <p className="text-sm text-panda-dim uppercase tracking-wider mt-2">Capacity Used</p>
              </div>

              <div className="h-4 w-full rounded-full bg-panda-bg overflow-hidden mb-3">
                <div className={`h-full rounded-full transition-all duration-700 ${healthCheck.disk_critical ? 'bg-err' : healthCheck.disk_warning ? 'bg-warn' : 'wave-progress'}`}
                  style={{ width: `${disk.percent}%` }} />
              </div>

              <div className="flex justify-between text-sm mb-4">
                <span className={`font-medium ${healthCheck.disk_critical ? 'text-err' : healthCheck.disk_warning ? 'text-warn' : 'text-bamboo'}`}>{disk.used} used</span>
                <span className="text-panda-dim">{disk.total} total</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-panda-bg px-4 py-3">
                  <p className="text-sm text-panda-dim mb-1">Free Space</p>
                  <p className={`text-lg font-bold font-mono ${healthCheck.disk_critical ? 'text-err' : healthCheck.disk_warning ? 'text-warn' : 'text-bamboo'}`}>{disk.free}</p>
                </div>
                <div className="rounded-lg bg-panda-bg px-4 py-3">
                  <p className="text-sm text-panda-dim mb-1">Mount Path</p>
                  <p className="text-base font-medium text-panda-muted font-mono truncate">{disk.path}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2b: Upstream Services */}
      {rawStats.upstream && rawStats.upstream.pools && (
        <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <SIcon icon={Globe} />
            <div>
              <h3 className="text-base font-semibold text-panda-text">Upstream Services</h3>
              <p className="text-sm text-panda-dim">
                {rawStats.upstream.pool_count} {rawStats.upstream.pool_count === 1 ? 'pool' : 'pools'}
                {rawStats.upstream.keepalive_enabled ? ' · keepalive enabled' : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            {rawStats.upstream.pools.map((pool) => {
              return (
                <div key={pool.domain}
                  className="flex items-center justify-between rounded-lg bg-panda-bg px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-bamboo breathe-green" />
                    <div>
                      <p className="text-base font-medium text-panda-text font-mono">{pool.domain}</p>
                      <p className="text-xs text-panda-dim leading-snug">configured upstream</p>
                      <p className="text-sm text-panda-muted mt-0.5">
                        {pool.keepalive ? `keepalive ${pool.keepalive}` : ''}
                        {pool.keepalive && pool.timeout ? ' · ' : ''}
                        {pool.timeout ? `timeout ${pool.timeout}` : ''}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status="running" label="CONFIGURED" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Row 3: Filesystem + Config Hash + Noslice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Filesystem */}
        <div className="flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <SIcon icon={Database} />
              <h3 className="text-base font-semibold text-panda-text">Filesystem</h3>
            </div>

            <div className="text-center mb-4">
              <p className="text-3xl font-bold text-panda-text font-mono">{fs.type}</p>
              <p className="text-sm text-panda-dim mt-1">{fs.mount_point}</p>
            </div>

            {fs.mismatch ? (
              <div className="rounded-lg bg-warn/5 border border-warn/20 px-4 py-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle size={16} className="text-warn shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-warn">Sendfile Mismatch</p>
                    <p className="text-sm text-warn/70">
                      Recommend: <span className="font-mono">sendfile {fs.sendfile_recommended}</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-bamboo/5 border border-bamboo/20 px-4 py-3 mb-4 flex items-center gap-2.5">
                <CheckCircle size={16} className="text-bamboo" />
                <p className="text-sm text-bamboo">Configuration optimal</p>
              </div>
            )}

            <div className="flex-1" />

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-panda-bg px-4 py-3">
                <p className="text-sm text-panda-dim mb-1">Current</p>
                <p className={`text-lg font-bold font-mono ${fs.mismatch ? 'text-warn' : 'text-bamboo'}`}>
                  {fs.sendfile_current}
                </p>
              </div>
              <div className="rounded-lg bg-panda-bg px-4 py-3">
                <p className="text-sm text-panda-dim mb-1">Recommended</p>
                <p className="text-lg font-bold text-bamboo font-mono">{fs.sendfile_recommended}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Config Hash */}
        <div className="flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <SIcon icon={Fingerprint} />
              <h3 className="text-base font-semibold text-panda-text">Config Hash</h3>
            </div>

            <div className="rounded-lg bg-panda-bg px-4 py-3 flex items-center justify-between gap-3 mb-4">
              <span className="text-sm text-panda-muted truncate font-mono">{configHash || 'unavailable'}</span>
              <button onClick={handleCopy}
                className="shrink-0 rounded-md p-2 text-panda-dim hover:text-bamboo hover:bg-panda-surface transition-colors">
                {copied ? <Check size={16} className="text-bamboo" /> : <Copy size={16} />}
              </button>
            </div>

            <div className="flex-1" />

            {configHash ? (
              <div className="rounded-lg bg-bamboo/5 border border-bamboo/20 px-4 py-3 flex items-center gap-2.5">
                <CheckCircle size={16} className="text-bamboo" />
                <p className="text-sm text-bamboo">Configuration consistent</p>
              </div>
            ) : (
              <div className="rounded-lg bg-panda-bg border border-panda-border px-4 py-3 flex items-center gap-2.5">
                <AlertTriangle size={16} className="text-panda-dim" />
                <p className="text-sm text-panda-dim">Hash unavailable</p>
              </div>
            )}
          </div>
        </div>

        {/* Noslice */}
        <div className="flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <SIcon icon={Shield} />
              <h3 className="text-base font-semibold text-panda-text">No-Slice</h3>
              <span className={`ml-auto text-sm font-medium px-3 py-1 rounded-full ${
                ns.enabled ? 'bg-bamboo/10 text-bamboo' : 'bg-panda-elevated text-panda-dim'
              }`}>
                {ns.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="rounded-lg bg-panda-bg px-4 py-3.5 flex items-center justify-between mb-4">
              <span className="text-sm text-panda-dim uppercase tracking-wider">Blocked Hosts</span>
              <span className="text-2xl font-bold text-panda-text font-mono">{ns.blocked_count}</span>
            </div>

            <div className="flex-1" />

            {ns.blocked_hosts.length > 0 ? (
              <div className="space-y-2">
                {ns.blocked_hosts.map((host) => (
                  <div key={host} className="rounded-md bg-err/5 border border-err/15 px-4 py-2.5">
                    <span className="text-sm text-err font-mono">{host}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-bamboo/5 border border-bamboo/20 px-4 py-3 flex items-center gap-2.5">
                <CheckCircle size={16} className="text-bamboo" />
                <p className="text-sm text-bamboo">No hosts blocked</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
