#!/bin/bash
set -e

# Handle CACHE_MEM_SIZE deprecation
if [[ ! -z "${CACHE_MEM_SIZE}" ]]; then
    CACHE_INDEX_SIZE=${CACHE_MEM_SIZE}
fi

# Preprocess UPSTREAM_DNS to allow for multiple resolvers using the same syntax as lancache-dns
UPSTREAM_DNS="$(echo -n "${UPSTREAM_DNS}" | sed 's/[;]/ /g')"

echo "worker_processes ${NGINX_WORKER_PROCESSES};" > /etc/nginx/workers.conf
sed -i "s/^user .*/user ${WEBUSER};/" /etc/nginx/nginx.conf
sed -i "s/sendfile NGINX_SENDFILE/sendfile ${NGINX_SENDFILE:-on}/" /etc/nginx/nginx.conf
sed -i "s/worker_connections NGINX_WORKER_CONNECTIONS/worker_connections ${NGINX_WORKER_CONNECTIONS:-4096}/" /etc/nginx/nginx.conf
sed -i "s/CACHE_INDEX_SIZE/${CACHE_INDEX_SIZE}/"  /etc/nginx/conf.d/20_proxy_cache_path.conf
sed -i "s/CACHE_DISK_SIZE/${CACHE_DISK_SIZE}/" /etc/nginx/conf.d/20_proxy_cache_path.conf
sed -i "s/MIN_FREE_DISK/${MIN_FREE_DISK}/" /etc/nginx/conf.d/20_proxy_cache_path.conf
sed -i "s/CACHE_MAX_AGE/${CACHE_MAX_AGE}/" /etc/nginx/conf.d/20_proxy_cache_path.conf
sed -i "s/CACHE_MAX_AGE/${CACHE_MAX_AGE}/"    /etc/nginx/sites-available/cache.conf.d/root/20_cache.conf
sed -i "s/slice 1m;/slice ${CACHE_SLICE_SIZE};/" /etc/nginx/sites-available/cache.conf.d/root/20_cache.conf
sed -i "s/UPSTREAM_DNS/${UPSTREAM_DNS}/"    /etc/nginx/sites-available/cache.conf.d/10_root.conf
sed -i "s/UPSTREAM_DNS/${UPSTREAM_DNS}/"    /etc/nginx/sites-available/upstream.conf.d/10_resolver.conf
sed -i "s/UPSTREAM_DNS/${UPSTREAM_DNS}/"    /etc/nginx/stream-available/10_sni.conf
sed -i "s/UPSTREAM_DNS/${UPSTREAM_DNS}/"    /etc/nginx/sites-available/15_ssl_cache.conf 2>/dev/null || true
sed -i "s/LOG_FORMAT/${NGINX_LOG_FORMAT}/"  /etc/nginx/sites-available/10_cache.conf
sed -i "s/LOG_FORMAT/${NGINX_LOG_FORMAT}/"  /etc/nginx/sites-available/20_upstream.conf

# Admin backend — always-on. The Go process runs as the supervisor program
# `lancache-admin` (overlay/etc/supervisor/conf.d/admin.conf) because it hosts
# the log-watcher goroutine (replaces the old log-watcher.sh) and is the only
# component allowed to send `nginx -s reopen`. Its API listens on
# 127.0.0.1:${ADMIN_API_PORT:-8082} and is NOT in EXPOSE, so it is container-
# internal regardless of ENABLE_ADMIN_UI.
#
# ENABLE_ADMIN_UI still gates only the *public* `40_admin.conf` nginx site
# (the user-facing UI on port ${ADMIN_PORT}).
if [[ "${ENABLE_ADMIN_UI}" == "true" ]]; then
    echo "Enabling admin UI on port ${ADMIN_PORT:-8181}"
    sed -i "s/ADMIN_PORT/${ADMIN_PORT:-8181}/" /etc/nginx/sites-available/40_admin.conf
    ln -sf /etc/nginx/sites-available/40_admin.conf /etc/nginx/sites-enabled/40_admin.conf
else
    rm -f /etc/nginx/sites-enabled/40_admin.conf
fi

# Configure nginx stdout logging (for debugging)
if [[ "${NGINX_LOG_TO_STDOUT}" == "true" ]]; then
    sed -i "s|NGINX_STDOUT_LOGFILE|/dev/stdout|" /etc/supervisor/conf.d/nginx.conf
else
    sed -i "s|NGINX_STDOUT_LOGFILE|/dev/null|" /etc/supervisor/conf.d/nginx.conf
fi

# Process timeout configuration if template exists
if [ -f /etc/nginx/conf.d/99_timeouts.conf.template ]; then
    cp /etc/nginx/conf.d/99_timeouts.conf.template /etc/nginx/conf.d/99_timeouts.conf
    sed -i "s/NGINX_PROXY_CONNECT_TIMEOUT/${NGINX_PROXY_CONNECT_TIMEOUT}/" /etc/nginx/conf.d/99_timeouts.conf
    sed -i "s/NGINX_PROXY_SEND_TIMEOUT/${NGINX_PROXY_SEND_TIMEOUT}/" /etc/nginx/conf.d/99_timeouts.conf
    sed -i "s/NGINX_PROXY_READ_TIMEOUT/${NGINX_PROXY_READ_TIMEOUT}/" /etc/nginx/conf.d/99_timeouts.conf
    sed -i "s/NGINX_SEND_TIMEOUT/${NGINX_SEND_TIMEOUT}/" /etc/nginx/conf.d/99_timeouts.conf
fi


# Handle ENABLE_UPSTREAM_KEEPALIVE - HTTP/1.1 connection pooling to upstream CDN servers
if [ -f /etc/nginx/sites-available/upstream.conf.d/30_primary_proxy.conf.template ]; then
    cp /etc/nginx/sites-available/upstream.conf.d/30_primary_proxy.conf.template \
       /etc/nginx/sites-available/upstream.conf.d/30_primary_proxy.conf
    
    if [[ "${ENABLE_UPSTREAM_KEEPALIVE}" == "true" ]]; then
        echo "Enabling upstream keepalive connection pooling"
        # Use $upstream_name which is set by the generated map (defaults to $host for unmapped domains)
        sed -i "s/PROXY_PASS_TARGET/\$upstream_name/" \
            /etc/nginx/sites-available/upstream.conf.d/30_primary_proxy.conf
        
    else
        # Default behavior: direct pass using $host
        sed -i "s/PROXY_PASS_TARGET/\$host/" \
            /etc/nginx/sites-available/upstream.conf.d/30_primary_proxy.conf
    fi
fi

# Handle NOSLICE_FALLBACK — automatic detection and routing of hosts that don't
# support HTTP Range requests.
#
# The old shell detector (overlay/scripts/noslice-detector.sh) and its
# generated map (`/data/noslice-hosts.map`) have been retired. Detection now
# lives in the njs `lancache` module (overlay/etc/nginx/njs/), backed by a
# `js_shared_dict_zone` with `state=/data/noslice.dict` for persistence.
# `$noslice_host` is a `js_set` variable, so no `nginx -s reload` is ever
# required when a host is blocklisted.
#
# This flag controls two things only:
#   1. Whether the `@noslice` location (`15_noslice.conf`) and its routing
#      stanza (`05_noslice_routing.conf`) are enabled.
#   2. Whether the njs `scanErrorLog` periodic does any work (the module
#      reads NOSLICE_FALLBACK at runtime via /etc/nginx/conf.d/05_njs.conf).
#
# Disabling this flag does NOT unload the njs module — `$noslice_host` simply
# always returns "0", which is the documented behaviour (THE CONTRACT §4).
if [[ "${NOSLICE_FALLBACK}" == "true" ]]; then
    echo "Enabling automatic no-slice fallback (threshold: ${NOSLICE_THRESHOLD} failures, mode: ${NOSLICE_DETECT_MODE:-log})"

    # Enable nginx configs for noslice routing
    mv /etc/nginx/sites-available/cache.conf.d/15_noslice.conf.disabled \
       /etc/nginx/sites-available/cache.conf.d/15_noslice.conf 2>/dev/null || true
    mv /etc/nginx/sites-available/cache.conf.d/root/05_noslice_routing.conf.disabled \
       /etc/nginx/sites-available/cache.conf.d/root/05_noslice_routing.conf 2>/dev/null || true

    # Replace CACHE_MAX_AGE in noslice config (file may or may not exist;
    # `sed -i` is a no-op on a missing file with `2>/dev/null || true`).
    sed -i "s/CACHE_MAX_AGE/${CACHE_MAX_AGE}/" \
        /etc/nginx/sites-available/cache.conf.d/15_noslice.conf 2>/dev/null || true

    # njs-managed state file. We pre-create it so the worker user can write to
    # it on first persist; njs will populate it via `state=/data/noslice.dict`.
    if [[ ! -f /data/noslice.dict ]]; then
        : > /data/noslice.dict
        chown ${WEBUSER}:${WEBUSER} /data/noslice.dict 2>/dev/null || true
    fi
fi

# Epic/Fortnite CDN cache tuning. The conf at
# /etc/nginx/sites-available/cache.conf.d/24_epicgames.conf carries a literal
# token `EPIC_FORCE_NOSLICE` that is substituted here with the runtime env
# value (default `false`). When the value is `true`, the conf routes Epic CDN
# hosts via `@noslice` proactively.
if [ -f /etc/nginx/sites-available/cache.conf.d/24_epicgames.conf ]; then
    sed -i "s/EPIC_FORCE_NOSLICE/${EPIC_FORCE_NOSLICE:-false}/g" \
        /etc/nginx/sites-available/cache.conf.d/24_epicgames.conf
fi
