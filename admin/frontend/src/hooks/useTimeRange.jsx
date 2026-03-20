import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../lib/api'
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
  const [timeRange, setTimeRangeState] = useState(720)
  const [statsCache, setStatsCache] = useState({})
  const [fetchingRange, setFetchingRange] = useState(false)
  const requestIdRef = useRef(0)
  const lastResolvedLogStatsRef = useRef(null)

  // SSE subscription for 30d logstats (shared across all pages)
  const { data: sseLogStats, loading: sseLoading } = useSSE('logstats', api.getLogStats)

  // Active data: live SSE for 30d, cached REST for other ranges, and the last
  // resolved dataset while a newly selected range is still being prepared.
  const rawSelectedLogStats = timeRange === 720
    ? (sseLogStats ?? statsCache[720] ?? null)
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
    setStatsCache(prev => (prev[720] === sseLogStats ? prev : { ...prev, 720: sseLogStats }))
  }, [sseLogStats])

  useEffect(() => {
    if (selectedLogStats) {
      lastResolvedLogStatsRef.current = selectedLogStats
    }
  }, [selectedLogStats])

  const activeLogStats = selectedLogStats ?? lastResolvedLogStatsRef.current
  const showingStaleLogStats = !selectedLogStats && activeLogStats != null
  const logStatsLoading = !selectedLogStats && ((timeRange === 720 && sseLoading) || fetchingRange)

  const setTimeRange = useCallback(async (hours) => {
    setTimeRangeState(hours)
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (hours === 720) {
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
