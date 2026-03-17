import { useState } from 'react'
import { motion } from 'framer-motion'
import { Network, AlertTriangle, FolderTree, ChevronDown, ChevronRight, Wifi, WifiOff } from 'lucide-react'
import { Card, StatCard } from '../components'
import { mockUpstream } from '../lib/mockData'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'

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

function IpBadge({ ip }) {
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-mono bg-panda-elevated text-panda-muted border border-panda-border">
      {ip}
    </span>
  )
}

function FallbackStatusBadge({ status }) {
  const map = {
    stale_keepalive: { bg: 'bg-warn/10', text: 'text-warn', label: 'stale_keepalive' },
    dns_timeout: { bg: 'bg-err/10', text: 'text-err', label: 'dns_timeout' },
    connect_failed: { bg: 'bg-err/10', text: 'text-err', label: 'connect_failed' },
  }
  const style = map[status] ?? { bg: 'bg-info/10', text: 'text-info', label: status }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium font-mono ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function DomainTreeItem({ service, data }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg overflow-hidden border border-panda-border">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${expanded ? 'bg-panda-elevated' : 'bg-panda-surface'}`}
      >
        {expanded ? (
          <ChevronDown size={13} className="text-bamboo" />
        ) : (
          <ChevronRight size={13} className="text-panda-dim" />
        )}
        <FolderTree size={13} className="text-bamboo" />
        <span className="flex-1 font-semibold capitalize text-sm text-panda-text">
          {service}
        </span>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-bamboo/10 text-bamboo">
          {data.domain_count} domains
        </span>
        <span className="rounded-full px-2 py-0.5 text-xs bg-panda-elevated text-panda-dim ml-1">
          {data.files.length} {data.files.length === 1 ? 'file' : 'files'}
        </span>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-panda-bg border-t border-panda-border"
        >
          {data.files.map((file) => (
            <div
              key={file}
              className="flex items-center gap-2.5 px-8 py-2 border-b border-panda-surface last:border-b-0"
            >
              <span className="text-panda-border text-xs">└</span>
              <span className="font-mono text-sm text-bamboo">{file}</span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

async function fetchUpstream() {
  const [stats, domains, noslice] = await Promise.all([
    api.getStats(),
    api.getDomains(),
    api.getNoslice(),
  ])
  if (!stats && !domains) return null
  return { stats, domains, noslice }
}

export default function Upstream() {
  const { data: apiData } = usePolling(fetchUpstream, 10000)
  const isLive = apiData?.stats?.upstream != null
  const upstream = apiData ? {
    ...mockUpstream,
    pool_count: apiData.stats?.upstream?.pool_count ?? mockUpstream.pool_count,
    keepalive_enabled: apiData.stats?.upstream?.keepalive_enabled ?? mockUpstream.keepalive_enabled,
    pools: apiData.stats?.upstream?.pools ?? mockUpstream.pools,
    excluded: apiData.stats?.upstream?.excluded ?? mockUpstream.excluded,
    fallback_events: apiData.stats?.upstream?.fallback_events ?? mockUpstream.fallback_events,
    domains: apiData.domains ?? mockUpstream.domains,
  } : mockUpstream

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-panda-text">Upstream</h1>
          {!isLive && (
            <span className="ml-2 text-xs text-warn bg-warn/10 border border-warn/25 px-2.5 py-1 rounded-full">
              Mock Data
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-panda-dim">
          Keepalive connection pools &amp; CDN routing
        </p>
      </motion.div>

      {/* Status row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <motion.div variants={itemVariants}>
          <Card className="flex flex-col gap-1.5 card-hover">
            <span className="text-xs font-medium uppercase tracking-wider text-panda-dim">
              Keepalive
            </span>
            {upstream.keepalive_enabled ? (
              <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium bg-bamboo/10 text-bamboo">
                <Wifi size={11} />
                Enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium bg-err/10 text-err">
                <WifiOff size={11} />
                Disabled
              </span>
            )}
          </Card>
        </motion.div>

        <StatCard label="Pools" value={upstream.pool_count} />
        <StatCard label="Excluded" value={upstream.excluded.length} />
        <StatCard label="Fallbacks" value={upstream.fallback_events.length} color="#f9a825" />
      </div>

      {/* Upstream Pools Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Network size={15} className="text-bamboo" />
            <h2 className="text-sm font-semibold text-panda-text">Upstream Pools</h2>
            <span className="ml-auto rounded-full px-2 py-0.5 text-xs bg-panda-elevated text-panda-dim">
              {upstream.pools.length} shown
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-panda-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-panda-elevated border-b border-panda-border">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Domain</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Resolved IPs</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Keepalive</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Timeout</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Time</th>
                </tr>
              </thead>
              <tbody>
                {upstream.pools.map((pool, index) => (
                  <tr
                    key={pool.domain}
                    className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                  >
                    <td className="px-4 py-2 font-mono text-sm text-bamboo">{pool.domain}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {pool.ips.map((ip) => <IpBadge key={ip} ip={ip} />)}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-sm text-panda-text">{pool.keepalive}</td>
                    <td className="px-4 py-2 font-mono text-sm text-panda-text">{pool.timeout}</td>
                    <td className="px-4 py-2 font-mono text-sm text-panda-text">{pool.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* Fallback Events */}
      <motion.div variants={itemVariants}>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-warn" />
            <h2 className="text-sm font-semibold text-panda-text">Recent Fallback Events</h2>
          </div>

          {upstream.fallback_events.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm bg-bamboo/5 border border-bamboo/20 text-bamboo">
              No fallback events — upstream connections healthy
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-panda-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-panda-elevated border-b border-panda-border">
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Time</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Host</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-panda-dim">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upstream.fallback_events.map((event, index) => (
                    <tr
                      key={`${event.time}-${event.host}`}
                      className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                    >
                      <td className="px-4 py-2 text-xs text-panda-dim">{event.time}</td>
                      <td className="px-4 py-2 font-mono text-sm text-bamboo">{event.host}</td>
                      <td className="px-4 py-2"><FallbackStatusBadge status={event.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Cache Domains Tree */}
      <motion.div variants={itemVariants}>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <FolderTree size={15} className="text-bamboo" />
            <h2 className="text-sm font-semibold text-panda-text">Cache Domains</h2>
            <span className="ml-auto rounded-full px-2 py-0.5 text-xs bg-panda-elevated text-panda-dim">
              {Object.keys(upstream.domains).length} services
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {Object.entries(upstream.domains).map(([service, data]) => (
              <DomainTreeItem key={service} service={service} data={data} />
            ))}
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}
