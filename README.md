# Monolithic Game Download Cache

![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/monolithic?label=Monolithic) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/lancache-dns?label=Lancache-dns) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/sniproxy?label=Sniproxy) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/generic?label=Generic)

A caching proxy for game downloads. Caches Steam, Epic, Origin, Battle.net, Xbox, PlayStation, Nintendo, and other game/update downloads to serve them locally at LAN speeds.

```bash
docker pull ghcr.io/regix1/monolithic:latest
```

**Docs:** [lancache.net](http://www.lancache.net) | [Monolithic docs](http://lancache.net/docs/containers/monolithic/) | [Support](http://lancache.net/support/)

## Quick Start

```yaml
services:
  monolithic:
    image: ghcr.io/regix1/monolithic:latest
    environment:
      - UPSTREAM_DNS=8.8.8.8
    volumes:
      - ./cache:/data/cache
      - ./logs:/data/logs
    ports:
      - "80:80"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| **Cache Settings** |||
| `CACHE_DISK_SIZE` | `1000g` | Max cache size on disk |
| `CACHE_INDEX_SIZE` | `500m` | Memory for cache index (increase for large caches) |
| `CACHE_MAX_AGE` | `3560d` | How long to keep cached files |
| `CACHE_SLICE_SIZE` | `1m` | Chunk size for partial downloads |
| `MIN_FREE_DISK` | `10g` | Stop caching when free space drops below this |
| **Network** |||
| `UPSTREAM_DNS` | `8.8.8.8 8.8.4.4` | DNS servers for upstream resolution (space-separated) |
| `LANCACHE_IP` | - | IP address(es) clients use to reach the cache |
| **Cache Domains** |||
| `CACHE_DOMAINS_REPO` | `https://github.com/uklans/cache-domains.git` | Repository with domain lists |
| `CACHE_DOMAINS_BRANCH` | `master` | Branch to use |
| `NOFETCH` | `false` | Skip updating cache-domains on startup |
| **Upstream Keepalive** |||
| `ENABLE_UPSTREAM_KEEPALIVE` | `false` | Enable HTTP/1.1 connection pooling to CDNs |
| `UPSTREAM_KEEPALIVE_CONNECTIONS` | `16` | Connections per upstream pool (per worker) |
| `UPSTREAM_KEEPALIVE_TIMEOUT` | `5m` | Idle connection timeout |
| `UPSTREAM_KEEPALIVE_REQUESTS` | `10000` | Max requests per connection |
| `UPSTREAM_REFRESH_INTERVAL` | `1h` | DNS re-resolution interval (0 = disabled) |
| **No-Slice Fallback** |||
| `NOSLICE_FALLBACK` | `false` | Auto-detect servers that don't support Range requests |
| `NOSLICE_THRESHOLD` | `3` | Failures before blocklisting a host |
| `DECAY_INTERVAL` | `86400` | Seconds before failure counts decay |
| **Nginx** |||
| `NGINX_WORKER_PROCESSES` | `auto` | Number of worker processes |
| `NGINX_LOG_FORMAT` | `cachelog` | Log format: `cachelog` or `cachelog-json` |
| `NGINX_LOG_TO_STDOUT` | `false` | Also log to container stdout |
| **Timeouts** |||
| `NGINX_PROXY_CONNECT_TIMEOUT` | `300s` | Upstream connection timeout |
| `NGINX_PROXY_READ_TIMEOUT` | `300s` | Upstream read timeout |
| `NGINX_PROXY_SEND_TIMEOUT` | `300s` | Upstream send timeout |
| `NGINX_SEND_TIMEOUT` | `300s` | Client send timeout |
| **Permissions** |||
| `PUID` | `33` | User ID for cache process |
| `PGID` | `33` | Group ID for cache process |
| `SKIP_PERMS_CHECK` | `false` | Skip permissions check on startup |
| `FORCE_PERMS_CHECK` | `false` | Force full recursive permissions fix |
| **Logging** |||
| `LOGFILE_RETENTION` | `3560` | Days to keep log files |
| `BEAT_TIME` | `1h` | Heartbeat interval in logs |
| `SUPERVISORD_LOGLEVEL` | `error` | Supervisor log level |

## Features

### Upstream Keepalive

Reuses TCP connections to CDN servers instead of opening new ones per request. Speeds up cache-miss downloads significantly.

```yaml
environment:
  - ENABLE_UPSTREAM_KEEPALIVE=true
  - UPSTREAM_DNS=8.8.8.8
```

When enabled:
- Resolves all cache domains at startup using `UPSTREAM_DNS`
- Creates connection pools for each domain
- Re-resolves DNS periodically (default: hourly)
- Falls back to direct proxy for wildcards and unresolvable hosts

### No-Slice Fallback

Some CDN servers don't support HTTP Range requests properly, causing cache failures. This feature detects them automatically.

```yaml
environment:
  - NOSLICE_FALLBACK=true
```

When enabled:
- Monitors error logs for slice failures
- After 3 failures (configurable), blocklists the host
- Blocklisted hosts are cached without byte-range requests
- Blocklist persists across restarts at `/data/noslice-hosts.map`

To reset the blocklist:
```bash
docker exec <container> bash -c 'echo "{}" > /data/noslice-state.json && head -5 /data/noslice-hosts.map > /tmp/map && mv /tmp/map /data/noslice-hosts.map && nginx -s reload'
```

### Custom User/Group

For NFS/SMB shares where permissions matter:

```yaml
environment:
  - PUID=1000
  - PGID=1000
```

Set to `nginx` to use the default nginx user without modification.

## Architecture Support

Supports `linux/amd64` and `linux/arm64`. Docker pulls the correct image automatically.

## Full Example

```yaml
services:
  monolithic:
    image: ghcr.io/regix1/monolithic:latest
    environment:
      - UPSTREAM_DNS=8.8.8.8
      - CACHE_DISK_SIZE=2000g
      - CACHE_INDEX_SIZE=500m
      - ENABLE_UPSTREAM_KEEPALIVE=true
      - NOSLICE_FALLBACK=true
      - PUID=1000
      - PGID=1000
    volumes:
      - /mnt/cache:/data/cache
      - ./logs:/data/logs
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped
```

## Building

```bash
docker build -t monolithic:local .

# Multi-arch
docker buildx build --platform linux/amd64,linux/arm64 -t monolithic:local .
```

## Thanks

- Original configs from [ansible-lanparty](https://github.com/ti-mo/ansible-lanparty)
- [/r/lanparty](https://reddit.com/r/lanparty) community
- UK LAN Techs

## License

MIT License - see source for full text.
