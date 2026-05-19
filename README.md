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
      - "8081:8081"  # Admin panel
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
| `UPSTREAM_KEEPALIVE_TIMEOUT` | `4s` | How long idle upstream connections stay open before closing. Should be set lower than your CDN's idle timeout — Cloudflare typically drops idle connections after 5–15s, so values above that will cause stalled downloads. |
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
5. Wildcard domains and unresolvable hosts fall back to direct proxy

---

### No-Slice Fallback

| Variable | Default | Description |
|----------|---------|-------------|
| `NOSLICE_FALLBACK` | `false` | Automatically detect and handle CDN servers that don't support HTTP Range requests. |
| `NOSLICE_THRESHOLD` | `3` | Number of slice failures before a host is added to the no-slice blocklist. |
| `NOSLICE_DETECT_MODE` | `log` | Detection strategy: `log` (scan `error.log`), `response` (inspect upstream `Content-Range` in real time), or `both`. |
| `NOSLICE_SCAN_INTERVAL` | `10s` | How often the detector polls for new failures. Accepts any nginx time literal (e.g. `5s`, `1m`). |
| `NOSLICE_STATIC_HOSTS` | *(empty)* | Comma-separated hostnames blocklisted at startup, before the detector has seen any traffic. |
| `DECAY_INTERVAL` | `86400` | Seconds (24h) before failure counts decay by 1. Prevents permanent blocklisting. |

Lancache uses HTTP Range requests to cache files in slices, enabling partial downloads and resumption. Some CDN servers don't implement Range requests correctly, causing cache errors. This feature automatically detects problematic servers and routes them through a non-sliced cache path.

**How it works:**

The detector runs entirely inside the nginx worker process via [njs](https://nginx.org/en/docs/njs/) (nginx's native JavaScript module). No background shell scripts, no subprocess churn, no `nginx -s reload` when a new host is added.

1. **Shared state.** A `js_shared_dict_zone zone=lancache type=number` holds per-host failure counts, last-error timestamps, and a block flag. The zone is declared with `state=/data/noslice.dict`, which means njs persists it to disk and reloads it automatically on container start — the blocklist survives restarts with no custom save/restore logic.
2. **`js_periodic` task.** A scheduled JavaScript function runs every `NOSLICE_SCAN_INTERVAL` and, depending on `NOSLICE_DETECT_MODE`, does one of:
   - **`log`** (default): incrementally reads only the new bytes of `error.log` (tracking a byte offset in the shared dict) and looks for the slice-failure signature. The whole log file is never re-read.
   - **`response`**: a `js_header_filter` inspects every upstream response in real time and flags hosts that answered a `Range` request without a valid `206/Content-Range`. Zero log I/O.
   - **`both`**: both detectors run together.
3. **Routing decision.** `$noslice_host` is a `js_set` variable computed live from the shared dict — when a host's failure count crosses `NOSLICE_THRESHOLD`, the variable resolves to `1` and the request is rerouted through `@noslice` via `error_page 460`. Because the variable is computed per-request, there is no map block to regenerate and no nginx reload.
4. **Decay.** Failure counts age out on a `DECAY_INTERVAL` schedule so a CDN that misbehaves once does not stay blocklisted forever.
5. **Static seeding.** Anything in `NOSLICE_STATIC_HOSTS` is loaded into the blocklist on the first scan, so you can pre-flag a known-bad CDN without waiting for the detector to learn it.

**Response header:** `X-LanCache-NoSlice: true` is set on any response served via the `@noslice` path, so you can confirm at a glance which requests bypassed slicing.

**Inspect the live state.** The detector exposes a JSON endpoint on the internal `:8080` listener (locked to `127.0.0.1`):

```bash
docker exec lancache-monolithic-1 wget -qO- http://127.0.0.1:8080/lancache-internal/noslice
```

```json
{
  "enabled": true,
  "mode": "log",
  "blockedHosts": ["cdn.example.com"],
  "state": {
    "cdn.example.com": { "count": 4, "lastError": 1716100000, "blocked": true }
  }
}
```

The admin panel re-exposes the same data at `GET /api/noslice` (and pushes live updates over the SSE channel) so the dashboard does not have to poll the internal endpoint directly.

**Reset the blocklist:**
```bash
docker exec lancache-monolithic-1 /scripts/reset-noslice.sh
```

`reset-noslice.sh` is now a thin wrapper that `POST`s to `http://127.0.0.1:8080/lancache-internal/noslice/reset` — the same call the admin panel's "Reset noslice" button makes. It clears the shared dict and the on-disk state file in a single round-trip.

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

---

### Caching Fortnite / Epic Games

Caching Fortnite and other Epic Games Launcher downloads is the most frequently asked-about scenario, and the failure mode ("downloads ~20 s of content, then every chunk is a `MISS` even though the game is fully downloaded") is genuinely confusing. The honest summary is:

> Lancache caches **HTTP only**. HTTPS traffic is SNI-proxied straight through, **untouched**. If the Epic launcher negotiates an HTTPS CDN endpoint, every chunk is a permanent `MISS` — the cache never sees the payload.

This is tracked upstream as [lancachenet/monolithic#192](https://github.com/lancachenet/monolithic/issues/192), which remains open. The cache cannot rewrite client TLS choices; it can detect them, surface them, and tune around them.

**1. Client-side fix — `Engine.ini`.**

The Epic Games Launcher honours a `[Launcher] ForceNonSslCdn=false` toggle in its `Engine.ini`. Setting it to `false` tells the launcher to use HTTP CDN endpoints when they are advertised, which is what lets the cache see the traffic.

On Windows the file lives at:

```
%LOCALAPPDATA%\EpicGamesLauncher\Saved\Config\Windows\Engine.ini
```

A safe, idempotent helper script is shipped in `contrib/lancache-epic-fix.ps1`. Run it on every Windows client that downloads through the cache:

```powershell
powershell -ExecutionPolicy Bypass -File .\contrib\lancache-epic-fix.ps1
```

The script adds (or updates) the `[Launcher]` section with `ForceNonSslCdn=false` and is safe to re-run.

**2. Server-side fix — `EPIC_FORCE_NOSLICE`.**

The Epic CDN hosts (`*.epicgamescdn.com`, `cloudflare.epicgamescdn.com`, `download.epicgames.com`, `epicgames-download1.akamaized.net`, `fastly-download.epicgames.com`) are a known slice-error problem child — many users in `#192` report "disabling slice helped". Rather than wait for the noslice detector to learn each Epic host the hard way, set:

```env
EPIC_FORCE_NOSLICE=true
```

When this flag is set, `24_epicgames.conf` routes the known Epic CDN hosts straight to `@noslice` from the first request, and tunes the Epic-specific cache lock to match the launcher's ~30 s client timeout (`proxy_cache_lock_age 15s`).

**3. Update deltas are partly out of scope.**

Even with the client and server fixes applied, Epic update deltas use chunk URLs that differ from the original release artefacts. Tools such as [`epic-lancache-prefill`](https://github.com/tpill90/epic-lancache-prefill) only pre-fetch the *full* depot — they cannot predict which delta chunks the launcher will request on update day, so expect some upstream traffic even on cache hits. This is documented in `#192` and is not a bug in the cache.

**4. Live diagnostic.**

The admin panel renders an Epic-specific health card on the Dashboard showing:

- 24 h hit/miss ratio across Epic CDN hosts
- whether the sniproxy logs show Epic traffic going over HTTPS (the `ForceNonSslCdn` smoking gun)
- a hint linking back to `contrib/lancache-epic-fix.ps1` when an HTTPS leak is detected

The same data is exposed at `GET /api/epic` for scripting or alerting.

**5. Other launcher symptoms (Epic Games / Riot).**

If launcher downloads start then repeatedly pause, show "Unable to connect", or log "upstream timed out" / "prematurely closed connection":

1. **Cloudflare CDN stalling (0 B/s)** – Epic Games and other Cloudflare-backed services can stall at 0 B/s if `UPSTREAM_KEEPALIVE_TIMEOUT` is set higher than Cloudflare's idle connection timeout (5–15 s). The `@direct_fallback` location automatically detects these stalls and bypasses the keepalive upstream, falling back to a direct proxy for affected requests. Check `/data/logs/upstream-fallback.log` for fallback activity. If stalls are frequent, lower `UPSTREAM_KEEPALIVE_TIMEOUT` (e.g. `4s`) to stay under Cloudflare's idle threshold.
2. **Keepalive exclusions** – Cross-CDN redirects are handled automatically. If a specific cache still causes issues, exclude it manually with `UPSTREAM_KEEPALIVE_EXCLUDE=epic`.
3. **Host network** – If the cache runs in Docker with port mapping and you see timeouts, try **host network** so the container has direct outbound access: `docker run --network host ...` and bind nginx to a specific IP (e.g. `listen 192.168.1.40:80`) so the cache is only on that IP. See [lancachenet/monolithic#80](https://github.com/lancachenet/monolithic/issues/80).
4. **Prefill** – Use [epic-lancache-prefill](https://github.com/tpill90/epic-lancache-prefill) to pre-cache games; then client downloads serve from cache and avoid upstream flakiness.

---

### Boot reliability

If the cache disk is slow to mount (ZFS imports, mdadm assembly, NFS or CIFS mounts, USB enclosures, encrypted volumes), the container can race the mount on boot and fail before `/data/cache` is writable. Two layers of protection are available.

| Variable | Default | Description |
|----------|---------|-------------|
| `VOLUME_WAIT_TIMEOUT` | `120` | Seconds the entrypoint waits for `/data/cache`, `/data/logs`, and `/data/config` to be present, be directories, and accept a real test-write before failing. |

The entrypoint hook probes each path with an actual `: > /data/cache/.probe.$$` (not just `[ -w ]`) because overlay and NFS edge cases can report writable but `EROFS` on first write. While waiting it logs progress every ~10 s; if the timeout is exceeded it exits with a single root-cause message pointing at the slow mount, and Docker's restart policy brings the container back when the mount eventually settles.

For hosts where the cache disk is **always** late (ZFS, mdadm, NFS, USB, encrypted), the per-container wait is a backstop, not a fix. Install the host-side systemd unit in `contrib/lancache.service` so the entire stack waits for the mount before starting at all:

```bash
sudo cp contrib/lancache.service /etc/systemd/system/lancache.service
# Edit the unit to point RequiresMountsFor= and ExecStart -f at your paths.
sudo systemctl daemon-reload
sudo systemctl enable --now lancache.service
```

See `contrib/README.md` for the full install + verify checklist.

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

## Admin Panel

A built-in web dashboard is available on **port 8081** for monitoring and configuration.

- **Dashboard** — Active connections, service health, cache volume, filesystem detection
- **Configuration** — Edit environment variables with live mismatch warnings
- **Upstream** — Keepalive pool status, fallback events, cache domains tree
- **Logs** — Cache hit/miss distribution, error rate, response times

Access it at `http://<cache-ip>:8081`. No authentication required (internal network only).

> [!NOTE]
> The admin panel currently displays mock data. A Go backend that provides live data from nginx, supervisor, and log files is planned.

---

## Ports

| Port | Description |
|------|-------------|
| `80` | HTTP cache proxy (required) |
| `443` | HTTPS SNI proxy for HTTPS-only CDNs |
| `8080` | nginx stub_status metrics endpoint |
| `8081` | Admin panel web UI |

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
      - "8081:8081"  # Admin panel
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
