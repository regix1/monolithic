import { useState, useCallback } from 'react'

const STORAGE_KEY = 'lancache-time-format'

/**
 * Returns the current time format preference and a toggle function.
 * Stored in localStorage so it persists across sessions.
 * @returns {{ is24h: boolean, toggle: () => void, formatTime: (ts: string) => string }}
 */
export function useTimeFormat() {
  const [is24h, setIs24h] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === '24h'
    // Auto-detect from browser locale
    const hourCycle = Intl.DateTimeFormat().resolvedOptions().hourCycle
    return hourCycle === 'h23' || hourCycle === 'h24'
  })

  const toggle = useCallback(() => {
    setIs24h(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? '24h' : '12h')
      return next
    })
  }, [])

  const formatTime = useCallback((ts) => {
    if (!ts) return ''
    // ts is "2026-03-17 15:44:30" or similar
    // Parse and reformat
    const date = new Date(ts.replace(' ', 'T'))
    if (isNaN(date.getTime())) return ts // unparseable, return as-is

    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const year = date.getFullYear()

    if (is24h) {
      const hours = String(date.getHours()).padStart(2, '0')
      const mins = String(date.getMinutes()).padStart(2, '0')
      const secs = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${mins}:${secs}`
    } else {
      let hours = date.getHours()
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12 || 12
      const mins = String(date.getMinutes()).padStart(2, '0')
      const secs = String(date.getSeconds()).padStart(2, '0')
      return `${month}/${day}/${year} ${hours}:${mins}:${secs} ${ampm}`
    }
  }, [is24h])

  return { is24h, toggle, formatTime }
}
