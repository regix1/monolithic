import { useState, useEffect, useCallback, useRef } from 'react'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws`

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [stats, setStats] = useState(null)
  const [health, setHealth] = useState(null)
  const [logStats, setLogStats] = useState(null)
  const [filesystem, setFilesystem] = useState(null)
  const [noslice, setNoslice] = useState(null)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      console.log('[ws] Connected')
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'stats':
            setStats(msg.data)
            break
          case 'health':
            setHealth(msg.data)
            break
          case 'log_stats':
            setLogStats(msg.data)
            break
          case 'filesystem':
            setFilesystem(msg.data)
            break
          case 'noslice':
            setNoslice(msg.data)
            break
          default:
            break
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      console.log('[ws] Disconnected, reconnecting in 3s...')
      reconnectRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  const send = useCallback((type, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  return { connected, stats, health, logStats, filesystem, noslice, send }
}

// Simpler hook for components that just need one data stream
export function useChannel(channel) {
  const [data, setData] = useState(null)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`${WS_URL}?channel=${channel}`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          setData(msg.data || msg)
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        reconnectRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [channel])

  return data
}
