#!/bin/bash
# refresh_upstreams.sh - Periodically refresh upstream DNS for keepalive connections
#
# This script re-runs the upstream generation hook to update IP addresses
# as CDN DNS records change. Nginx is only reloaded when changes are detected.

set -e

LOCK_FILE="/tmp/refresh-upstreams.lock"
GENERATOR_SCRIPT="/hooks/entrypoint-pre.d/16_generate_upstream_keepalive.sh"

# Runtime state
SHUTDOWN_REQUESTED=false

# Signal handlers for graceful shutdown
handle_shutdown() {
    log "Shutdown signal received"
    SHUTDOWN_REQUESTED=true
}
trap handle_shutdown SIGTERM SIGINT

# Logging helper
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [upstream-refresh] $1"
}

# Convert interval to seconds (supports: 30s, 5m, 1h, 1d)
interval_to_seconds() {
    local interval="$1"
    local num="${interval%[smhd]}"
    local unit="${interval: -1}"
    
    case "$unit" in
        s) echo "$num" ;;
        m) echo $((num * 60)) ;;
        h) echo $((num * 3600)) ;;
        d) echo $((num * 86400)) ;;
        *) echo "$interval" ;;  # Assume seconds if no unit
    esac
}

# Cleanup on exit
cleanup() {
    rm -f "$LOCK_FILE"
    log "Stopped"
}
trap cleanup EXIT

# Atomic lock acquisition using flock
acquire_lock() {
    exec 200>"$LOCK_FILE"
    if ! flock -n 200 2>/dev/null; then
        log "Another instance is already running"
        exit 1
    fi
    echo $$ > "$LOCK_FILE"
    log "Lock acquired (PID: $$)"
}

# Wait for nginx to be running before starting refresh loop
wait_for_nginx() {
    local max_wait=60
    local waited=0
    
    while ! pgrep -x "nginx" > /dev/null 2>&1; do
        if [[ $waited -ge $max_wait ]]; then
            log "ERROR: Nginx did not start within ${max_wait}s"
            return 1
        fi
        log "Waiting for nginx to start..."
        sleep 5
        waited=$((waited + 5))
    done
    
    log "Nginx is running"
    return 0
}

# Check if nginx is running before attempting reload
reload_nginx() {
    # Check if nginx master process is running
    if ! pgrep -x "nginx" > /dev/null 2>&1; then
        log "WARNING: Nginx is not running, skipping reload"
        return 1
    fi
    
    log "Testing nginx configuration..."
    if nginx -t 2>&1; then
        log "Reloading nginx..."
        if nginx -s reload 2>&1; then
            log "Nginx reloaded successfully"
            return 0
        else
            log "ERROR: Nginx reload command failed"
            return 1
        fi
    else
        log "ERROR: Nginx config test failed, not reloading"
        return 1
    fi
}

# Interruptible sleep for graceful shutdown
interruptible_sleep() {
    local seconds="$1"
    local elapsed=0
    local interval=10  # Check every 10 seconds
    
    while [[ $elapsed -lt $seconds && "$SHUTDOWN_REQUESTED" != "true" ]]; do
        local sleep_time=$((seconds - elapsed < interval ? seconds - elapsed : interval))
        sleep "$sleep_time"
        elapsed=$((elapsed + sleep_time))
    done
    
    [[ "$SHUTDOWN_REQUESTED" != "true" ]]
}

# Regenerate upstream config and reload if changed
refresh_and_reload() {
    local maps_file="/etc/nginx/conf.d/35_upstream_maps.conf"
    local pools_file="/etc/nginx/conf.d/40_upstream_pools.conf"
    local backup_dir="/tmp/upstream-backup-$$"
    
    # Validate required directories/files exist
    if [[ ! -d "/data/cachedomains" ]]; then
        log "ERROR: /data/cachedomains directory not found"
        return 1
    fi
    
    if [[ ! -f "/data/cachedomains/cache_domains.json" ]]; then
        log "ERROR: cache_domains.json not found"
        return 1
    fi
    
    # Create backups before regeneration
    mkdir -p "$backup_dir"
    [[ -f "$maps_file" ]] && cp "$maps_file" "$backup_dir/"
    [[ -f "$pools_file" ]] && cp "$pools_file" "$backup_dir/"
    
    # Save checksums of current configs
    local old_maps_sum=""
    local old_pools_sum=""
    [[ -f "$maps_file" ]] && old_maps_sum=$(md5sum "$maps_file" 2>/dev/null | cut -d' ' -f1)
    [[ -f "$pools_file" ]] && old_pools_sum=$(md5sum "$pools_file" 2>/dev/null | cut -d' ' -f1)
    
    # Regenerate configs
    log "Regenerating upstream configuration..."
    if ! bash "$GENERATOR_SCRIPT" 2>&1; then
        log "ERROR: Failed to regenerate upstream configuration, restoring backups"
        [[ -f "$backup_dir/35_upstream_maps.conf" ]] && cp "$backup_dir/35_upstream_maps.conf" "$maps_file"
        [[ -f "$backup_dir/40_upstream_pools.conf" ]] && cp "$backup_dir/40_upstream_pools.conf" "$pools_file"
        rm -rf "$backup_dir"
        return 1
    fi
    
    rm -rf "$backup_dir"
    
    # Check if configs changed
    local new_maps_sum=""
    local new_pools_sum=""
    [[ -f "$maps_file" ]] && new_maps_sum=$(md5sum "$maps_file" 2>/dev/null | cut -d' ' -f1)
    [[ -f "$pools_file" ]] && new_pools_sum=$(md5sum "$pools_file" 2>/dev/null | cut -d' ' -f1)
    
    if [[ "$old_maps_sum" == "$new_maps_sum" && "$old_pools_sum" == "$new_pools_sum" ]]; then
        log "No upstream changes detected"
        return 0
    fi
    
    log "Upstream configuration changed, reloading nginx..."
    reload_nginx
}

# Main entry point
main() {
    local refresh_interval="${UPSTREAM_REFRESH_INTERVAL:-1h}"
    
    # Check if keepalive is enabled
    if [[ "${ENABLE_UPSTREAM_KEEPALIVE:-false}" != "true" ]]; then
        log "Upstream keepalive not enabled, exiting"
        exit 0
    fi
    
    # Check if refresh is disabled (interval = 0)
    if [[ "$refresh_interval" == "0" ]]; then
        log "Upstream refresh disabled (interval=0), exiting"
        exit 0
    fi
    
    # Validate generator script exists
    if [[ ! -x "$GENERATOR_SCRIPT" ]]; then
        log "ERROR: Generator script not found or not executable: $GENERATOR_SCRIPT"
        exit 1
    fi
    
    # Acquire lock (atomic with flock)
    acquire_lock
    
    # Convert interval to seconds
    local sleep_seconds
    sleep_seconds=$(interval_to_seconds "$refresh_interval")
    log "Started - refresh interval: ${refresh_interval} (${sleep_seconds}s)"
    log "DNS resolver: ${UPSTREAM_DNS}"
    
    # Wait for nginx before entering main loop
    wait_for_nginx || exit 1
    
    # Main loop - sleep first since initial generation happens at startup
    while [[ "$SHUTDOWN_REQUESTED" != "true" ]]; do
        if ! interruptible_sleep "$sleep_seconds"; then
            break
        fi
        refresh_and_reload || true
    done
    
    log "Graceful shutdown complete"
}

main "$@"
