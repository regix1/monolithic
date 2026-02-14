#!/bin/bash
# log-watcher.sh - Auto-detect when nginx log files are replaced or deleted
# and signal nginx to reopen them. This allows monolithic to self-heal without
# depending on external tools to send USR1 signals.
#
# How it works:
#   - Tracks the inode of each log file
#   - Every WATCH_INTERVAL seconds, checks if the inode changed or file vanished
#   - If so, runs "nginx -s reopen" which tells nginx to close its old file
#     descriptor and open a fresh one at the same path
#
# This does NOT interfere with external log processors:
#   - nginx -s reopen only changes nginx's own file descriptor
#   - Any process already reading the old file continues unaffected
#   - New log entries flow into the new/recreated file immediately

WATCH_INTERVAL=${LOG_WATCH_INTERVAL:-30}
LOG_DIR="/data/logs"
LOG_FILES=()

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [log-watcher] $1"
}

declare -A LAST_INODES

discover_logs() {
    LOG_FILES=()
    for f in "$LOG_DIR"/*.log; do
        [[ -f "$f" ]] && LOG_FILES+=("$f")
    done
}

init_inodes() {
    for f in "${LOG_FILES[@]}"; do
        if [[ -f "$f" ]]; then
            LAST_INODES["$f"]=$(stat -c %i "$f" 2>/dev/null || echo "")
        else
            LAST_INODES["$f"]=""
        fi
    done
}

check_logs() {
    local needs_reopen=false

    for f in "${LOG_FILES[@]}"; do
        local last_inode="${LAST_INODES[$f]:-}"

        if [[ -f "$f" ]]; then
            local current_inode
            current_inode=$(stat -c %i "$f" 2>/dev/null || echo "")

            if [[ -n "$last_inode" && -n "$current_inode" && "$current_inode" != "$last_inode" ]]; then
                log "Inode changed for $f ($last_inode -> $current_inode)"
                needs_reopen=true
            fi
            LAST_INODES["$f"]="$current_inode"
        else
            if [[ -n "$last_inode" ]]; then
                log "File deleted: $f"
                needs_reopen=true
                LAST_INODES["$f"]=""
            fi
        fi
    done

    if $needs_reopen; then
        log "Signaling nginx to reopen log files"
        if nginx -s reopen 2>/dev/null; then
            log "Nginx log reopen successful"
        else
            log "Nginx log reopen failed (nginx may not be running yet)"
        fi
        sleep 1
        init_inodes
    fi
}

discover_logs
log "Starting (interval: ${WATCH_INTERVAL}s, dir: ${LOG_DIR}, files: ${LOG_FILES[*]})"
init_inodes

SCAN_COUNT=0
while true; do
    sleep "$WATCH_INTERVAL"
    # Re-discover log files every 10 cycles in case new ones appear
    SCAN_COUNT=$((SCAN_COUNT + 1))
    if (( SCAN_COUNT % 10 == 0 )); then
        discover_logs
        init_inodes
    fi
    check_logs
done
