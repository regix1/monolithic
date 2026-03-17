import { useState, useEffect, useCallback } from 'react'

/**
 * @template T
 * @param {() => Promise<T>} fetchFn
 * @param {number} [interval]
 * @returns {{ data: T | null, loading: boolean, error: Error | null, refresh: () => Promise<void> }}
 */
export function usePolling(fetchFn, interval = 5000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const result = await fetchFn()
      setData(result)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [fetchFn])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [refresh, interval])

  return { data, loading, error, refresh }
}
