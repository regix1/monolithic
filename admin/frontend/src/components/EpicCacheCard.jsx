import { Gamepad2, CheckCircle, AlertTriangle, Shield, ShieldOff } from 'lucide-react'

/**
 * @typedef {Object} EpicCacheRatio
 * @property {number} total_requests
 * @property {number} hits
 * @property {number} misses
 * @property {number} hit_rate
 */

/**
 * @typedef {Object} EpicHTTPSLeak
 * @property {string} host
 * @property {number} count
 */

/**
 * @typedef {Object} EpicDiagnostic
 * @property {string} window
 * @property {boolean} enabled
 * @property {EpicCacheRatio} cache_ratio
 * @property {boolean} https_leak
 * @property {EpicHTTPSLeak[]} https_hosts
 * @property {string} engine_ini_hint
 * @property {string[]} known_hosts
 */

const FALLBACK_DIAGNOSTIC = Object.freeze({
  window: '24h',
  enabled: false,
  cache_ratio: { total_requests: 0, hits: 0, misses: 0, hit_rate: 0 },
  https_leak: false,
  https_hosts: [],
  engine_ini_hint: '',
  known_hosts: [],
})

/**
 * Tailwind class for the hit-rate accent based on the percentage.
 * @param {number} rate
 * @returns {string}
 */
function hitRateAccent(rate) {
  if (rate >= 80) return 'text-bamboo'
  if (rate >= 50) return 'text-warn'
  return 'text-err'
}

/**
 * Dashboard card showing Epic/Fortnite cache health: hit rate, request counts,
 * HTTPS-leak warning, and an Engine.ini remediation hint when relevant.
 *
 * @param {{ diagnostic: EpicDiagnostic | null }} props
 */
export default function EpicCacheCard({ diagnostic }) {
  const epic = diagnostic ?? FALLBACK_DIAGNOSTIC
  const ratio = epic.cache_ratio ?? FALLBACK_DIAGNOSTIC.cache_ratio
  const httpsLeak = Boolean(epic.https_leak)
  const httpsHosts = epic.https_hosts ?? []
  const accentClass = hitRateAccent(ratio.hit_rate)
  const showHint = Boolean(epic.engine_ini_hint)
  const healthy = !httpsLeak && ratio.total_requests > 0 && ratio.hit_rate >= 80

  return (
    <div className="rounded-xl bg-panda-surface border border-panda-border p-5 flex-1 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
          style={{ backgroundColor: '#a78bfa15', border: '1px solid #a78bfa25' }}
        >
          <Gamepad2 size={18} style={{ color: '#a78bfa' }} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-panda-text">Epic / Fortnite Cache</h3>
          <p className="text-sm text-panda-dim">
            {epic.window} window
            {epic.enabled ? ' · force-noslice on' : ''}
          </p>
        </div>
        <span
          className={`ml-auto text-sm font-medium px-3 py-1 rounded-full ${
            epic.enabled ? 'bg-bamboo/10 text-bamboo' : 'bg-panda-elevated text-panda-dim'
          }`}
        >
          {epic.enabled ? 'Force-Noslice' : 'Auto'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-panda-bg px-4 py-3">
          <p className="text-xs text-panda-dim uppercase tracking-wider mb-1">Hit Rate</p>
          <p className={`text-2xl font-bold font-mono ${accentClass}`}>
            {ratio.hit_rate.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-lg bg-panda-bg px-4 py-3">
          <p className="text-xs text-panda-dim uppercase tracking-wider mb-1">Hits</p>
          <p className="text-2xl font-bold font-mono text-bamboo">
            {ratio.hits.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-panda-bg px-4 py-3">
          <p className="text-xs text-panda-dim uppercase tracking-wider mb-1">Misses</p>
          <p className="text-2xl font-bold font-mono text-warn">
            {ratio.misses.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex-1" />

      {httpsLeak ? (
        <div className="rounded-lg bg-err/5 border border-err/20 px-4 py-3 mb-2 flex items-start gap-2.5">
          <ShieldOff size={16} className="text-err shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-err">Epic over HTTPS detected</p>
            <p className="text-xs text-err/70 mt-0.5">
              {httpsHosts.length}{' '}
              {httpsHosts.length === 1 ? 'CDN host' : 'CDN hosts'} bypassing the cache via SNI
            </p>
            {httpsHosts.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {httpsHosts.slice(0, 3).map((h) => (
                  <li key={h.host} className="flex items-center justify-between gap-3 font-mono text-xs">
                    <span className="text-err/90 truncate">{h.host}</span>
                    <span className="text-err/60 shrink-0">{h.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : ratio.total_requests === 0 ? (
        <div className="rounded-lg bg-panda-bg border border-panda-border px-4 py-3 flex items-center gap-2.5">
          <Shield size={16} className="text-panda-dim" />
          <p className="text-sm text-panda-dim">No Epic traffic in window</p>
        </div>
      ) : healthy ? (
        <div className="rounded-lg bg-bamboo/5 border border-bamboo/20 px-4 py-3 flex items-center gap-2.5">
          <CheckCircle size={16} className="text-bamboo" />
          <p className="text-sm text-bamboo">Epic cache healthy</p>
        </div>
      ) : (
        <div className="rounded-lg bg-warn/5 border border-warn/20 px-4 py-3 flex items-center gap-2.5">
          <AlertTriangle size={16} className="text-warn" />
          <p className="text-sm text-warn">
            Hit rate below 80% &mdash; check Engine.ini or run EpicPrefill
          </p>
        </div>
      )}

      {showHint && (
        <p className="mt-2 text-xs text-panda-dim leading-relaxed">{epic.engine_ini_hint}</p>
      )}
    </div>
  )
}
