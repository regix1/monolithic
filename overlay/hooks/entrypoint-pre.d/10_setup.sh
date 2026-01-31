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
        
        # Enable the upstream-refresh supervisor service
        mv /etc/supervisor/conf.d/upstream_refresh.conf.disabled \
           /etc/supervisor/conf.d/upstream_refresh.conf 2>/dev/null || true
        
        # Make refresh script executable
        chmod +x /scripts/refresh_upstreams.sh 2>/dev/null || true
    else
        # Default behavior: direct pass using $host
        sed -i "s/PROXY_PASS_TARGET/\$host/" \
            /etc/nginx/sites-available/upstream.conf.d/30_primary_proxy.conf
    fi
fi

# Handle NOSLICE_FALLBACK - automatic detection and routing of hosts that don't support Range requests
if [[ "${NOSLICE_FALLBACK}" == "true" ]]; then
    echo "Enabling automatic no-slice fallback (threshold: ${NOSLICE_THRESHOLD} failures)"
    
    # Enable nginx configs for noslice routing
    mv /etc/nginx/sites-available/cache.conf.d/15_noslice.conf.disabled \
       /etc/nginx/sites-available/cache.conf.d/15_noslice.conf 2>/dev/null || true
    mv /etc/nginx/sites-available/cache.conf.d/root/05_noslice_routing.conf.disabled \
       /etc/nginx/sites-available/cache.conf.d/root/05_noslice_routing.conf 2>/dev/null || true
    
    # Replace CACHE_MAX_AGE in noslice config
    sed -i "s/CACHE_MAX_AGE/${CACHE_MAX_AGE}/" /etc/nginx/sites-available/cache.conf.d/15_noslice.conf
    
    # Initialize blocklist file if it doesn't exist
    if [[ ! -f /data/noslice-hosts.map ]]; then
        cp /var/noslice-hosts.map /data/noslice-hosts.map
        chown ${WEBUSER}:${WEBUSER} /data/noslice-hosts.map
    fi

    # Point the map include at the live blocklist
    ln -sf /data/noslice-hosts.map /etc/nginx/conf.d/noslice-hosts.map
    
    # Initialize state file if it doesn't exist
    if [[ ! -f /data/noslice-state.json ]]; then
        echo '{}' > /data/noslice-state.json
        chown ${WEBUSER}:${WEBUSER} /data/noslice-state.json
    fi
    
    # Enable the noslice-detector supervisor service
    mv /etc/supervisor/conf.d/noslice-detector.conf.disabled \
       /etc/supervisor/conf.d/noslice-detector.conf 2>/dev/null || true
    
    # Make detector script executable
    chmod +x /scripts/noslice-detector.sh
else
    # Ensure the include file is a harmless stub when noslice is disabled
    rm -f /etc/nginx/conf.d/noslice-hosts.map
    cat > /etc/nginx/conf.d/noslice-hosts.map <<'EOF'
# noslice fallback disabled; map uses only the default value
EOF
fi
