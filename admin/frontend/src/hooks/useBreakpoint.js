import { useSyncExternalStore } from 'react'

const query = window.matchMedia('(max-width: 1023px)')

const listeners = new Set()

function getSnapshot() {
  return query.matches
}

function subscribe(callback) {
  listeners.add(callback)
  query.addEventListener('change', callback)
  return () => {
    listeners.delete(callback)
    query.removeEventListener('change', callback)
  }
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
