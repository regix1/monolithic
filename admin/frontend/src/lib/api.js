const BASE = '/api'

async function fetchJson(path) {
  try {
    const res = await fetch(`${BASE}${path}`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } catch {
    return null
  }
}

async function postJson(path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } catch {
    return null
  }
}

async function putJson(path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } catch {
    return null
  }
}

export const api = {
  getHealth: () => fetchJson('/health'),
  getStats: () => fetchJson('/stats'),
  getConfig: () => fetchJson('/config'),
  updateConfig: (vars) => putJson('/config', vars),
  getFilesystem: () => fetchJson('/filesystem'),
  getNginxStatus: () => fetchJson('/nginx/status'),
  reloadNginx: () => postJson('/nginx/reload'),
  getSupervisor: () => fetchJson('/supervisor'),
  getLogErrors: () => fetchJson('/logs/errors'),
  getLogUpstream: () => fetchJson('/logs/upstream'),
  getLogStats: () => fetchJson('/logs/stats'),
  getNoslice: () => fetchJson('/noslice'),
  resetNoslice: () => postJson('/noslice/reset'),
  getDomains: () => fetchJson('/domains'),
}
