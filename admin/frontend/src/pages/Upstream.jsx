import { useState } from 'react'
import { Network, AlertTriangle, FolderTree, ChevronDown, ChevronRight, Wifi, WifiOff } from 'lucide-react'
import { Card, StatCard } from '../components'
import { useSSE } from '../hooks/useSSE'
import { api } from '../lib/api'
import { TIME_RANGES } from '../lib/constants'

function FallbackStatusBadge({ status }) {
  const map = {
    stale_keepalive: { bg: 'bg-warn/10', text: 'text-warn', label: 'stale_keepalive' },
    fallback_ok: { bg: 'bg-bamboo/10', text: 'text-bamboo', label: 'fallback_ok' },
    upstream_error: { bg: 'bg-warn/10', text: 'text-warn', label: 'upstream_error' },
    fallback: { bg: 'bg-info/10', text: 'text-info', label: 'fallback' },
    dns_timeout: { bg: 'bg-warn/10', text: 'text-warn', label: 'dns_timeout' },
    connect_failed: { bg: 'bg-warn/10', text: 'text-warn', label: 'connect_failed' },
  }
  const style = map[status] ?? { bg: 'bg-info/10', text: 'text-info', label: status }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium font-mono ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function CollapsibleSection({ title, icon: Icon, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl bg-panda-surface border border-panda-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-panda-elevated/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon size={18} className="text-bamboo" />}
          <span className="text-base font-semibold text-panda-text">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {badge}
          {open ? <ChevronDown size={16} className="text-panda-dim" /> : <ChevronRight size={16} className="text-panda-dim" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-panda-border">
          {children}
        </div>
      )}
    </div>
  )
}

function DomainTreeItem({ service, data }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-panda-border last:border-b-0">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-panda-elevated/30 ${expanded ? 'bg-panda-elevated/20' : ''}`}
      >
        {expanded ? (
          <ChevronDown size={14} className="text-bamboo" />
        ) : (
          <ChevronRight size={14} className="text-panda-dim" />
        )}
        <span className="flex-1 font-semibold capitalize text-sm text-panda-text">
          {service}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-sm font-medium bg-bamboo/10 text-bamboo">
          {data.domain_count}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-sm bg-panda-elevated text-panda-dim">
          {data.files.length} {data.files.length === 1 ? 'file' : 'files'}
        </span>
      </button>

      {expanded && (
        <div className="bg-panda-bg">
          {data.files.map((file) => (
            <div
              key={file}
              className="flex items-center gap-3 px-5 sm:px-10 py-2 border-t border-panda-surface"
            >
              <span className="text-panda-border text-sm">└</span>
              <span className="font-mono text-sm text-bamboo truncate">{file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Upstream() {
  const { data: apiStats, loading: loadingStats } = useSSE('stats', api.getStats)
  const { data: apiDomains } = useSSE('domains', api.getDomains, 60000)
  const { data: logStats } = useSSE('logstats', api.getLogStats)
  const loading = loadingStats

  const [selectedHours, setSelectedHours] = useState(720)
  const [fetchingRange, setFetchingRange] = useState(false)
  const [statsCache, setStatsCache] = useState({})

  const apiData = apiStats ? { stats: apiStats, domains: apiDomains } : null

  async function fetchRange(hours) {
    setSelectedHours(hours)
    if (hours === 720) return  // SSE data handles 30d

    // Show cached data immediately, re-fetch in background to refresh
    setFetchingRange(true)
    const [logStatsResult, fallbackResult] = await Promise.all([
      api.getLogStatsByHours(hours),
      api.getLogUpstreamByHours(hours),
    ])
    if (logStatsResult || fallbackResult) {
      setStatsCache((prev) => ({
        ...prev,
        [hours]: { logStats: logStatsResult, fallbackEvents: fallbackResult ?? [] },
      }))
    }
    setFetchingRange(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-panda-text">Upstream</h1>
          <p className="mt-1 text-base text-panda-dim">Loading...</p>
        </div>
      </div>
    )
  }

  const isLive = apiData?.stats?.upstream != null
  const emptyUpstream = { keepalive_enabled: false, pool_count: 0, pools: [], excluded: [], fallback_events: [], domains: {} }
  const upstream = apiData ? {
    keepalive_enabled: apiData.stats?.upstream?.keepalive_enabled ?? false,
    pool_count: apiData.stats?.upstream?.pool_count ?? 0,
    pools: apiData.stats?.upstream?.pools ?? [],
    excluded: apiData.stats?.upstream?.excluded ?? [],
    fallback_events: apiData.stats?.upstream?.fallback_events ?? [],
    domains: apiData.domains ?? {},
  } : emptyUpstream

  // For non-30d ranges: use cached logStats for upstream_health summary, cached fallbackEvents for the events table
  const cachedEntry = selectedHours !== 720 ? statsCache[selectedHours] : null
  const activeFallbackEvents = cachedEntry ? (cachedEntry.fallbackEvents ?? []) : upstream.fallback_events

  // Upstream health summary: use logstats SSE for 30d, cached logStats for filtered ranges
  const activeUpstreamHealth = selectedHours === 720
    ? logStats?.upstream_health ?? null
    : cachedEntry?.logStats?.upstream_health ?? null

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-panda-text">Upstream</h1>
            {!isLive && (
              <span className="text-sm text-warn bg-warn/10 border border-warn/25 px-3 py-1.5 rounded-full">
                Mock Data
              </span>
            )}
          </div>
          <p className="mt-1 text-base text-panda-dim">
            Keepalive connection pools &amp; CDN routing
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0 w-full sm:w-auto">
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
                onClick={() => fetchRange(hours)}
                className={[
                  'px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200',
                  selectedHours === hours
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

      {/* Status row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-panda-surface border border-panda-border rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-panda-dim uppercase tracking-wider mb-2">
            Keepalive
          </p>
          {upstream.keepalive_enabled ? (
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium bg-bamboo/10 text-bamboo">
              <Wifi size={14} />
              Enabled
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium bg-panda-elevated text-panda-dim">
              <WifiOff size={14} />
              Disabled
            </span>
          )}
        </div>

        <StatCard label="Pools" value={upstream.pool_count} />
        <StatCard label="Excluded" value={upstream.excluded.length} />
        <StatCard label="Fallbacks" value={activeFallbackEvents.length} color="#f9a825" />
      </div>

      {/* Upstream Pools — collapsible with scrollable table */}
      <CollapsibleSection
        title="Upstream Pools"
        icon={Network}
        defaultOpen={false}
        badge={
          <span className="rounded-full px-3 py-1 text-sm bg-panda-elevated text-panda-dim">
            {upstream.pools.length} pools
          </span>
        }
      >
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '400px' }}>
          <table className="w-full min-w-[500px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-panda-elevated border-b border-panda-border">
                <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim whitespace-nowrap">Domain</th>
                <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim whitespace-nowrap">Keepalive</th>
                <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim whitespace-nowrap">Timeout</th>
                <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim whitespace-nowrap">Time</th>
              </tr>
            </thead>
            <tbody>
              {upstream.pools.map((pool, index) => (
                <tr
                  key={pool.domain}
                  className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                >
                  <td className="px-5 py-3 font-mono text-sm text-bamboo whitespace-nowrap">{pool.domain}</td>
                  <td className="px-5 py-3 font-mono text-sm text-panda-text whitespace-nowrap">{pool.keepalive}</td>
                  <td className="px-5 py-3 font-mono text-sm text-panda-text whitespace-nowrap">{pool.timeout}</td>
                  <td className="px-5 py-3 font-mono text-sm text-panda-text whitespace-nowrap">{pool.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* Fallback Events — collapsible */}
      <CollapsibleSection
        title="Recent Fallback Events"
        icon={AlertTriangle}
        defaultOpen={activeFallbackEvents.length > 0}
        badge={
          activeFallbackEvents.length > 0 ? (
            <span className="rounded-full px-3 py-1 text-sm bg-warn/10 text-warn font-medium">
              {activeFallbackEvents.length} events
            </span>
          ) : (
            <span className="rounded-full px-3 py-1 text-sm bg-bamboo/10 text-bamboo font-medium">
              healthy
            </span>
          )
        }
      >
        <div className="px-5 py-3 border-b border-panda-border">
          <p className="text-sm text-panda-dim">
            Requests that bypassed the keepalive upstream pool due to 502/504 errors and were retried via direct connection to the CDN.
          </p>
        </div>
        {activeFallbackEvents.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-4 text-sm text-bamboo">
            No fallback events — upstream connections healthy
          </div>
        ) : (
          <div className={`transition-opacity duration-300 ${fetchingRange ? 'opacity-50' : ''}`}>
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '300px' }}>
            <table className="w-full min-w-[500px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-panda-elevated border-b border-panda-border">
                  <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim whitespace-nowrap">Time</th>
                  <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim whitespace-nowrap">Path</th>
                  <th className="px-5 py-3 text-left text-sm font-medium uppercase tracking-wider text-panda-dim whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeFallbackEvents.map((event, index) => (
                  <tr
                    key={`${event.time}-${index}`}
                    className={`border-b border-panda-border table-row-hover ${index % 2 === 0 ? 'bg-panda-surface' : 'bg-panda-elevated'}`}
                  >
                    <td className="px-5 py-3 text-sm text-panda-dim whitespace-nowrap align-top">{event.time}</td>
                    <td className="px-5 py-3 font-mono text-sm text-bamboo leading-relaxed align-top">
                      <span className="break-all block" title={event.host}>{event.host}</span>
                    </td>
                    <td className="px-5 py-3 align-top whitespace-nowrap"><FallbackStatusBadge status={event.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Cache Domains — collapsible with scrollable list */}
      <CollapsibleSection
        title="Cache Domains"
        icon={FolderTree}
        defaultOpen={false}
        badge={
          <span className="rounded-full px-3 py-1 text-sm bg-panda-elevated text-panda-dim">
            {Object.keys(upstream.domains).length} services
          </span>
        }
      >
        <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
          {Object.entries(upstream.domains).map(([service, data]) => (
            <DomainTreeItem key={service} service={service} data={data} />
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}
