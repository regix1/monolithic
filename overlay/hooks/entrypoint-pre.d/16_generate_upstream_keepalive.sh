#!/bin/bash
# Generate upstream keepalive pools and maps from cache_domains.json
# This enables HTTP/1.1 connection pooling to CDN servers for improved throughput
# Uses nginx native DNS resolution (resolve parameter, nginx 1.27.3+)

set -e

# Logging helper
log() {
    echo "[upstream-keepalive] $1"
}

log_error() {
    echo "[upstream-keepalive] ERROR: $1" >&2
}

# Optional: comma-separated cache identifiers to always exclude from keepalive.
# These caches will use direct proxy instead. Manual escape hatch for problematic CDNs.
UPSTREAM_KEEPALIVE_EXCLUDE="${UPSTREAM_KEEPALIVE_EXCLUDE:-}"

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

# Exit early if feature is disabled (default behavior)
if [[ "${ENABLE_UPSTREAM_KEEPALIVE:-false}" != "true" ]]; then
    log "Disabled (set ENABLE_UPSTREAM_KEEPALIVE=true to enable)"
    cat > /etc/nginx/conf.d/35_upstream_maps.conf << 'EOF'
# Upstream keepalive disabled - passthrough map
map $http_host $upstream_name {
    default $host;
}
EOF
    exit 0
fi

log "Generating upstream keepalive pools from cache_domains.json..."

# Validate UPSTREAM_DNS is set (required for resolver directives in upstream blocks)
if [[ -z "${UPSTREAM_DNS}" ]]; then
    log_error "UPSTREAM_DNS must be set for upstream keepalive to work"
    exit 1
fi

# Normalize DNS separator (allow semicolons like lancache-dns syntax)
UPSTREAM_DNS="$(echo -n "${UPSTREAM_DNS}" | sed 's/[;]/ /g')"

# Extract first DNS server for pre-flight domain checks
DNS_SERVER="${UPSTREAM_DNS%% *}"
log "Using DNS resolver(s): ${UPSTREAM_DNS}"

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

# Pre-flight check: verify a domain resolves before creating an upstream block.
# This avoids noisy "could not be resolved" errors in nginx logs at startup.
# nginx's resolve parameter handles re-resolution at runtime for domains that pass.
domain_exists() {
    local domain="$1"
    dig +short +timeout=2 +tries=1 "@${DNS_SERVER}" "${domain}" A 2>/dev/null | \
        grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
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
# Auto-generated upstream pools with keepalive and native DNS resolution
# Generated from cache_domains.json at $(date)
# DNS resolver(s): ${UPSTREAM_DNS}
# Uses nginx resolve parameter (1.27.3+) for automatic DNS re-resolution

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

    if is_in_exclude_list "$CACHE_IDENTIFIER"; then
        log "Skipping ${CACHE_IDENTIFIER} (in UPSTREAM_KEEPALIVE_EXCLUDE; will use direct proxy)"
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

            # Pre-flight DNS check: skip domains that don't resolve to avoid
            # noisy "could not be resolved" errors in nginx logs at startup.
            # Domains that resolve now get nginx's resolve parameter for runtime re-resolution.
            if ! domain_exists "${DOMAIN}"; then
                log "  Skipping unresolvable: ${DOMAIN}"
                continue
            fi

            log "  Adding upstream: ${DOMAIN}"

            # Create upstream block with native DNS resolution (nginx 1.27.3+)
            # zone: shared memory for cross-worker health tracking and resolve support
            # resolve: nginx re-resolves DNS automatically (replaces dig + refresh service)
            {
                echo "upstream ${UPSTREAM_NAME} {"
                echo "    zone ${UPSTREAM_NAME} 64k;"
                echo "    resolver ${UPSTREAM_DNS} valid=300s ipv6=off;"
                echo "    resolver_timeout 5s;"
                echo "    server ${DOMAIN} resolve max_fails=3 fail_timeout=30s;"
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
