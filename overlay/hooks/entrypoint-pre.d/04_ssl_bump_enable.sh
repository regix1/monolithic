#!/bin/bash
# Enable nginx SSL termination for HTTPS caching
# This uses pure nginx instead of Squid for SSL termination

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    # Ensure SSL bump services are disabled
    rm -f /etc/supervisor/conf.d/ssl-bump-info.conf 2>/dev/null
    rm -f /etc/nginx/sites-enabled/15_ssl_cache.conf 2>/dev/null
    exit 0
fi

echo "Enabling nginx SSL termination for HTTPS caching..."

# Enable SSL bump info display
if [[ -f /etc/supervisor/conf.d/ssl-bump-info.conf.disabled ]]; then
    cp /etc/supervisor/conf.d/ssl-bump-info.conf.disabled /etc/supervisor/conf.d/ssl-bump-info.conf
fi

# Make scripts executable
chmod +x /scripts/ssl-bump-info.sh 2>/dev/null || true

# Create bump-domains.txt placeholder if it doesn't exist yet
# (will be populated by 16_ssl_bump_domains.sh)
mkdir -p /etc/nginx/ssl-bump
touch /etc/nginx/ssl-bump/bump-domains.txt

# Update nginx stream config to route HTTPS to nginx SSL termination
# We use nginx's ssl module instead of Squid for SSL termination because
# Squid intercept/tproxy mode requires kernel-level NAT/TPROXY support
# which isn't available when nginx proxies via proxy_pass
if [[ -f /etc/nginx/stream-enabled/10_sni.conf ]]; then
    echo "Updating nginx to route HTTPS through nginx SSL termination..."

    # Create new stream config that routes bump domains to nginx SSL termination
    # and splices (passes through) everything else
    cat > /etc/nginx/stream-enabled/10_sni.conf << 'EOF'
# SSL Bump mode via nginx SSL termination
# Route HTTPS traffic based on SNI: bump domains to SSL termination, others passthrough

# Map to determine if we should bump (terminate SSL) or splice (passthrough)
map $ssl_preread_server_name $ssl_backend {
    # Include generated bump domain mappings
    include /etc/nginx/ssl-bump/stream-map.conf;
    # Default: passthrough to original destination
    default passthrough;
}

# Map backend name to actual address
map $ssl_backend $ssl_upstream {
    # bump = nginx SSL termination on port 8443
    bump 127.0.0.1:8443;
    # passthrough = original destination
    passthrough $ssl_preread_server_name:443;
}

server {
    listen 443;
    resolver UPSTREAM_DNS ipv6=off;

    ssl_preread on;
    proxy_pass $ssl_upstream;

    access_log /data/logs/stream-access.log stream_basic;
    error_log /data/logs/stream-error.log;
}
EOF
fi

# Create empty map file (will be populated by 18_ssl_bump_nginx_map.sh after domains are detected)
mkdir -p /etc/nginx/ssl-bump
touch /etc/nginx/ssl-bump/stream-map.conf

# Enable SSL cache nginx config
if [[ -f /etc/nginx/sites-available/15_ssl_cache.conf ]]; then
    ln -sf /etc/nginx/sites-available/15_ssl_cache.conf /etc/nginx/sites-enabled/15_ssl_cache.conf 2>/dev/null || true
fi

# Create SSL access log
touch /data/logs/ssl-access.log 2>/dev/null || true
chown nginx:nginx /data/logs/ssl-access.log 2>/dev/null || true

echo "SSL bump proxy enabled - HTTPS traffic will be decrypted and cached"
