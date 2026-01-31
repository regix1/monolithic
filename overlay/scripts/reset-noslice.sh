#!/bin/bash
# Reset the noslice blocklist and failure counts

set -e

echo "Resetting noslice blocklist..."

# Reset failure counts
echo '{}' > /data/noslice-state.json

# Keep header lines, remove host entries
if [[ -f /data/noslice-hosts.map ]]; then
    head -5 /data/noslice-hosts.map > /tmp/noslice-map.tmp
    mv /tmp/noslice-map.tmp /data/noslice-hosts.map
fi

# Test nginx config before reloading
if nginx -t 2>/dev/null; then
    nginx -s reload
    echo "Done. Blocklist cleared and nginx reloaded."
else
    echo "Done. Blocklist cleared. Nginx reload skipped (config test failed)."
fi
