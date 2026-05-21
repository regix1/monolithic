import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Server, Activity, HardDrive, Fingerprint, Shield,
  CheckCircle, AlertTriangle, Copy, Check, Info,
} from 'lucide-react'

import { StatusBadge, AnimatedCounter } from '../components'
import Tooltip from '../components/Tooltip'
import { useSSE } from '../hooks/useSSE'
import { api } from '../lib/api'
import { getGreeting, getHealthMessage } from '../lib/greetings'

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

/**
 * A single row inside the health-warnings banner. Renders the warning's
 * message, a row of service chips when the backend has attributed the
 * warning to specific cache services, and an inline link to Config for the
 * sendfile-mismatch synthetic warning.
 *
 * Each service chip deep-links into `/logs?service=<name>` so the operator
 * can jump straight to the per-service detail without re-typing or scanning.
 *
 * @param {{
 *   warning: {
 *     code: string,
 *     severity: 'warning' | 'critical',
 *     message: string,
 *     services?: { service: string, count: number }[],
 *   },
 *   critical: boolean,
 * }} props
 */
function WarningRow({ warning, critical }) {
  const services = warning.services ?? []
  const textClass = critical ? 'text-err/80' : 'text-warn/80'
  const chipClass = critical
    ? 'border-err/30 bg-err/10 text-err hover:bg-err/20 hover:border-err/50'
    : 'border-warn/30 bg-warn/10 text-warn hover:bg-warn/20 hover:border-warn/50'

  return (
    <li className={`text-sm ${textClass}`}>
      <div className="leading-relaxed">{warning.message}</div>
      {services.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {services.map((s) => (
            <Link
              key={s.service}
              to={`/logs?service=${encodeURIComponent(s.service)}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-mono transition-colors ${chipClass}`}
              title={`View ${s.service} in Logs`}
            >
              <span className="font-semibold">{s.service}</span>
              <span className="opacity-70">{s.count}</span>
            </Link>
          ))}
        </div>
      )}
      {warning.code === 'sendfile_mismatch' && (
        <div className="mt-1.5">
          <Link to="/config" className="text-xs text-info hover:underline">
            → Fix on Config
          </Link>
        </div>
      )}
    </li>
  )
}

export default function Dashboard() {
  const [copied, setCopied] = useState(false)

  const { data: apiHealth, loading: loadingHealth } = useSSE('health', api.getHealth)
  const { data: apiStats, loading: loadingStats } = useSSE('stats', api.getStats)
  const { data: apiFs } = useSSE('filesystem', api.getFilesystem, 60000, 35000)
  const { data: apiNoslice } = useSSE('noslice', api.getNoslice)
  const { data: apiEpic } = useSSE('epic', api.getEpic, 60000, 35000)

  const initialLoading = loadingHealth || loadingStats
  const isLive = apiHealth !== null
  const health = apiHealth ?? { uptime: '', version: '', processes: [] }
  const rawStats = apiStats ?? { nginx: { active_connections: 0, reading: 0, writing: 0, waiting: 0, accepts: 0, handled: 0, requests: 0 }, disk: { path: '', used: '', total: '', free: '', used_bytes: 0, total_bytes: 0, percent: 0 } }
  const { nginx, disk } = rawStats
  const configHash = rawStats.config_hash || ''
  const fs = apiFs ?? { type: '', mount_point: '', device: '', sendfile_current: '', sendfile_recommended: '', mismatch: false, warning: '' }
  const ns = apiNoslice ?? { enabled: false, mode: 'log', blocked_count: 0, blocked_hosts: [], state: {} }
  const httpsLeak = Boolean(apiEpic?.https_leak)
  const httpsHostsCount = apiEpic?.https_hosts?.length ?? 0
  const greeting = getGreeting()
  const allRunning = health.processes.every(p => p.status === 'RUNNING')
  const healthCheck = rawStats.health ?? { status: 'ok', warnings: [], warnings_detailed: [], disk_warning: false, disk_critical: false }
  const baseStatus = !allRunning ? 'warning' : healthCheck.status
  const healthStatus = httpsLeak && baseStatus === 'ok' ? 'warning' : baseStatus
  const stoppedServices = health.processes.filter(p => p.status !== 'RUNNING').map(p => p.name)

  // Structured warnings: prefer the backend's WarningsDetailed (with per-service
  // attribution), fall back to the legacy plain-string Warnings field on older
  // containers. Frontend-only signals (stopped supervisor processes, the Epic
  // HTTPS leak flag from the SSE epic topic) are added on top — those don't
  // come from /api/stats so the backend can't know about them.
  const backendWarnings = (healthCheck.warnings_detailed && healthCheck.warnings_detailed.length > 0)
    ? healthCheck.warnings_detailed
    : (healthCheck.warnings ?? []).map(msg => ({ code: 'legacy', severity: 'warning', message: msg }))

  const frontendWarnings = []
  if (stoppedServices.length > 0) {
    frontendWarnings.push({
      code: 'stopped_services',
      severity: 'critical',
      message: `Services not running: ${stoppedServices.join(', ')}`,
    })
  }
  if (fs.mismatch) {
    frontendWarnings.push({
      code: 'sendfile_mismatch',
      severity: 'warning',
      message: `Sendfile mismatch on ${fs.type || 'this filesystem'} — recommended: sendfile ${fs.sendfile_recommended}.`,
    })
  }
  if (httpsLeak) {
    frontendWarnings.push({
      code: 'https_leak',
      severity: 'warning',
      message: `Epic CDN traffic over HTTPS — ${httpsHostsCount} ${httpsHostsCount === 1 ? 'host' : 'hosts'} bypassing the cache.`,
      services: [{ service: 'epic', count: httpsHostsCount }],
    })
  }

  const healthWarnings = [...frontendWarnings, ...backendWarnings]
  function handleCopy() {
    navigator.clipboard.writeText(configHash).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

      {/* Health warnings banner */}
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
          <ul className="ml-5 sm:ml-7 flex flex-col gap-2.5">
            {healthWarnings.map((w, i) => (
              <WarningRow key={`${w.code}-${i}`} warning={w} critical={healthStatus === 'critical'} />
            ))}
          </ul>
        </div>
      )}

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
                <p className="text-sm text-panda-dim">
                  Uptime: {health.uptime}
                  {rawStats.upstream?.pool_count > 0 && (
                    <> · {rawStats.upstream.pool_count} upstream {rawStats.upstream.pool_count === 1 ? 'pool' : 'pools'}{rawStats.upstream.keepalive_enabled ? ' · keepalive on' : ''}</>
                  )}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              {health.processes.map((proc) => {
                const desc = {
                  'nginx': 'Reverse proxy, cache engine, heartbeat + noslice detection (njs)',
                  'lancache-admin': 'Admin UI backend (also handles log rotation reopen)',
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

      {/* Row 3: Config Hash + No-Slice
         (Filesystem card removed — sendfile mismatch is now surfaced via the
          health banner with a "→ Fix on Config" link. Upstream pool detail
          lives on the Upstream page; its count appears in Service Health's
          subtitle above.) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
