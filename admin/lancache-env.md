# LANCache Monolithic — .env Configuration

Updated `.env` for lancache monolithic with all current environment variables.

> **Important:** If your `/mnt/cache` is on NFS, ZFS, btrfs, or CIFS, change `NGINX_SENDFILE=on` to `NGINX_SENDFILE=off` to prevent corrupted downloads.

```env
# =============================================================================
# LANCACHE MONOLITHIC CONFIGURATION
# =============================================================================

# -----------------------------------------------------------------------------
# USER/GROUP CONFIGURATION
# -----------------------------------------------------------------------------
PUID=1006
PGID=1006

# -----------------------------------------------------------------------------
# DNS AND CACHE SETTINGS
# -----------------------------------------------------------------------------
USE_GENERIC_CACHE=true
LANCACHE_IP=172.16.2.98 172.16.2.99 172.16.2.101 172.16.2.102 172.16.2.103 172.16.2.104 172.16.2.105 172.16.2.106 172.16.2.107 172.16.2.108 172.16.2.109 172.16.2.110 172.16.2.111 172.16.2.112 172.16.2.113
DNS_BIND_IP=172.16.2.98
UPSTREAM_DNS=172.16.1.99

# -----------------------------------------------------------------------------
# CACHE CONFIGURATION
# -----------------------------------------------------------------------------
CACHE_DISK_SIZE=4000g
CACHE_INDEX_SIZE=750m
CACHE_MAX_AGE=240d
MIN_FREE_DISK=50g
CACHE_SLICE_SIZE=1m

# Automatic no-slice fallback for servers that don't support Range requests
NOSLICE_FALLBACK=true
NOSLICE_THRESHOLD=2
DECAY_INTERVAL=86400
# Detection strategy: log | response | both
NOSLICE_DETECT_MODE=log
# How often the background detector scans for new error-log entries
NOSLICE_SCAN_INTERVAL=10s
# Comma-separated hosts to blocklist at startup (skips detection)
NOSLICE_STATIC_HOSTS=

# Pre-route the known Epic Games CDN hosts via @noslice (paired with the
# client-side Engine.ini fix in contrib/lancache-epic-fix.ps1)
EPIC_FORCE_NOSLICE=false

# Seconds the entrypoint waits for /data/cache, /data/logs, /data/config to be
# writable before failing. Raise for slow-to-mount cache disks (ZFS, mdadm, NFS).
VOLUME_WAIT_TIMEOUT=120

# -----------------------------------------------------------------------------
# CACHE DOMAINS CONFIGURATION
# -----------------------------------------------------------------------------
CACHE_DOMAINS_REPO=https://github.com/uklans/cache-domains.git
CACHE_DOMAINS_BRANCH=master
NOFETCH=false

# -----------------------------------------------------------------------------
# NGINX CONFIGURATION
# -----------------------------------------------------------------------------
NGINX_WORKER_PROCESSES=auto
NGINX_LOG_FORMAT=cachelog
NGINX_LOG_TO_STDOUT=false
NGINX_SENDFILE=on

# -----------------------------------------------------------------------------
# TIMEOUT CONFIGURATION
# -----------------------------------------------------------------------------
NGINX_PROXY_CONNECT_TIMEOUT=300s
NGINX_PROXY_SEND_TIMEOUT=300s
NGINX_PROXY_READ_TIMEOUT=300s
NGINX_SEND_TIMEOUT=300s

# -----------------------------------------------------------------------------
# UPSTREAM KEEPALIVE (Improves cache-miss speeds significantly)
# -----------------------------------------------------------------------------
ENABLE_UPSTREAM_KEEPALIVE=true
UPSTREAM_KEEPALIVE_CONNECTIONS=32
UPSTREAM_KEEPALIVE_TIMEOUT=4s
UPSTREAM_KEEPALIVE_TIME=60s
UPSTREAM_KEEPALIVE_REQUESTS=10000
UPSTREAM_KEEPALIVE_EXCLUDE=

# -----------------------------------------------------------------------------
# LOGGING CONFIGURATION
# -----------------------------------------------------------------------------
LOGFILE_RETENTION=365
BEAT_TIME=1h
SUPERVISORD_LOGLEVEL=error

# -----------------------------------------------------------------------------
# PERMISSIONS CONFIGURATION
# -----------------------------------------------------------------------------
SKIP_PERMS_CHECK=false
FORCE_PERMS_CHECK=false

# -----------------------------------------------------------------------------
# OTHER SETTINGS
# -----------------------------------------------------------------------------
TZ=America/Chicago

# -----------------------------------------------------------------------------
# DOCKER COMPOSE SETTINGS (not container env variables)
# -----------------------------------------------------------------------------
CACHE_ROOT=/mnt
NETWORK_MODE=host
```

## Changes from previous .env

| Change | Old | New | Reason |
|--------|-----|-----|--------|
| `ENABLE_UPSTREAM_KEEPALIVE` | `false` | `true` | Significant speed improvement for cache misses (~200Mbps → ~1Gbps) |
| `UPSTREAM_KEEPALIVE_TIME` | *(missing)* | `60s` | Max connection lifetime before recycling, prevents stale connections |
| `UPSTREAM_KEEPALIVE_EXCLUDE` | *(missing)* | *(empty)* | Available if specific CDNs cause issues (e.g. `epic,origin`) |
| `DECAY_INTERVAL` | *(missing)* | `86400` | Noslice failure counts decay after 24h, prevents permanent blocklisting |
| `NGINX_SENDFILE` | *(missing)* | `on` | Set to `off` for NFS/ZFS/btrfs/CIFS filesystems |
| `UPSTREAM_REFRESH_INTERVAL` | `1h` | *(removed)* | Not a real container env var |
| `NOSLICE_DETECT_MODE` | *(missing)* | `log` | Where the detector looks for slice failures. `log` scans `error.log`, `response` inspects upstream headers in real time, `both` runs both. |
| `NOSLICE_SCAN_INTERVAL` | *(missing)* | `10s` | Interval between detector passes. Accepts any nginx time literal. |
| `NOSLICE_STATIC_HOSTS` | *(missing)* | *(empty)* | Comma-separated hostnames pre-loaded into the no-slice blocklist at startup. |
| `EPIC_FORCE_NOSLICE` | *(missing)* | `false` | Pre-route known Epic Games CDN hosts via `@noslice` without waiting for the detector to learn them. |
| `VOLUME_WAIT_TIMEOUT` | *(missing)* | `120` | Seconds the entrypoint waits for `/data/cache`, `/data/logs`, and `/data/config` to be writable. Raise on slow-to-mount cache disks. |
