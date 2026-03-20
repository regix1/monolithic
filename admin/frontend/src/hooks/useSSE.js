import { useState, useEffect, useRef, useCallback } from 'react'

const SSE_URL = '/api/events'

// Shared SSE connection — all hooks share one EventSource
let sharedSource = null
let subscribers = new Map() // topic -> Set of callbacks
let refCount = 0

function isLoadingPayload(payload) {
  return payload && (payload.status === 'loading' || payload.loading === true)
}

function getSource() {
  if (!sharedSource || sharedSource.readyState === EventSource.CLOSED) {
    sharedSource = new EventSource(SSE_URL)
    sharedSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const callbacks = subscribers.get(msg.topic)
        if (callbacks) {
          callbacks.forEach(cb => cb(msg.data))
        }
      } catch (e) {
        console.error('[SSE] Parse error:', e)
      }
    }
    sharedSource.onerror = () => {
      console.warn('[SSE] Connection lost, will auto-reconnect')
    }
  }
  return sharedSource
}

function subscribe(topic, callback) {
  if (!subscribers.has(topic)) {
    subscribers.set(topic, new Set())
  }
  subscribers.get(topic).add(callback)
  refCount++
  getSource() // ensure connection exists

  return () => {
    const cbs = subscribers.get(topic)
    if (cbs) {
      cbs.delete(callback)
      if (cbs.size === 0) subscribers.delete(topic)
    }
    refCount--
    if (refCount <= 0 && sharedSource) {
      sharedSource.close()
      sharedSource = null
      refCount = 0
    }
  }
}

/**
 * Subscribe to an SSE topic. Returns the same shape as usePolling.
 * Falls back to polling if SSE fails to deliver data within 10 seconds.
 * @param {string} topic - SSE topic name (health, stats, config, filesystem, noslice, logstats, domains)
 * @param {() => Promise} fetchFn - Fallback fetch function from api.js
 * @param {number} [fallbackInterval] - Polling interval if SSE fails (ms)
 */
export function useSSE(topic, fetchFn, fallbackInterval = 30000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const fallbackRef = useRef(null)
  const receivedRef = useRef(false)
  const fetchFnRef = useRef(fetchFn)
  fetchFnRef.current = fetchFn

  const handleData = useCallback((newData) => {
    // A loading sentinel still proves the SSE stream is alive, so suppress the
    // initial 10s polling fallback even though we keep waiting for real data.
    if (isLoadingPayload(newData)) {
      receivedRef.current = true
      if (fallbackRef.current) {
        clearTimeout(fallbackRef.current)
        fallbackRef.current = null
      }
      return
    }
    setData(newData)
    setLoading(false)
    receivedRef.current = true
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current)
      fallbackRef.current = null
    }
  }, [])

  useEffect(() => {
    receivedRef.current = false
    const unsubscribe = subscribe(topic, handleData)
    let cancelled = false

    const stopPolling = () => {
      if (fallbackRef.current) {
        clearTimeout(fallbackRef.current)
        fallbackRef.current = null
      }
    }

    const schedulePoll = (delay) => {
      stopPolling()
      fallbackRef.current = setTimeout(async () => {
        if (cancelled || receivedRef.current) {
          return
        }

        try {
          const result = await fetchFnRef.current()
          if (cancelled || receivedRef.current) {
            return
          }

          if (result == null) {
            schedulePoll(fallbackInterval)
            return
          }

          // Don't treat "loading" responses as valid data — keep retrying
          // quickly until the backend has real data ready.
          if (isLoadingPayload(result)) {
            schedulePoll(3000)
            return
          }

          setData(result)
          setLoading(false)
          receivedRef.current = true
          stopPolling()
        } catch (error) {
          console.warn(`[SSE] Poll for "${topic}" failed:`, error)
          schedulePoll(fallbackInterval)
        }
      }, delay)
    }

    const fallbackTimeout = setTimeout(() => {
      if (!receivedRef.current) {
        console.warn(`[SSE] No data for "${topic}" after 10s, falling back to polling`)
        schedulePoll(0)
      }
    }, 10000)

    return () => {
      cancelled = true
      unsubscribe()
      clearTimeout(fallbackTimeout)
      stopPolling()
    }
  }, [topic, handleData, fallbackInterval])

  return { data, loading }
}
