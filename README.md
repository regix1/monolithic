# Monolithic Game Download Cache

![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/monolithic?label=Monolithic) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/lancache-dns?label=Lancache-dns) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/sniproxy?label=Sniproxy) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/generic?label=Generic)

A high-performance caching proxy for game downloads. Caches content from Steam, Epic Games, Origin, Battle.net, Riot, Xbox, PlayStation, Nintendo, Uplay, and many other platforms to serve subsequent downloads at LAN speeds.

> [!NOTE]
> **Recommended image:**
>
> ```bash
> docker pull ghcr.io/regix1/monolithic:latest
> ```

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
    restart: unless-stopped
```

Point your DNS at [lancache-dns](https://github.com/lancachenet/lancache-dns) or configure your router to redirect game CDN domains to the cache IP.

---

## Environment Variables

### Cache Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_DISK_SIZE` | `1000g` | Maximum size of the cache on disk. Set slightly below your actual disk size. |
| `CACHE_INDEX_SIZE` | `500m` | Memory allocated for the cache index. Increase for caches over 1TB (1g per 1TB recommended). |
| `CACHE_MAX_AGE` | `3560d` | How long cached content is kept before expiring (~10 years default). |
| `CACHE_SLICE_SIZE` | `1m` | Size of chunks for partial/resumable downloads. 1m is recommended - works with all CDNs and enables fast resume. Combined with `NOSLICE_FALLBACK`, problematic servers are handled automatically. |
| `MIN_FREE_DISK` | `10g` | Stops caching new content when free disk space drops below this threshold. |

---

### Network

| Variable | Default | Description |
|----------|---------|-------------|
| `UPSTREAM_DNS` | `8.8.8.8 8.8.4.4` | DNS server(s) for resolving CDN hostnames. Space-separated for multiple servers. |
| `LANCACHE_IP` | - | IP address(es) where clients reach the cache. Used by lancache-dns. |

---

### Cache Domains

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_DOMAINS_REPO` | `https://github.com/uklans/cache-domains.git` | Git repository containing the list of domains to cache. |
| `CACHE_DOMAINS_BRANCH` | `master` | Branch to use from the cache domains repository. |
| `NOFETCH` | `false` | Set to `true` to skip updating cache-domains on container startup. |

---

### Upstream Keepalive

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_UPSTREAM_KEEPALIVE` | `false` | Enable HTTP/1.1 persistent connections to CDN servers for faster downloads. |
| `UPSTREAM_KEEPALIVE_CONNECTIONS` | `16` | Number of idle connections to keep open per upstream pool (per nginx worker). |
| `UPSTREAM_KEEPALIVE_TIMEOUT` | `5m` | How long idle upstream connections stay open before closing. |
| `UPSTREAM_KEEPALIVE_REQUESTS` | `10000` | Maximum requests per connection before recycling. Prevents memory leaks. |
| `UPSTREAM_KEEPALIVE_EXCLUDE` | *(empty)* | Optional comma-separated cache identifiers to exclude from keepalive (e.g. `epic,origin`). Excluded caches use direct proxy. Rarely needed - cross-CDN redirects and upstream failures are handled automatically. |

By default, nginx opens a new TCP connection for every request to CDN servers. With keepalive enabled, connections are reused across multiple requests, eliminating TCP handshake and TLS negotiation overhead.

**Benefits:**
- Faster cache-miss downloads (estimated 3-5x improvement)
- Lower latency for chunked downloads
- Reduced CPU usage from fewer TLS handshakes

**How it works:**
1. On startup, creates nginx upstream pools for each resolvable domain in cache_domains.json
2. Each upstream pool uses nginx native DNS resolution (`resolve` parameter, nginx 1.27.3+) with shared memory zones - IPs are resolved and updated automatically without restarts
3. Maps incoming requests to the appropriate upstream pool
4. Cross-CDN redirects (302) are handled dynamically by `@upstream_redirect` - no static exclusion needed
5. Upstream failures (502/504) trigger automatic retry with longer timeouts via `@upstream_long_timeout`
6. Wildcard domains and unresolvable hosts fall back to direct proxy

---

### No-Slice Fallback

| Variable | Default | Description |
|----------|---------|-------------|
| `NOSLICE_FALLBACK` | `false` | Automatically detect and handle CDN servers that don't support HTTP Range requests. |
| `NOSLICE_THRESHOLD` | `3` | Number of slice failures before a host is added to the no-slice blocklist. |
| `DECAY_INTERVAL` | `86400` | Seconds (24h) before failure counts decay by 1. Prevents permanent blocklisting. |

Lancache uses HTTP Range requests to cache files in slices, enabling partial downloads and resumption. Some CDN servers don't implement Range requests correctly, causing cache errors. This feature automatically detects problematic servers and routes them through a non-sliced cache path.

**How it works:**
1. Monitors nginx error logs for "invalid range in slice response" errors
2. Tracks failure counts per hostname with timestamps
3. After reaching the threshold (default: 3), adds the host to a blocklist
4. Blocklisted hosts are cached without byte-range slicing
5. Failure counts decay over time (default: 24h) to allow recovery
6. Blocklist persists at `/data/noslice-hosts.map` across restarts

**Response header:** `X-LanCache-NoSlice: true` indicates the response came from the no-slice path.

**Reset the blocklist:**
```bash
docker exec lancache-monolithic-1 /scripts/reset-noslice.sh
```

---

### Nginx

| Variable | Default | Description |
|----------|---------|-------------|
| `NGINX_WORKER_PROCESSES` | `auto` | Number of nginx worker processes. `auto` uses one per CPU core. |
| `NGINX_LOG_FORMAT` | `cachelog` | Log format: `cachelog` (human-readable) or `cachelog-json` (for log parsers). |
| `NGINX_LOG_TO_STDOUT` | `false` | Mirror access logs to container stdout for debugging with `docker logs`. |

**Log format examples:**

`cachelog` (default):
```
[steam] 192.168.1.100 HIT "GET /depot/123/chunk/abc" 200 1048576 "Mozilla/5.0"
```

`cachelog-json`:
```json
{"timestamp":"2025-01-31T12:00:00","client":"192.168.1.100","cache_status":"HIT","request":"GET /depot/123/chunk/abc","status":200,"bytes":1048576,"cache_identifier":"steam"}
```

---

### Timeouts

| Variable | Default | Description |
|----------|---------|-------------|
| `NGINX_PROXY_CONNECT_TIMEOUT` | `300s` | Timeout for establishing connection to upstream CDN servers. |
| `NGINX_PROXY_READ_TIMEOUT` | `300s` | Timeout for reading response from upstream. Increase for slow CDNs. |
| `NGINX_PROXY_SEND_TIMEOUT` | `300s` | Timeout for sending request to upstream. |
| `NGINX_SEND_TIMEOUT` | `300s` | Timeout for sending response to client. |
| `NGINX_UPSTREAM_READ_TIMEOUT_LONG` | `600s` | Read timeout used when automatically retrying a failed upstream request (502/504). If the first attempt times out, the request is retried internally with this longer timeout. Reduces "upstream timed out" ([#192](https://github.com/lancachenet/monolithic/issues/192)). |
| `NGINX_UPSTREAM_CONNECT_TIMEOUT_LONG` | `120s` | Connect timeout used for the automatic retry attempt. |

---

### Common issues: Epic Games / Riot downloads

If Epic Games or Riot launcher downloads start then repeatedly pause, show "Unable to connect", or log "upstream timed out" / "prematurely closed connection":

1. **Automatic retry** – The image automatically retries failed upstream requests (502/504) with longer timeouts (`NGINX_UPSTREAM_READ_TIMEOUT_LONG=600s`). No per-host configuration is needed. Check `/data/logs/upstream-retry.log` to see if retries are happening. Retried responses include the `X-LanCache-Retry: true` header.
2. **Increase retry timeouts** – If retries also time out, increase `NGINX_UPSTREAM_READ_TIMEOUT_LONG` to `900s` or `1200s`.
3. **Keepalive** – Cross-CDN redirects are handled automatically. If a specific cache causes issues, exclude it manually with `UPSTREAM_KEEPALIVE_EXCLUDE=epic`.
4. **Host network** – If the cache runs in Docker with port mapping and you see timeouts, try **host network** so the container has direct outbound access: `docker run --network host ...` and bind nginx to a specific IP (e.g. `listen 192.168.1.40:80`) so the cache is only on that IP. See [lancachenet/monolithic#80](https://github.com/lancachenet/monolithic/issues/80).
5. **Prefill** – Use [epic-lancache-prefill](https://github.com/tpill90/epic-lancache-prefill) to pre-cache games; then client downloads serve from cache and avoid upstream flakiness.

---

### Permissions

| Variable | Default | Description |
|----------|---------|-------------|
| `PUID` | `33` | User ID that owns the cache files. Default 33 is www-data on Debian/Ubuntu. |
| `PGID` | `33` | Group ID for cache files. Match your host user for NFS/SMB shares. |
| `SKIP_PERMS_CHECK` | `false` | Skip the ownership check on startup. Use when permissions are managed externally. |
| `FORCE_PERMS_CHECK` | `false` | Force recursive `chown` on startup. Warning: slow on large caches. |

For NFS/SMB shares where file ownership matters:
- Set `PUID`/`PGID` to match your NFS export or SMB share owner
- Use `SKIP_PERMS_CHECK=true` if the NFS server doesn't allow ownership changes
- Set to `nginx` to use the container's default nginx user without modification

---

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOGFILE_RETENTION` | `3560` | Days to keep rotated log files before deletion. |
| `BEAT_TIME` | `1h` | Interval between heartbeat entries in logs. Confirms the cache is running. |
| `SUPERVISORD_LOGLEVEL` | `error` | Supervisor log verbosity: `critical`, `error`, `warn`, `info`, `debug`. |

---

## Volumes

| Path | Description |
|------|-------------|
| `/data/cache` | Game download cache. Mount your largest/fastest storage here. |
| `/data/logs` | Access and error logs. `access.log` shows cache hits/misses. |

---

## Architecture Support

Supports `linux/amd64` and `linux/arm64`. Docker automatically pulls the correct image for your platform.

- **amd64**: Standard x86_64 servers and desktops
- **arm64**: Raspberry Pi 4/5, Apple Silicon (via Docker Desktop), AWS Graviton

---

## Full Example

```yaml
services:
  monolithic:
    image: ghcr.io/regix1/monolithic:latest
    environment:
      # Network
      - UPSTREAM_DNS=8.8.8.8
      # Cache
      - CACHE_DISK_SIZE=2000g
      - CACHE_INDEX_SIZE=2g
      - MIN_FREE_DISK=50g
      # Performance
      - ENABLE_UPSTREAM_KEEPALIVE=true
      - NOSLICE_FALLBACK=true
      # Permissions
      - PUID=33
      - PGID=33
    volumes:
      - /mnt/cache:/data/cache
      - ./logs:/data/logs
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/lancache-heartbeat"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Building from Source

```bash
# Build for current architecture
docker build -t monolithic:local .

# Build for multiple architectures (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 -t monolithic:local .
```

---

## Thanks

- Original configs from [ansible-lanparty](https://github.com/ti-mo/ansible-lanparty)
- [/r/lanparty](https://reddit.com/r/lanparty) community
- UK LAN Techs

## License

MIT License - see source for full text.
