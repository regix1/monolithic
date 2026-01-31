#!/bin/bash
# Generate upstream keepalive pools and maps from cache_domains.json
# This enables HTTP/1.1 connection pooling to CDN servers for improved throughput

set -e

# Logging helper
log() {
    echo "[upstream-keepalive] $1"
}

log_error() {
    echo "[upstream-keepalive] ERROR: $1" >&2
}

# Exit early if feature is disabled (default behavior)
if [[ "${ENABLE_UPSTREAM_KEEPALIVE:-false}" != "true" ]]; then
    log "Disabled (set ENABLE_UPSTREAM_KEEPALIVE=true to enable)"
    # Create passthrough map so $upstream_name always exists
    cat > /etc/nginx/conf.d/35_upstream_maps.conf << 'EOF'
# Upstream keepalive disabled - passthrough map
map $http_host $upstream_name {
    default $host;
}
EOF
    exit 0
fi

log "Generating upstream keepalive pools from cache_domains.json..."

# Validate UPSTREAM_DNS is set (required for DNS resolution to avoid loop-back)
if [[ -z "${UPSTREAM_DNS}" ]]; then
    log_error "UPSTREAM_DNS must be set for upstream keepalive to work"
    exit 1
fi

# Extract first DNS server for dig queries (UPSTREAM_DNS can contain multiple separated by spaces)
DNS_SERVER="${UPSTREAM_DNS%% *}"
log "Using DNS resolver: ${DNS_SERVER}"

# Setup temp files
TEMP_PATH=$(mktemp -d)
MAPS_TMP_FILE="${TEMP_PATH}/35_upstream_maps.conf"
POOLS_TMP_FILE="${TEMP_PATH}/40_upstream_pools.conf"
CREATED_UPSTREAMS_FILE="${TEMP_PATH}/created_upstreams.txt"

# Cleanup trap - ensures temp files are removed on error or exit
cleanup() {
    rm -rf "${TEMP_PATH:-}"
}
trap cleanup EXIT

# Keepalive pool settings
KEEPALIVE_CONNECTIONS="${UPSTREAM_KEEPALIVE_CONNECTIONS:-16}"
KEEPALIVE_TIMEOUT="${UPSTREAM_KEEPALIVE_TIMEOUT:-5m}"
KEEPALIVE_REQUESTS="${UPSTREAM_KEEPALIVE_REQUESTS:-10000}"

# Function to resolve a domain to IPs using UPSTREAM_DNS
# Returns all IPv4 addresses (up to 5) for load balancing
resolve_domain() {
    local domain="$1"
    
    # Skip wildcard domains - they cannot be resolved
    [[ "${domain}" == \** ]] && return
    
    # Skip empty domains
    [[ -z "${domain}" ]] && return
    
    # Use dig with explicit DNS server to avoid loop-back through cache
    # Return all IPs (up to 5) for failover/load balancing
    dig +short +timeout=2 +tries=2 "@${DNS_SERVER}" "${domain}" A 2>/dev/null | \
        grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -5
}

# Function to sanitize domain name for use as upstream name
sanitize_upstream_name() {
    local domain="$1"
    # Replace dots and hyphens with underscores
    echo "${domain}" | sed -e 's/\./_/g' -e 's/-/_/g'
}

# Change to cachedomains directory
cd /data/cachedomains

# Validate cache_domains.json exists and is valid JSON
if [[ ! -f cache_domains.json ]]; then
    log_error "cache_domains.json not found in /data/cachedomains"
    exit 1
fi

if ! jq empty cache_domains.json 2>/dev/null; then
    log_error "cache_domains.json is not valid JSON"
    exit 1
fi

# Initialize tracking file
touch "${CREATED_UPSTREAMS_FILE}"

# Initialize pools file with header
cat > "${POOLS_TMP_FILE}" << EOF
# Auto-generated upstream pools with keepalive
# Generated from cache_domains.json at $(date)
# DNS resolver used: ${DNS_SERVER}

EOF

# Initialize maps file with header - using composite key like 30_maps.conf
cat > "${MAPS_TMP_FILE}" << 'EOF'
# Map hostnames to upstream pools for keepalive routing
# Uses same composite key format as cacheidentifier map

map "$http_user_agent£££$http_host" $upstream_name {
    default $host;  # Fallback to direct proxy for unmapped domains
EOF

# Process each cache entry in cache_domains.json
# Using process substitution to avoid subshell variable scope issues
while read -r CACHE_ENTRY; do
    CACHE_IDENTIFIER=$(jq -r ".cache_domains[${CACHE_ENTRY}].name" cache_domains.json)
    
    log "Processing: ${CACHE_IDENTIFIER}"
    
    # Get all domain files for this cache entry
    while read -r DOMAIN_FILE; do
        [[ ! -f "${DOMAIN_FILE}" ]] && continue
        
        # Process each domain in the file
        while IFS= read -r DOMAIN || [[ -n "${DOMAIN}" ]]; do
            # Clean up the domain - remove whitespace, skip comments and empty lines
            DOMAIN=$(tr -d '[:space:]' <<< "${DOMAIN}")
            [[ -z "${DOMAIN}" || "${DOMAIN}" == \#* ]] && continue
            
            # Skip wildcard domains - they can't be resolved
            if [[ "${DOMAIN}" == \** ]]; then
                log "  Skipping wildcard: ${DOMAIN}"
                continue
            fi
            
            # Generate upstream name from domain
            UPSTREAM_NAME="lancache_$(sanitize_upstream_name "${DOMAIN}")"
            
            # Skip if we already created this upstream
            if grep -q "^${UPSTREAM_NAME}$" "${CREATED_UPSTREAMS_FILE}" 2>/dev/null; then
                continue
            fi
            
            # Resolve the domain - get all IPs for failover
            RESOLVED_IPS=$(resolve_domain "${DOMAIN}")
            
            if [[ -z "${RESOLVED_IPS}" ]]; then
                log "  Failed to resolve: ${DOMAIN}"
                continue
            fi
            
            # Count IPs for logging
            IP_COUNT=$(wc -l <<< "${RESOLVED_IPS}")
            log "  Resolved ${DOMAIN} -> ${IP_COUNT} IP(s)"
            
            # Create upstream block with all resolved IPs
            {
                echo "upstream ${UPSTREAM_NAME} {"
                while read -r IP; do
                    echo "    server ${IP} max_fails=3 fail_timeout=30s;  # ${DOMAIN}"
                done <<< "${RESOLVED_IPS}"
                echo "    keepalive ${KEEPALIVE_CONNECTIONS};"
                echo "    keepalive_requests ${KEEPALIVE_REQUESTS};"
                echo "    keepalive_timeout ${KEEPALIVE_TIMEOUT};"
                echo "}"
                echo ""
            } >> "${POOLS_TMP_FILE}"
            
            # Add map entry - using regex pattern like 30_maps.conf
            # Include optional port matching (:[0-9]+)?
            REGEX_DOMAIN=$(sed -e 's/\./\\./g' <<< "${DOMAIN}")
            
            if [[ "${CACHE_IDENTIFIER}" == "steam" ]]; then
                # Steam: use user-agent based detection pattern
                echo "    ~Valve\\/Steam\\ HTTP\\ Client\\ 1\\.0£££.*${REGEX_DOMAIN}(:[0-9]+)?\$ ${UPSTREAM_NAME};" >> "${MAPS_TMP_FILE}"
            else
                # Non-Steam: match by host only (any user-agent)
                echo "    ~.*£££${REGEX_DOMAIN}(:[0-9]+)?\$ ${UPSTREAM_NAME};" >> "${MAPS_TMP_FILE}"
            fi
            
            # Mark upstream as created
            echo "${UPSTREAM_NAME}" >> "${CREATED_UPSTREAMS_FILE}"
            
        done < "${DOMAIN_FILE}"
    done < <(jq -r ".cache_domains[${CACHE_ENTRY}].domain_files | to_entries[] | .value" cache_domains.json)
done < <(jq -r '.cache_domains | to_entries[] | .key' cache_domains.json 2>/dev/null)

# Close the map block
echo "}" >> "${MAPS_TMP_FILE}"

# Validate generated config before installing
log "Validating generated configuration..."
cp "${MAPS_TMP_FILE}" /etc/nginx/conf.d/35_upstream_maps.conf.new
cp "${POOLS_TMP_FILE}" /etc/nginx/conf.d/40_upstream_pools.conf.new

if nginx -t 2>&1; then
    # Config is valid, install it
    mv /etc/nginx/conf.d/35_upstream_maps.conf.new /etc/nginx/conf.d/35_upstream_maps.conf
    mv /etc/nginx/conf.d/40_upstream_pools.conf.new /etc/nginx/conf.d/40_upstream_pools.conf
    log "Generated upstream keepalive configuration:"
    log "  Maps: /etc/nginx/conf.d/35_upstream_maps.conf"
    log "  Pools: /etc/nginx/conf.d/40_upstream_pools.conf"
    
    # Count upstreams created
    UPSTREAM_COUNT=$(wc -l < "${CREATED_UPSTREAMS_FILE}")
    log "  Total upstream pools: ${UPSTREAM_COUNT}"
else
    log_error "Generated configuration failed nginx validation"
    rm -f /etc/nginx/conf.d/*.conf.new
    exit 1
fi
