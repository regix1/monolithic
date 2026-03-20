import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { DEFAULT_TIME_RANGE_HOURS, SSE_LOG_STATS_HOURS } from '../lib/constants'
import { useSSE } from './useSSE'

const TimeRangeContext = createContext(null)
const RETRY_DELAY_MS = 3000

function isLoadingPayload(payload) {
  return payload && (payload.status === 'loading' || payload.loading === true)
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function TimeRangeProvider({ children }) {
  const [timeRange, setTimeRangeState] = useState(DEFAULT_TIME_RANGE_HOURS)
  const [statsCache, setStatsCache] = useState({})
  const [fetchingRange, setFetchingRange] = useState(false)
  const requestIdRef = useRef(0)
  const lastResolvedLogStatsRef = useRef(null)

  // SSE subscription for the live 30d logstats stream (kept warm so switching
  // to 30d later is instant even though the UI now defaults to 1h).
  const { data: sseLogStats, loading: sseLoading } = useSSE('logstats', api.getLogStats)

  // Active data: live SSE for 30d, cached REST for other ranges, and the last
  // resolved dataset while a newly selected range is still being prepared.
  const rawSelectedLogStats = timeRange === SSE_LOG_STATS_HOURS
    ? (sseLogStats ?? statsCache[SSE_LOG_STATS_HOURS] ?? null)
    : (statsCache[timeRange] ?? null)
  const selectedLogStats = isLoadingPayload(rawSelectedLogStats) ? null : rawSelectedLogStats

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (!sseLogStats || isLoadingPayload(sseLogStats)) {
      return
    }

    lastResolvedLogStatsRef.current = sseLogStats
    setStatsCache(prev => (
      prev[SSE_LOG_STATS_HOURS] === sseLogStats
        ? prev
        : { ...prev, [SSE_LOG_STATS_HOURS]: sseLogStats }
    ))
  }, [sseLogStats])

  useEffect(() => {
    if (selectedLogStats) {
      lastResolvedLogStatsRef.current = selectedLogStats
    }
  }, [selectedLogStats])

  const activeLogStats = selectedLogStats ?? lastResolvedLogStatsRef.current
  const showingStaleLogStats = !selectedLogStats && activeLogStats != null
  const logStatsLoading = !selectedLogStats && ((timeRange === SSE_LOG_STATS_HOURS && sseLoading) || fetchingRange)

  const loadRange = useCallback(async (hours, requestId) => {
    if (hours === SSE_LOG_STATS_HOURS) {
      setFetchingRange(false)
      return
    }

    setFetchingRange(true)
    try {
      while (requestIdRef.current === requestId) {
        const result = await api.getLogStatsByHours(hours)

        if (requestIdRef.current !== requestId) {
          return
        }

        if (result == null) {
          break
        }

        // The backend may still be precomputing a cold cache for this range.
        // Keep the previous data visible and retry until the real payload lands.
        if (isLoadingPayload(result)) {
          await wait(RETRY_DELAY_MS)
          continue
        }

        setStatsCache(prev => ({ ...prev, [hours]: result }))
        break
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setFetchingRange(false)
      }
    }
  }, [])

  const setTimeRange = useCallback(async (hours) => {
    setTimeRangeState(hours)
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (hours === SSE_LOG_STATS_HOURS || statsCache[hours]) {
      setFetchingRange(false)
      return
    }
    await loadRange(hours, requestId)
  }, [loadRange, statsCache])

  useEffect(() => {
    if (timeRange === SSE_LOG_STATS_HOURS || statsCache[timeRange] || fetchingRange) {
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    void loadRange(timeRange, requestId)
  }, [fetchingRange, loadRange, statsCache, timeRange])

  return (
    <TimeRangeContext.Provider value={{
      timeRange,
      setTimeRange,
      activeLogStats,
      fetchingRange,
      logStatsLoading,
      showingStaleLogStats,
    }}>
      {children}
    </TimeRangeContext.Provider>
  )
}

export default function useTimeRange() {
  const ctx = useContext(TimeRangeContext)
  if (!ctx) throw new Error('useTimeRange must be used within TimeRangeProvider')
  return ctx
}
