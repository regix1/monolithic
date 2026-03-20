import { createContext, useContext, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useSSE } from './useSSE'

const TimeRangeContext = createContext(null)

export function TimeRangeProvider({ children }) {
  const [timeRange, setTimeRangeState] = useState(720)
  const [statsCache, setStatsCache] = useState({})
  const [fetchingRange, setFetchingRange] = useState(false)

  // SSE subscription for 30d logstats (shared across all pages)
  const { data: sseLogStats } = useSSE('logstats', api.getLogStats)

  // Active data: SSE for 30d, cached REST for other ranges (no fallback — show null until correct data arrives)
  const activeLogStats = timeRange === 720 ? sseLogStats : (statsCache[timeRange] ?? null)

  const setTimeRange = useCallback(async (hours) => {
    setTimeRangeState(hours)
    if (hours === 720) return // SSE handles 30d

    // If we already have cached data, it shows immediately (stale-while-revalidate)
    setFetchingRange(true)
    const result = await api.getLogStatsByHours(hours)
    if (result != null) {
      setStatsCache(prev => ({ ...prev, [hours]: result }))
    }
    setFetchingRange(false)
  }, [])

  return (
    <TimeRangeContext.Provider value={{ timeRange, setTimeRange, activeLogStats, fetchingRange }}>
      {children}
    </TimeRangeContext.Provider>
  )
}

export default function useTimeRange() {
  const ctx = useContext(TimeRangeContext)
  if (!ctx) throw new Error('useTimeRange must be used within TimeRangeProvider')
  return ctx
}
