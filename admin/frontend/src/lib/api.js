const BASE = '/api'

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[API] GET ${path}:`, res.status, res.statusText, text)
    return null
  }
  return await res.json()
}

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[API] POST ${path}:`, res.status, res.statusText, text)
    return null
  }
  return await res.json()
}

async function putJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[API] PUT ${path}:`, res.status, res.statusText, text)
    return null
  }
  return await res.json()
}

export const api = {
  getHealth: () => fetchJson('/health'),
  getStats: () => fetchJson('/stats'),
  getConfig: () => fetchJson('/config'),
  updateConfig: (vars) => putJson('/config', vars),
  getFilesystem: () => fetchJson('/filesystem'),
  getNginxStatus: () => fetchJson('/nginx/status'),
  reloadNginx: () => postJson('/nginx/reload'),
  applyConfig: () => postJson('/nginx/apply'),
  containerRestart: () => postJson('/container/restart'),
  getSupervisor: () => fetchJson('/supervisor'),

  getLogUpstream: () => fetchJson('/logs/upstream'),
  getLogStats: () => fetchJson('/logs/stats'),
  getNoslice: () => fetchJson('/noslice'),
  resetNoslice: () => postJson('/noslice/reset'),
  getDomains: () => fetchJson('/domains'),
  getLogUpstreamByHours: (hours) => fetchJson('/logs/upstream?hours=' + hours),
  getLogStatsByHours: (hours) => fetchJson('/logs/stats?hours=' + hours),
  getConfigHash: () => fetchJson('/config/confighash'),
  deleteConfigHash: () => fetch(`${BASE}/config/confighash`, { method: 'DELETE' }).then(r => r.ok ? r.json() : null),
}
