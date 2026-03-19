import { useSyncExternalStore, useCallback } from 'react'

const STORAGE_KEY = 'lancache-time-format'

const listeners = new Set()

function getInitialValue() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) return stored === '24h'
  const hourCycle = Intl.DateTimeFormat().resolvedOptions().hourCycle
  return hourCycle === 'h23' || hourCycle === 'h24'
}

let snapshot = getInitialValue()

function getSnapshot() {
  return snapshot
}

function subscribe(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function setIs24h(value) {
  snapshot = value
  localStorage.setItem(STORAGE_KEY, value ? '24h' : '12h')
  emitChange()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      snapshot = e.newValue === '24h'
      emitChange()
    }
  })
}

export function useTimeFormat() {
  const is24h = useSyncExternalStore(subscribe, getSnapshot)

  const toggle = useCallback(() => {
    setIs24h(!getSnapshot())
  }, [])

  const formatTime = useCallback((ts) => {
    if (!ts) return ''
    const date = new Date(ts.replace(' ', 'T'))
    if (isNaN(date.getTime())) return ts

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
