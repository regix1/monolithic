# Monolithic Game Download Cache Docker Container

![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/monolithic?label=Monolithic) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/lancache-dns?label=Lancache-dns) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/sniproxy?label=Sniproxy) ![Docker Pulls](https://img.shields.io/docker/pulls/lancachenet/generic?label=Generic)

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

- `PUID` - User ID for the cache process (default: 1000)
  - Set to a numeric UID to match your host user
  - Set to `nginx` to use the default nginx user without modification
- `PGID` - Group ID for the cache process (default: 1000)
  - Set to a numeric GID to match your host group
  - Set to `nginx` to use the default nginx group without modification

These are particularly useful when you need to match specific user/group permissions on your host system for the cache directories, especially when using NFS mounts.

### Cache Configuration

- `CACHE_INDEX_SIZE` - Size of the cache index (default: 500m)
- `CACHE_DISK_SIZE` - Maximum size of the disk cache (default: 1000g)
- `MIN_FREE_DISK` - Minimum free disk space to maintain (default: 10g)
- `CACHE_MAX_AGE` - Maximum age of cached content (default: 3560d)
- `CACHE_SLICE_SIZE` - Size of cache slices (default: 1m)

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

### SSL Bump Configuration (HTTPS Caching)

Some game publishers (like Ubisoft Connect) use HTTPS-only downloads, which cannot be cached by default. SSL Bump enables caching of HTTPS traffic by intercepting and decrypting it.

**Warning:** This requires installing a CA certificate on all client machines.

- `ENABLE_SSL_BUMP` - Enable HTTPS interception and caching (default: false)
- `SSL_BUMP_TEST_TIMEOUT` - Timeout for testing each domain in seconds (default: 3)
- `SSL_BUMP_RETEST` - Force re-test all domains, ignoring cache (default: false)
- `SSL_BUMP_MAX_FAILURES` - Number of SSL failures before bypassing a domain (default: 3)
- `SSL_BUMP_CHECK_INTERVAL` - How often to check for SSL failures in seconds (default: 30)

#### How SSL Bump Works

1. On startup, the container tests each domain from cache-domains to detect HTTPS-only domains
2. Only HTTPS-only domains are intercepted; HTTP domains pass through normally
3. A CA certificate is generated in `/data/ssl/` on first startup
4. Clients must install this certificate to allow HTTPS interception
5. If a domain fails SSL bump (e.g., certificate pinning), it's automatically bypassed after 3 failures

#### Installing the CA Certificate

After enabling SSL bump, download and install the certificate on your gaming PCs:

**From browser:** `http://<LANCACHE_IP>/lancache-certs`

**Direct downloads:**
- Windows: `http://<LANCACHE_IP>/lancache-certs/lancache-ca.der`
- Linux: `http://<LANCACHE_IP>/lancache-certs/lancache-ca.pem`

**Windows Installation:**

1. Download the `.der` file and double-click to open

   ![Step 1](https://github.com/user-attachments/assets/3003eadf-15b9-4976-8357-b8aa1e4df2b8)

2. Click "Install Certificate..."

   ![Step 2](https://github.com/user-attachments/assets/39e78796-0346-4e25-b62e-6cc6a4f54a61)

3. Select "Local Machine" and click Next

   ![Step 3](https://github.com/user-attachments/assets/c2cf03e5-ff22-4bbc-b1e2-4094bcb73db1)

4. Select "Place all certificates in the following store" and click Browse

   ![Step 4](https://github.com/user-attachments/assets/903f7841-d4ed-45bd-a257-e4a580013ffa)

5. Select "Trusted Root Certification Authorities"

   ![Step 5](https://github.com/user-attachments/assets/bc622d7f-dcd6-441e-916d-a3f9b2800b29)

6. Click Next

   ![Step 6](https://github.com/user-attachments/assets/817c25a7-4c33-4c0b-8471-9bb5875c1f0c)

7. Click Finish

   ![Step 7](https://github.com/user-attachments/assets/ab97f1a2-1a0d-410b-b7ea-4d436b5e0863)

8. Click Yes to confirm the security warning

   ![Step 8](https://github.com/user-attachments/assets/8e79b88e-35c1-4f71-ba6d-8ddd865c6a52)

9. Certificate installed successfully

   ![Step 9](https://github.com/user-attachments/assets/65bbae5f-08ce-474b-90dc-0da14dbdadd0)

10. After a reboot, the certificate will appear in the certlm (Local Computer Certificates) view under "Trusted Root Certification Authorities"

**Linux Installation:**
```bash
sudo cp lancache-ca.pem /usr/local/share/ca-certificates/lancache-ca.crt
sudo update-ca-certificates
```

#### Checking SSL Bump Status

```bash
# View which domains will be SSL bumped
docker exec <container> cat /etc/squid/bump-domains.txt

# View domains that failed and are bypassed
docker exec <container> cat /etc/squid/splice-domains.txt

# View Squid logs
docker exec <container> tail -f /data/logs/squid-access.log
```

### Example docker-compose.yml

```yaml
services:
  monolithic:
    image: ghcr.io/regix1/monolithic:latest
    environment:
      - PUID=1000
      - PGID=1000
      - CACHE_DISK_SIZE=2000g
      - NGINX_PROXY_READ_TIMEOUT=600s
      - UPSTREAM_DNS=1.1.1.1 1.0.0.1
      - ENABLE_SSL_BUMP=false
    volumes:
      - ./cache:/data/cache
      - ./logs:/data/logs
      - ./ssl:/data/ssl
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
