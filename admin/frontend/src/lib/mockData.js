export const mockHealth = {
  uptime: '3d 14h 22m',
  version: '3.1.0-fork',
  processes: [
    { name: 'nginx', status: 'RUNNING', pid: 42, uptime: '3d 14h 22m' },
    { name: 'heartbeat', status: 'RUNNING', pid: 88, uptime: '3d 14h 22m' },
    { name: 'log-watcher', status: 'RUNNING', pid: 91, uptime: '3d 14h 22m' },
    { name: 'noslice-detector', status: 'STOPPED', pid: null, uptime: null },
  ]
}

export const mockStats = {
  nginx: {
    active_connections: 47,
    reading: 3,
    writing: 12,
    waiting: 32,
    accepts: 284910,
    handled: 284910,
    requests: 1429384,
  },
  disk: {
    path: '/data/cache',
    used: '487.2 GB',
    total: '1000 GB',
    free: '512.8 GB',
    used_bytes: 523069849600,
    total_bytes: 1073741824000,
    percent: 48.7,
  },
  health: {
    status: 'ok',
    warnings: [],
    disk_warning: false,
    disk_critical: false,
    errors_recent: 0,
    upstream_errors: 0,
  },
}

export const mockFilesystem = {
  type: 'nfs4',
  mount_point: '/data/cache',
  device: '192.168.50.100:/volume1/lancache',
  sendfile_current: 'on',
  sendfile_recommended: 'off',
  mismatch: true,
  warning: 'NFS can serve wrong content with sendfile (nginx ticket #1750)',
}

export const mockConfig = {
  groups: [
    {
      name: 'Cache Settings',
      vars: [
        { key: 'CACHE_DISK_SIZE', value: '1000g', default: '1000g', description: 'Maximum cache disk usage', type: 'text' },
        { key: 'CACHE_INDEX_SIZE', value: '500m', default: '500m', description: 'proxy_cache_path keys_zone memory allocation', type: 'text' },
        { key: 'CACHE_MAX_AGE', value: '3560d', default: '3560d', description: 'Cache entry expiry duration', type: 'text' },
        { key: 'CACHE_SLICE_SIZE', value: '1m', default: '1m', description: 'Nginx slice size for chunked downloads', type: 'text' },
        { key: 'MIN_FREE_DISK', value: '10g', default: '10g', description: 'Minimum free disk before caching stops', type: 'text' },
      ]
    },
    {
      name: 'Network',
      vars: [
        { key: 'UPSTREAM_DNS', value: '8.8.8.8 8.8.4.4', default: '8.8.8.8 8.8.4.4', description: 'DNS resolvers for nginx resolver directives', type: 'text' },
      ]
    },
    {
      name: 'Cache Domains',
      vars: [
        { key: 'CACHE_DOMAINS_REPO', value: 'https://github.com/uklans/cache-domains.git', default: 'https://github.com/uklans/cache-domains.git', description: 'Git URL for cache-domains domain list', type: 'text' },
        { key: 'CACHE_DOMAINS_BRANCH', value: 'master', default: 'master', description: 'Branch of cache-domains repo', type: 'text' },
        { key: 'NOFETCH', value: 'false', default: 'false', description: 'Skip git fetch of cache-domains on startup', type: 'bool' },
      ]
    },
    {
      name: 'Upstream Keepalive',
      vars: [
        { key: 'ENABLE_UPSTREAM_KEEPALIVE', value: 'true', default: 'false', description: 'Enable HTTP/1.1 connection pooling to CDNs', type: 'bool' },
        { key: 'UPSTREAM_KEEPALIVE_CONNECTIONS', value: '16', default: '16', description: 'Idle keepalive connections per upstream pool', type: 'text' },
        { key: 'UPSTREAM_KEEPALIVE_TIMEOUT', value: '4s', default: '4s', description: 'Idle keepalive connection lifetime', type: 'text' },
        { key: 'UPSTREAM_KEEPALIVE_TIME', value: '60s', default: '60s', description: 'Maximum total connection lifetime before recycling', type: 'text' },
        { key: 'UPSTREAM_KEEPALIVE_REQUESTS', value: '10000', default: '10000', description: 'Max requests per keepalive connection', type: 'text' },
        { key: 'UPSTREAM_KEEPALIVE_EXCLUDE', value: '', default: '', description: 'Comma-separated CDN IDs to skip keepalive (e.g. epic,origin)', type: 'text' },
      ]
    },
    {
      name: 'No-Slice Fallback',
      vars: [
        { key: 'NOSLICE_FALLBACK', value: 'false', default: 'false', description: 'Auto-detect CDNs that do not support Range requests', type: 'bool' },
        { key: 'NOSLICE_THRESHOLD', value: '3', default: '3', description: 'Failure count before blocklisting a host', type: 'text' },
        { key: 'DECAY_INTERVAL', value: '86400', default: '86400', description: 'Seconds before noslice failure counts decay by 1', type: 'text' },
      ]
    },
    {
      name: 'Nginx',
      vars: [
        { key: 'NGINX_WORKER_PROCESSES', value: 'auto', default: 'auto', description: 'Number of nginx worker processes', type: 'text' },
        { key: 'NGINX_LOG_FORMAT', value: 'cachelog', default: 'cachelog', description: 'Log format: cachelog (text) or cachelog-json', type: 'select', options: ['cachelog', 'cachelog-json'] },
        { key: 'NGINX_LOG_TO_STDOUT', value: 'false', default: 'false', description: 'Mirror access log to container stdout', type: 'bool' },
        { key: 'NGINX_SENDFILE', value: 'on', default: 'on', description: 'Set to off for btrfs, ZFS, NFS, or CIFS cache volumes', type: 'select', options: ['on', 'off'] },
      ]
    },
    {
      name: 'Timeouts',
      vars: [
        { key: 'NGINX_PROXY_CONNECT_TIMEOUT', value: '300s', default: '300s', description: 'Global upstream TCP connect timeout', type: 'text' },
        { key: 'NGINX_PROXY_READ_TIMEOUT', value: '300s', default: '300s', description: 'Global upstream read timeout', type: 'text' },
        { key: 'NGINX_PROXY_SEND_TIMEOUT', value: '300s', default: '300s', description: 'Global upstream send timeout', type: 'text' },
        { key: 'NGINX_SEND_TIMEOUT', value: '300s', default: '300s', description: 'Global client send timeout', type: 'text' },
      ]
    },
    {
      name: 'Permissions',
      vars: [
        { key: 'PUID', value: '33', default: '33', description: 'Host UID mapped to web user', type: 'text' },
        { key: 'PGID', value: '33', default: '33', description: 'Host GID mapped to web user', type: 'text' },
        { key: 'SKIP_PERMS_CHECK', value: 'false', default: 'false', description: 'Skip ownership check on startup', type: 'bool' },
        { key: 'FORCE_PERMS_CHECK', value: 'false', default: 'false', description: 'Force recursive chown on startup', type: 'bool' },
      ]
    },
    {
      name: 'Logging',
      vars: [
        { key: 'LOGFILE_RETENTION', value: '3560', default: '3560', description: 'Days to retain rotated log files', type: 'text' },
        { key: 'BEAT_TIME', value: '1h', default: '1h', description: 'Heartbeat ping interval', type: 'text' },
        { key: 'SUPERVISORD_LOGLEVEL', value: 'error', default: 'error', description: 'Supervisor log verbosity', type: 'select', options: ['debug', 'info', 'warn', 'error', 'critical'] },
      ]
    },
  ]
}

export const mockUpstream = {
  keepalive_enabled: true,
  pool_count: 142,
  pools: [
    { domain: 'steampipe.akamaized.net', ips: ['23.53.11.15', '23.53.11.16'], keepalive: 16, timeout: '4s', time: '60s' },
    { domain: 'epicgames-download1.akamaized.net', ips: ['104.97.85.167'], keepalive: 16, timeout: '4s', time: '60s' },
    { domain: 'dl.delivery.mp.microsoft.com', ips: ['152.199.4.33', '152.199.4.34'], keepalive: 16, timeout: '4s', time: '60s' },
    { domain: 'gst.prod.dl.playstation.net', ips: ['23.218.96.11'], keepalive: 16, timeout: '4s', time: '60s' },
    { domain: 'xvcf1.xboxlive.com', ips: ['23.3.75.133'], keepalive: 16, timeout: '4s', time: '60s' },
    { domain: 'origin-a.akamaihd.net', ips: ['104.123.55.8', '104.123.55.9'], keepalive: 16, timeout: '4s', time: '60s' },
  ],
  excluded: [],
  fallback_events: [
    { time: '2026-03-16 14:22:01', host: 'steampipe.akamaized.net', status: 'stale_keepalive' },
    { time: '2026-03-16 13:05:44', host: 'epicgames-download1.akamaized.net', status: 'dns_timeout' },
  ],
  domains: {
    steam: { files: ['steam.txt'], domain_count: 24 },
    epicgames: { files: ['epicgames.txt'], domain_count: 8 },
    battlenet: { files: ['blizzard.txt'], domain_count: 12 },
    origin: { files: ['origin.txt', 'ea.txt'], domain_count: 15 },
    riot: { files: ['riot.txt'], domain_count: 6 },
    microsoft: { files: ['wsus.txt', 'xboxlive.txt', 'windowsupdates.txt'], domain_count: 34 },
    sony: { files: ['sony.txt'], domain_count: 4 },
    nintendo: { files: ['nintendo.txt'], domain_count: 3 },
    uplay: { files: ['uplay.txt'], domain_count: 7 },
  }
}

export const mockLogStats = {
  cache_status: [
    { name: 'HIT', value: 72.4, count: 103420, color: '#4ade80' },
    { name: 'MISS', value: 18.1, count: 25870, color: '#60a5fa' },
    { name: 'EXPIRED', value: 4.2, count: 6003, color: '#fbbf24' },
    { name: 'STALE', value: 3.1, count: 4428, color: '#a0a0a0' },
    { name: 'BYPASS', value: 1.8, count: 2573, color: '#f87171' },
    { name: 'UPDATING', value: 0.4, count: 572, color: '#c084fc' },
  ],
  error_rate: [
    { time: '14:00', errors: 2 }, { time: '14:05', errors: 0 }, { time: '14:10', errors: 1 },
    { time: '14:15', errors: 0 }, { time: '14:20', errors: 3 }, { time: '14:25', errors: 0 },
    { time: '14:30', errors: 1 }, { time: '14:35', errors: 0 }, { time: '14:40', errors: 0 },
    { time: '14:45', errors: 2 }, { time: '14:50', errors: 0 }, { time: '14:55', errors: 1 },
  ],
  recent_errors: [
    { time: '2026-03-16 14:52:01', level: 'error', message: 'upstream prematurely closed connection while reading response header from upstream' },
    { time: '2026-03-16 14:45:18', level: 'error', message: 'recv() failed (104: Connection reset by peer)' },
    { time: '2026-03-16 14:22:03', level: 'warn', message: 'an upstream response is buffered to a temporary file /tmp/nginx/proxy_temp/2/01/0000000012' },
    { time: '2026-03-16 13:55:44', level: 'error', message: 'connect() failed (111: Connection refused) while connecting to upstream' },
    { time: '2026-03-16 13:12:09', level: 'error', message: 'upstream timed out (110: Connection timed out) while reading response header' },
  ],
  noslice_events: [
    { time: '2026-03-16 10:33:12', host: 'cdn.example.com', error: 'unexpected status code 200 in slice response' },
  ],
  response_times: { avg: '-', p95: '-', p99: '-' },
  upstream_health: {
    total_errors: 0,
    timeouts: 0,
    conn_refused: 0,
    dns_failures: 0,
    other: 0,
    top_hosts: [],
  },
  fallback_count: 0,
}

export const mockNoslice = {
  enabled: false,
  blocked_count: 0,
  blocked_hosts: [],
  state: {}
}
