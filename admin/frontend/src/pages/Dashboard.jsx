import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Server, Activity, HardDrive, Database, Fingerprint, Shield,
  CheckCircle, AlertTriangle, Copy, Check,
} from 'lucide-react'
import { StatusBadge, AnimatedCounter } from '../components'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import {
  mockHealth, mockStats, mockFilesystem, mockNoslice,
} from '../lib/mockData'
import { getGreeting, getHealthMessage } from '../lib/greetings'

const CONFIGHASH = 'a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5'

const stagger = {
  hidden: { opacity: 0, y: 10 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.25, ease: 'easeOut' } }),
}
function S({ i, children, className = '' }) {
  return (
    <motion.div custom={i} initial="hidden" animate="show" variants={stagger} className={className}>
      {children}
    </motion.div>
  )
}

function SIcon({ icon: Icon, color = '#4ade80' }) {
  return (
    <div className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
      style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
      <Icon size={14} style={{ color }} />
    </div>
  )
}

export default function Dashboard() {
  const [copied, setCopied] = useState(false)

  const { data: apiHealth } = usePolling(api.getHealth, 10000)
  const { data: apiStats } = usePolling(api.getStats, 5000)
  const { data: apiFs } = usePolling(api.getFilesystem, 30000)
  const { data: apiNoslice } = usePolling(api.getNoslice, 10000)

  const health = apiHealth ?? mockHealth
  const rawStats = apiStats ?? mockStats
  const { nginx, disk } = rawStats
  const fs = apiFs ?? mockFilesystem
  const ns = apiNoslice ?? mockNoslice
  const greeting = getGreeting()
  const allRunning = health.processes.every(p => p.status === 'RUNNING')

  function handleCopy() {
    navigator.clipboard.writeText(CONFIGHASH).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with greeting */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="shrink-0">
        <h1 className="text-2xl font-bold text-panda-text">{greeting.greeting} {greeting.emoji}</h1>
        <p className="text-sm text-panda-dim mt-0.5">{getHealthMessage(allRunning)}</p>
      </motion.div>

      {/* Row 1: Quick stats */}
      <S i={0}>
        <div className="grid grid-cols-6 gap-3">
          {/* Active connections — hero */}
          <div className="col-span-2 rounded-xl bg-panda-surface border border-panda-border p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-bamboo/10 flex items-center justify-center shrink-0">
              <Activity size={22} className="text-bamboo" />
            </div>
            <div>
              <AnimatedCounter value={nginx.active_connections} className="text-3xl font-bold text-bamboo leading-none font-mono" />
              <p className="text-xs uppercase tracking-wider text-panda-dim mt-1">Active Connections</p>
            </div>
          </div>
          {/* Reading */}
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex flex-col justify-center">
            <p className="text-xs uppercase tracking-wider text-panda-dim mb-1">Reading</p>
            <p className="text-xl font-bold text-info font-mono">{nginx.reading}</p>
          </div>
          {/* Writing */}
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex flex-col justify-center">
            <p className="text-xs uppercase tracking-wider text-panda-dim mb-1">Writing</p>
            <p className="text-xl font-bold text-bamboo font-mono">{nginx.writing}</p>
          </div>
          {/* Waiting */}
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex flex-col justify-center">
            <p className="text-xs uppercase tracking-wider text-panda-dim mb-1">Waiting</p>
            <p className="text-xl font-bold text-panda-muted font-mono">{nginx.waiting}</p>
          </div>
          {/* Requests */}
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex flex-col justify-center">
            <p className="text-xs uppercase tracking-wider text-panda-dim mb-1">Requests</p>
            <p className="text-base font-bold text-panda-text font-mono">{nginx.requests.toLocaleString()}</p>
          </div>
        </div>
      </S>

      {/* Row 2: Service Health + Cache Volume */}
      <div className="grid grid-cols-5 gap-4">
        {/* Service Health */}
        <S i={1} className="col-span-3 flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex-1 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <SIcon icon={Server} />
              <div>
                <h3 className="text-sm font-semibold text-panda-text">Service Health</h3>
                <p className="text-xs text-panda-dim">Uptime: {health.uptime}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 flex-1">
              {health.processes.map((proc) => (
                <div key={proc.name}
                  className="flex items-center justify-between rounded-lg bg-panda-bg px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${proc.status === 'RUNNING' ? 'bg-bamboo breathe-green' : 'bg-err breathe-red'}`} />
                    <div>
                      <p className="text-sm font-medium text-panda-text font-mono">{proc.name}</p>
                      <p className="text-xs text-panda-dim">
                        {proc.pid ? `PID ${proc.pid}` : 'not running'}
                        {proc.uptime ? ` · ${proc.uptime}` : ''}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={proc.status === 'RUNNING' ? 'running' : 'stopped'} label={proc.status} />
                </div>
              ))}
            </div>
          </div>
        </S>

        {/* Cache Volume */}
        <S i={2} className="col-span-2 flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex-1 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <SIcon icon={HardDrive} />
              <h3 className="text-sm font-semibold text-panda-text">Cache Volume</h3>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <div className="text-center mb-3">
                <AnimatedCounter value={disk.percent} decimals={1} suffix="%" className="text-4xl font-bold text-bamboo leading-none font-mono" />
                <p className="text-xs text-panda-dim uppercase tracking-wider mt-1">Capacity Used</p>
              </div>

              <div className="h-3 w-full rounded-full bg-panda-bg overflow-hidden mb-2">
                <div className="h-full rounded-full wave-progress transition-all duration-700"
                  style={{ width: `${disk.percent}%` }} />
              </div>

              <div className="flex justify-between text-xs mb-3">
                <span className="text-bamboo font-medium">{disk.used} used</span>
                <span className="text-panda-dim">{disk.total} total</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-panda-bg px-3 py-2">
                  <p className="text-xs text-panda-dim mb-0.5">Free Space</p>
                  <p className="text-base font-bold text-bamboo font-mono">{disk.free}</p>
                </div>
                <div className="rounded-lg bg-panda-bg px-3 py-2">
                  <p className="text-xs text-panda-dim mb-0.5">Mount Path</p>
                  <p className="text-sm font-medium text-panda-muted font-mono truncate">{disk.path}</p>
                </div>
              </div>
            </div>
          </div>
        </S>
      </div>

      {/* Row 3: Filesystem + Config Hash + Noslice */}
      <div className="grid grid-cols-3 gap-4">
        {/* Filesystem */}
        <S i={3} className="flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex-1 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <SIcon icon={Database} />
              <h3 className="text-sm font-semibold text-panda-text">Filesystem</h3>
            </div>

            <div className="text-center mb-3">
              <p className="text-2xl font-bold text-panda-text font-mono">{fs.type}</p>
              <p className="text-xs text-panda-dim">{fs.mount_point}</p>
            </div>

            {fs.mismatch ? (
              <div className="rounded-lg bg-warn/5 border border-warn/20 px-3 py-2 mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={13} className="text-warn shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-warn">Sendfile Mismatch</p>
                    <p className="text-xs text-warn/70">
                      Recommend: <span className="font-mono">sendfile {fs.sendfile_recommended}</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-bamboo/5 border border-bamboo/20 px-3 py-2 mb-3 flex items-center gap-2">
                <CheckCircle size={13} className="text-bamboo" />
                <p className="text-xs text-bamboo">Configuration optimal</p>
              </div>
            )}

            <div className="flex-1" />

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-panda-bg px-3 py-2">
                <p className="text-xs text-panda-dim mb-0.5">Current</p>
                <p className={`text-base font-bold font-mono ${fs.mismatch ? 'text-warn' : 'text-bamboo'}`}>
                  {fs.sendfile_current}
                </p>
              </div>
              <div className="rounded-lg bg-panda-bg px-3 py-2">
                <p className="text-xs text-panda-dim mb-0.5">Recommended</p>
                <p className="text-base font-bold text-bamboo font-mono">{fs.sendfile_recommended}</p>
              </div>
            </div>
          </div>
        </S>

        {/* Config Hash */}
        <S i={4} className="flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex-1 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <SIcon icon={Fingerprint} />
              <h3 className="text-sm font-semibold text-panda-text">Config Hash</h3>
            </div>

            <div className="rounded-lg bg-panda-bg px-3 py-2.5 flex items-center justify-between gap-2 mb-3">
              <span className="text-xs text-panda-muted truncate font-mono">{CONFIGHASH}</span>
              <button onClick={handleCopy}
                className="shrink-0 rounded-md p-1.5 text-panda-dim hover:text-bamboo hover:bg-panda-surface transition-colors">
                {copied ? <Check size={13} className="text-bamboo" /> : <Copy size={13} />}
              </button>
            </div>

            <div className="flex-1" />

            <div className="rounded-lg bg-bamboo/5 border border-bamboo/20 px-3 py-2.5 flex items-center gap-2">
              <CheckCircle size={13} className="text-bamboo" />
              <p className="text-xs text-bamboo">Configuration consistent</p>
            </div>
          </div>
        </S>

        {/* Noslice */}
        <S i={5} className="flex">
          <div className="rounded-xl bg-panda-surface border border-panda-border p-4 flex-1 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <SIcon icon={Shield} />
              <h3 className="text-sm font-semibold text-panda-text">No-Slice</h3>
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                ns.enabled ? 'bg-bamboo/10 text-bamboo' : 'bg-err/10 text-err'
              }`}>
                {ns.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="rounded-lg bg-panda-bg px-3 py-2.5 flex items-center justify-between mb-3">
              <span className="text-xs text-panda-dim uppercase tracking-wider">Blocked Hosts</span>
              <span className="text-xl font-bold text-panda-text font-mono">{ns.blocked_count}</span>
            </div>

            <div className="flex-1" />

            {ns.blocked_hosts.length > 0 ? (
              <div className="space-y-1.5">
                {ns.blocked_hosts.map((host) => (
                  <div key={host} className="rounded-md bg-err/5 border border-err/15 px-3 py-2">
                    <span className="text-xs text-err font-mono">{host}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-bamboo/5 border border-bamboo/20 px-3 py-2.5 flex items-center gap-2">
                <CheckCircle size={13} className="text-bamboo" />
                <p className="text-xs text-bamboo">No hosts blocked</p>
              </div>
            )}
          </div>
        </S>
      </div>
    </div>
  )
}
