#!/bin/bash
# Monitor Squid SSL bump failures and add failing domains to splice list
# Domains that repeatedly fail SSL bump (e.g., certificate pinning) will be bypassed

SQUID_LOG="/data/logs/squid-cache.log"
SPLICE_FILE="/etc/squid/splice-domains.txt"
FAILURE_CACHE="/data/ssl/ssl-failures.txt"
MAX_FAILURES="${SSL_BUMP_MAX_FAILURES:-3}"
CHECK_INTERVAL="${SSL_BUMP_CHECK_INTERVAL:-30}"

# Ensure files exist
touch "${SPLICE_FILE}" "${FAILURE_CACHE}"

echo "SSL bump monitor started (max failures: ${MAX_FAILURES}, check interval: ${CHECK_INTERVAL}s)"

# Track position in log file
LAST_POS=0

while true; do
    sleep "${CHECK_INTERVAL}"

    # Check if log file exists
    if [[ ! -f "${SQUID_LOG}" ]]; then
        continue
    fi

    # Get current file size
    CURRENT_SIZE=$(stat -c%s "${SQUID_LOG}" 2>/dev/null || echo "0")

    # If file was truncated/rotated, reset position
    if [[ "${CURRENT_SIZE}" -lt "${LAST_POS}" ]]; then
        LAST_POS=0
    fi

    # Read new lines from log
    NEW_ERRORS=$(tail -c +$((LAST_POS + 1)) "${SQUID_LOG}" 2>/dev/null | \
        grep -iE "ssl|tls|certificate|handshake|bump" | \
        grep -iE "error|fail|reject|denied|abort" | \
        grep -oE "([a-zA-Z0-9][-a-zA-Z0-9]*\.)+[a-zA-Z]{2,}" | \
        sort -u)

    LAST_POS="${CURRENT_SIZE}"

    # Process any new errors
    if [[ -n "${NEW_ERRORS}" ]]; then
        while IFS= read -r domain; do
            [[ -z "$domain" ]] && continue

            # Skip if already in splice list
            if grep -qxF "$domain" "${SPLICE_FILE}" 2>/dev/null; then
                continue
            fi

            # Count failures for this domain
            FAIL_COUNT=$(grep -cxF "$domain" "${FAILURE_CACHE}" 2>/dev/null || echo "0")
            FAIL_COUNT=$((FAIL_COUNT + 1))

            # Add to failure cache
            echo "$domain" >> "${FAILURE_CACHE}"

            echo "SSL error detected for ${domain} (failure ${FAIL_COUNT}/${MAX_FAILURES})"

            # If max failures reached, add to splice list
            if [[ "${FAIL_COUNT}" -ge "${MAX_FAILURES}" ]]; then
                echo "Adding ${domain} to SSL bypass list (too many failures)"
                echo "$domain" >> "${SPLICE_FILE}"

                # Also save to persistent storage
                echo "$domain" >> /data/ssl/splice-domains.txt
                sort -u /data/ssl/splice-domains.txt -o /data/ssl/splice-domains.txt

                # Remove from failure cache (no longer needed)
                grep -vxF "$domain" "${FAILURE_CACHE}" > "${FAILURE_CACHE}.tmp" 2>/dev/null
                mv "${FAILURE_CACHE}.tmp" "${FAILURE_CACHE}" 2>/dev/null || true

                # Reload Squid to pick up new splice list
                if command -v squid &>/dev/null; then
                    squid -k reconfigure 2>/dev/null || true
                fi
            fi
        done <<< "${NEW_ERRORS}"
    fi
done
