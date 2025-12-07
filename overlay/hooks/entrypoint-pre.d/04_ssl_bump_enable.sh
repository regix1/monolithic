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
mkdir -p /run/squid /var/spool/squid /var/lib/squid
chown -R squid:squid /run/squid /var/spool/squid /var/lib/squid 2>/dev/null || true

# Create squid log files with proper permissions in /data/logs
touch /data/logs/squid-access.log /data/logs/squid-cache.log 2>/dev/null || true
chown squid:squid /data/logs/squid-access.log /data/logs/squid-cache.log 2>/dev/null || true
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

# Update nginx stream config to redirect HTTPS to Squid instead of passthrough
# When SSL bump is enabled, we want Squid to handle HTTPS traffic
if [[ -f /etc/nginx/stream-enabled/10_sni.conf ]]; then
    echo "Updating nginx to route HTTPS through Squid SSL bump..."

    # Create new stream config that routes to Squid
    cat > /etc/nginx/stream-enabled/10_sni.conf << 'EOF'
# SSL Bump mode: Route HTTPS traffic to Squid for decryption
# Squid will decrypt, then forward to nginx port 80 for caching
server {
    listen 443;
    proxy_pass 127.0.0.1:3129;

    access_log /data/logs/stream-access.log stream_basic;
    error_log /data/logs/stream-error.log;
}
EOF
fi

echo "SSL bump proxy enabled - HTTPS traffic will be decrypted and cached"
