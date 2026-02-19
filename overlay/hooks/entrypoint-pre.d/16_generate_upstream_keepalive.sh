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

# Optional: comma-separated cache identifiers to always exclude (overrides auto-detection for those).
# Leave unset to rely only on multi-CDN auto-detection.
UPSTREAM_KEEPALIVE_EXCLUDE="${UPSTREAM_KEEPALIVE_EXCLUDE:-}"

# Auto-exclude caches that use many distinct CDN base domains (e.g. Epic: epicgames.com + akamaized.net +
# fastly-edge.com). Such caches often fail with keepalive because: (1) CDNs do host-based routing and
# fixed upstream IPs + Host header can time out (lancachenet/monolithic#192); (2) nginx closes keepalive
# when proxy_intercept_errors + error_page handle 302 (nginx #2388/#2033). Exclude when distinct bases >= this.
UPSTREAM_KEEPALIVE_MAX_BASE_DOMAINS="${UPSTREAM_KEEPALIVE_MAX_BASE_DOMAINS:-3}"

# Returns the "base domain" (last two dot-separated parts) for a hostname, e.g. download.epicgames.com -> epicgames.com
get_base_domain() {
    local host="$1"
    echo "$host" | awk -F. '{ if (NF >= 2) print $(NF-1)"."$NF; else print $0 }'
}

# Count distinct base domains for a cache entry (by index). Used to detect multi-CDN / redirect-heavy caches.
count_distinct_base_domains() {
    local cache_entry="$1"
    local bases=""
    while read -r DOMAIN_FILE; do
        [[ ! -f "${DOMAIN_FILE}" ]] && continue
        while IFS= read -r domain || [[ -n "${domain}" ]]; do
            domain=$(tr -d '[:space:]' <<< "${domain}")
            [[ -z "${domain}" || "${domain}" == \#* || "${domain}" == \** ]] && continue
            base=$(get_base_domain "$domain")
            [[ -n "$base" ]] && bases="$bases $base"
        done < "${DOMAIN_FILE}"
    done < <(jq -r ".cache_domains[${cache_entry}].domain_files | to_entries[] | .value" cache_domains.json 2>/dev/null)
    echo "$bases" | tr ' ' '\n' | sort -u | grep -c . 2>/dev/null || echo "0"
}

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

# Returns 0 if the given cache identifier is in the explicit exclude list (comma-separated)
is_in_exclude_list() {
    local id="$1"
    local list="${UPSTREAM_KEEPALIVE_EXCLUDE}"
    [[ -z "$list" ]] && return 1
    local i
    for i in $(echo "$list" | tr ',' ' '); do
        i="${i#"${i%%[![:space:]]*}"}"
        i="${i%"${i##*[![:space:]]}"}"
        [[ "$i" == "$id" ]] && return 0
    done
    return 1
}

# Process each cache entry in cache_domains.json
# Using process substitution to avoid subshell variable scope issues
while read -r CACHE_ENTRY; do
    CACHE_IDENTIFIER=$(jq -r ".cache_domains[${CACHE_ENTRY}].name" cache_domains.json)
    
    if is_in_exclude_list "$CACHE_IDENTIFIER"; then
        log "Skipping ${CACHE_IDENTIFIER} (in UPSTREAM_KEEPALIVE_EXCLUDE; will use direct proxy)"
        continue
    fi

    # Auto-detect multi-CDN caches: many distinct base domains => redirects between hosts => keepalive often fails
    distinct_bases=$(count_distinct_base_domains "$CACHE_ENTRY")
    max_bases="${UPSTREAM_KEEPALIVE_MAX_BASE_DOMAINS:-3}"
    if [[ -n "$distinct_bases" && "$distinct_bases" -ge "$max_bases" ]] 2>/dev/null; then
        log "Skipping ${CACHE_IDENTIFIER} (${distinct_bases} distinct CDN base domains >= ${max_bases}; will use direct proxy)"
        continue
    fi
    
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

# Install generated config files (must be installed before nginx -t can validate)
log "Installing generated configuration..."
cp "${MAPS_TMP_FILE}" /etc/nginx/conf.d/35_upstream_maps.conf
cp "${POOLS_TMP_FILE}" /etc/nginx/conf.d/40_upstream_pools.conf

# Ensure cache directory is owned by nginx user so nginx -t does not fail with chown(..., WEBUSER) Operation not permitted
if [[ -d /data/cache/cache ]]; then
    CURRENT_UID=$(stat -c '%u' /data/cache/cache 2>/dev/null || echo "")
    WANTED_UID=$(id -u ${WEBUSER} 2>/dev/null || echo "")
    if [[ -n "$WANTED_UID" && "$CURRENT_UID" != "$WANTED_UID" ]]; then
        if ! chown ${WEBUSER}:${WEBUSER} /data/cache/cache /data/cache/CONFIGHASH 2>/dev/null; then
            log_error "Cache directory /data/cache/cache must be owned by ${WEBUSER} (UID ${WANTED_UID}). chown failed."
            log_error "On the host run: chown -R ${WANTED_UID}:$(id -g ${WEBUSER}) <path_to_cache_volume>"
            rm -f /etc/nginx/conf.d/35_upstream_maps.conf /etc/nginx/conf.d/40_upstream_pools.conf
            exit 1
        fi
    fi
fi

# Validate the complete nginx configuration
log "Validating nginx configuration..."
if nginx -t 2>&1; then
    log "Generated upstream keepalive configuration:"
    log "  Maps: /etc/nginx/conf.d/35_upstream_maps.conf"
    log "  Pools: /etc/nginx/conf.d/40_upstream_pools.conf"

    # Count upstreams created
    UPSTREAM_COUNT=$(wc -l < "${CREATED_UPSTREAMS_FILE}")
    log "  Total upstream pools: ${UPSTREAM_COUNT}"
else
    log_error "Generated configuration failed nginx validation"
    # Rollback: remove the installed files
    rm -f /etc/nginx/conf.d/35_upstream_maps.conf /etc/nginx/conf.d/40_upstream_pools.conf
    exit 1
fi
