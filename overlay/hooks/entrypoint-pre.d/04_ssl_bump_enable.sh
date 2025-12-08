#!/bin/bash
# Enable Squid supervisor config if SSL bump is enabled

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    # Ensure Squid and SSL bump services are disabled
    rm -f /etc/supervisor/conf.d/squid.conf 2>/dev/null
    rm -f /etc/supervisor/conf.d/ssl-bump-info.conf 2>/dev/null
    rm -f /etc/supervisor/conf.d/ssl-bump-monitor.conf 2>/dev/null
    exit 0
fi

echo "Enabling Squid SSL bump proxy..."

# Enable Squid supervisor config
if [[ -f /etc/supervisor/conf.d/squid.conf.disabled ]]; then
    cp /etc/supervisor/conf.d/squid.conf.disabled /etc/supervisor/conf.d/squid.conf
fi

# Enable SSL bump info display
if [[ -f /etc/supervisor/conf.d/ssl-bump-info.conf.disabled ]]; then
    cp /etc/supervisor/conf.d/ssl-bump-info.conf.disabled /etc/supervisor/conf.d/ssl-bump-info.conf
fi

# Enable SSL bump failure monitor
if [[ -f /etc/supervisor/conf.d/ssl-bump-monitor.conf.disabled ]]; then
    cp /etc/supervisor/conf.d/ssl-bump-monitor.conf.disabled /etc/supervisor/conf.d/ssl-bump-monitor.conf
fi

# Create required directories
# Squid runs as nginx user (cache_effective_user) to match file permissions
mkdir -p /run/squid /var/spool/squid /var/lib/squid
chown -R nginx:nginx /run/squid /var/spool/squid /var/lib/squid 2>/dev/null || true

# Create squid log files with proper permissions in /data/logs
touch /data/logs/squid-access.log /data/logs/squid-cache.log 2>/dev/null || true
chown nginx:nginx /data/logs/squid-access.log /data/logs/squid-cache.log 2>/dev/null || true
chmod 644 /data/logs/squid-access.log /data/logs/squid-cache.log 2>/dev/null || true

# Make scripts executable
chmod +x /scripts/ssl-bump-info.sh 2>/dev/null || true
chmod +x /scripts/ssl-bump-monitor.sh 2>/dev/null || true

# Create splice-domains.txt for domains that fail SSL bump (certificate pinning, etc.)
# Load from persistent storage if exists, otherwise start empty
if [[ -f /data/ssl/splice-domains.txt ]]; then
    cp /data/ssl/splice-domains.txt /etc/squid/splice-domains.txt
else
    touch /etc/squid/splice-domains.txt
fi

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
    include /etc/nginx/stream.d/ssl-bump-map.conf;
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

# Generate the SSL bump map from bump-domains.txt
# This maps domain names to "bump" so they get routed to SSL termination
echo "Generating SSL bump domain map..."
mkdir -p /etc/nginx/stream.d

if [[ -f /etc/squid/bump-domains.txt ]]; then
    # Convert bump-domains.txt to nginx map format
    # Each domain gets mapped to "bump"
    > /etc/nginx/stream.d/ssl-bump-map.conf
    while IFS= read -r domain || [[ -n "$domain" ]]; do
        # Skip empty lines and comments
        [[ -z "$domain" || "$domain" =~ ^# ]] && continue
        # Handle wildcard domains (convert .domain.com to ~\.domain\.com$)
        if [[ "$domain" == .* ]]; then
            # Wildcard domain like .gog.cdn.net
            escaped=$(echo "$domain" | sed 's/\./\\./g')
            echo "    ~${escaped}\$ bump;" >> /etc/nginx/stream.d/ssl-bump-map.conf
        else
            # Exact domain
            echo "    ${domain} bump;" >> /etc/nginx/stream.d/ssl-bump-map.conf
        fi
    done < /etc/squid/bump-domains.txt
else
    # Empty map file
    touch /etc/nginx/stream.d/ssl-bump-map.conf
fi

# Enable SSL cache nginx config
if [[ -f /etc/nginx/sites-available/15_ssl_cache.conf ]]; then
    ln -sf /etc/nginx/sites-available/15_ssl_cache.conf /etc/nginx/sites-enabled/15_ssl_cache.conf 2>/dev/null || true
fi

# Create SSL access log
touch /data/logs/ssl-access.log 2>/dev/null || true
chown nginx:nginx /data/logs/ssl-access.log 2>/dev/null || true

echo "SSL bump proxy enabled - HTTPS traffic will be decrypted and cached"
