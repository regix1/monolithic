# Monolithic Game Download Cache Docker Container

![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/monolithic?label=Monolithic) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/lancache-dns?label=Lancache-dns) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/sniproxy?label=Sniproxy) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/generic?label=Generic)

> [!NOTE]
> **Recommended image tag:**
>
> ```bash
> docker pull ghcr.io/regix1/monolithic:latest
> ```
>
> GitHub's package registry may show other tags prominently. For production use, always pull `:latest` to ensure you have the stable release.

## Documentation

The documentation for the LanCache.net project can be found on [our website](http://www.lancache.net)

The specific documentation for this monolithic container is [here](http://lancache.net/docs/containers/monolithic/)

If you have any problems after reading the documentation please see [the support page](http://lancache.net/support/) before opening a new issue on github.

## Multi-Architecture Support

This image supports both **AMD64** and **ARM64** architectures. Docker will automatically pull the correct image for your platform.

Supported platforms:
- `linux/amd64` - Standard x86_64 servers and desktops
- `linux/arm64` - ARM-based systems (Raspberry Pi 4/5, Apple Silicon, AWS Graviton, etc.)

## Environment Variables

The following environment variables can be configured in your docker-compose.yml file:

### User and Group Configuration

- `PUID` - User ID for the cache process (default: 33)
  - Set to a numeric UID to match your host user
  - Set to `nginx` to use the default nginx user without modification
- `PGID` - Group ID for the cache process (default: 33)
  - Set to a numeric GID to match your host group
  - Set to `nginx` to use the default nginx group without modification

The ability to configure PUID/PGID was added to support NFS and SMB network shares, where matching the correct user/group permissions is essential for proper cache directory access.

### Cache Configuration

- `CACHE_INDEX_SIZE` - Size of the cache index (default: 500m)
- `CACHE_DISK_SIZE` - Maximum size of the disk cache (default: 1000g)
- `MIN_FREE_DISK` - Minimum free disk space to maintain (default: 10g)
- `CACHE_MAX_AGE` - Maximum age of cached content (default: 3560d)
- `CACHE_SLICE_SIZE` - Size of cache slices (default: 1m)
- `NOSLICE_FALLBACK` - Automatic detection and handling of servers that don't support HTTP Range requests (default: false)
  - A background service monitors the error log for "invalid range in slice response" errors
  - After `NOSLICE_THRESHOLD` failures for a host, it's automatically added to a blocklist
  - Blocklisted hosts are routed to a no-slice location that caches without using byte-range requests
  - This fixes caching issues with servers that don't properly support Range requests
  - No-slice responses are marked with an `X-LanCache-NoSlice: true` header
  - Blocklist is persisted at `/data/noslice-hosts.map` and survives container restarts
  - Set to "true" to enable automatic detection
- `NOSLICE_THRESHOLD` - Number of slice failures before a host is added to the blocklist (default: 3)

To clear the noslice blocklist and reset failure counts:
```bash
docker exec <container-name> bash -c 'echo "{}" > /data/noslice-state.json && head -5 /data/noslice-hosts.map > /tmp/map && mv /tmp/map /data/noslice-hosts.map && nginx -s reload'
```

### Network Configuration

- `UPSTREAM_DNS` - DNS servers to use for upstream resolution (default: "8.8.8.8 8.8.4.4")

### Cache Domains Configuration

- `CACHE_DOMAINS_REPO` - Git repository for cache domain lists (default: "https://github.com/uklans/cache-domains.git")
- `CACHE_DOMAINS_BRANCH` - Branch to use from the cache domains repo (default: master)
- `NOFETCH` - Skip fetching/updating cache-domains on startup (default: false)

### Nginx Configuration

- `NGINX_WORKER_PROCESSES` - Number of nginx worker processes (default: auto)
- `NGINX_LOG_FORMAT` - Log format to use (default: cachelog)
  - `cachelog` - Human-readable format: `[steam] 192.168.1.10 - [07/Dec/2025:12:00:00] "GET /..." 200 ...`
  - `cachelog-json` - JSON format for log parsers: `{"timestamp":"...","cache_identifier":"steam",...}`
- `NGINX_LOG_TO_STDOUT` - Output nginx access logs to stdout for debugging (default: false)

### Timeout Configuration

- `NGINX_PROXY_CONNECT_TIMEOUT` - Proxy connection timeout (default: 300s)
- `NGINX_PROXY_SEND_TIMEOUT` - Proxy send timeout (default: 300s)
- `NGINX_PROXY_READ_TIMEOUT` - Proxy read timeout (default: 300s)
- `NGINX_SEND_TIMEOUT` - Send timeout (default: 300s)

### Upstream Keepalive Configuration

Upstream keepalive enables HTTP/1.1 connection pooling to CDN origin servers. This dramatically improves cache-miss download speeds by reusing TCP connections instead of creating new ones for each chunk request.

**Benefits:**
- Significantly faster cache-miss downloads (reported improvements from ~200Mbps to ~1Gbps)
- Reduced latency for small chunk requests
- Lower CPU usage from fewer TCP handshakes

- `ENABLE_UPSTREAM_KEEPALIVE` - Enable upstream connection pooling (default: false)
  - When enabled, generates nginx upstream blocks for each cache domain
  - DNS is resolved at startup using `UPSTREAM_DNS` to avoid routing loops
  - Falls back to direct proxy for wildcard domains or unresolvable hosts
- `UPSTREAM_REFRESH_INTERVAL` - How often to refresh upstream DNS (default: 1h)
  - Supports time units: s (seconds), m (minutes), h (hours), d (days)
  - Set to "0" to disable periodic refresh (DNS only resolved at startup)
  - CDN IPs can change frequently; 1 hour is a reasonable default
- `UPSTREAM_KEEPALIVE_CONNECTIONS` - Connections per upstream pool (default: 16)
  - This is per nginx worker process
  - Higher values may improve throughput for busy caches
- `UPSTREAM_KEEPALIVE_REQUESTS` - Requests per keepalive connection (default: 10000)
  - Number of requests through a connection before closing it
  - Prevents potential memory leaks from very long-lived connections
- `UPSTREAM_KEEPALIVE_TIMEOUT` - Idle connection timeout (default: 5m)
  - How long to keep idle connections open

**How it works:**
1. At startup, the hook script parses `cache_domains.json` and resolves each domain
2. Generates nginx upstream blocks with resolved IPs and keepalive settings
3. Creates a map that routes requests to the appropriate upstream pool
4. Steam traffic is detected by User-Agent header (not domain wildcard)
5. A background service periodically re-resolves DNS and reloads nginx if IPs change

**Example with keepalive enabled:**
```yaml
environment:
  - ENABLE_UPSTREAM_KEEPALIVE=true
  - UPSTREAM_REFRESH_INTERVAL=1h
  - UPSTREAM_KEEPALIVE_CONNECTIONS=32
```

### Logging Configuration

- `LOGFILE_RETENTION` - Number of days to retain log files (default: 3560)
- `BEAT_TIME` - Interval between heartbeat log entries (default: 1h)
- `SUPERVISORD_LOGLEVEL` - Supervisord log level: critical, error, warn, info, debug, trace, blather (default: error)

### Permissions Configuration

- `SKIP_PERMS_CHECK` - Skip the permissions check entirely on startup (default: false)
  - Set to "true" to disable all permissions checking at startup
  - Useful when you know permissions are already correct or managed externally
- `FORCE_PERMS_CHECK` - Force full recursive permissions fix on startup (default: false)
  - Set to "true" if you encounter permission errors after changing PUID/PGID
  - Note: This will take a long time on large caches

The permissions check runs a fast check on startup and will warn if files have incorrect ownership. It will not block container startup. If you need to fix permissions, either:
1. Set `FORCE_PERMS_CHECK=true` to attempt fixing from within the container
2. Run `chown -R <PUID>:<PGID> /path/to/cache` on the host system

### Example docker-compose.yml

```yaml
services:
  monolithic:
    image: ghcr.io/regix1/monolithic:latest
    environment:
      - PUID=33
      - PGID=33
      - CACHE_DISK_SIZE=1000g
      - CACHE_INDEX_SIZE=500m
      - CACHE_MAX_AGE=3560d
      - CACHE_SLICE_SIZE=1m
      - MIN_FREE_DISK=10g
      - UPSTREAM_DNS=8.8.8.8 8.8.4.4
      - CACHE_DOMAINS_REPO=https://github.com/uklans/cache-domains.git
      - CACHE_DOMAINS_BRANCH=master
      - NOFETCH=false
      - NGINX_WORKER_PROCESSES=auto
      - NGINX_LOG_FORMAT=cachelog
      - NGINX_LOG_TO_STDOUT=false
      - NGINX_PROXY_CONNECT_TIMEOUT=300s
      - NGINX_PROXY_SEND_TIMEOUT=300s
      - NGINX_PROXY_READ_TIMEOUT=300s
      - NGINX_SEND_TIMEOUT=300s
      - NOSLICE_FALLBACK=false
      - NOSLICE_THRESHOLD=3
      - ENABLE_UPSTREAM_KEEPALIVE=false
      - UPSTREAM_REFRESH_INTERVAL=1h
      - SKIP_PERMS_CHECK=false
      - FORCE_PERMS_CHECK=false
      - LOGFILE_RETENTION=3560
      - BEAT_TIME=1h
      - SUPERVISORD_LOGLEVEL=error
    volumes:
      - ./cache:/data/cache
      - ./logs:/data/logs
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped
```

## NFS Mount Considerations

When using NFS-mounted cache directories:

1. **Set PUID/PGID** to match the user/group that owns the NFS share
2. **Use Mapall** (not just Maproot) in your NFS server settings if you want all writes to use the same UID/GID
3. If you see "Operation not permitted" errors during permissions check, the NFS server may not allow ownership changes - fix permissions on the NFS server directly or use `SKIP_PERMS_CHECK=true`

## Building from Source

This image is self-contained and builds from the official `nginx:alpine` base image, which provides multi-architecture support. To build locally:

```bash
# Build for current architecture
docker build -t monolithic:local .

# Build for multiple architectures (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 -t monolithic:local .
```

## Thanks

- Based on original configs from [ansible-lanparty](https://github.com/ti-mo/ansible-lanparty).
- Everyone on [/r/lanparty](https://reddit.com/r/lanparty) who has provided feedback and helped people with this.
- UK LAN Techs for all the support.

## License

The MIT License (MIT)

Copyright (c) 2019 Jessica Smith, Robin Lewis, Brian Wojtczak, Jason Rivers, James Kinsman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
