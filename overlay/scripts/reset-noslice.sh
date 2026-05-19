#!/bin/sh
# Reset the noslice blocklist via the internal HTTP endpoint.
#
# The state lives in the njs `lancache` shared-dict zone (see
# overlay/etc/nginx/conf.d/05_njs.conf). This script is a thin wrapper around
# `POST /lancache-internal/noslice/reset` on the internal :8080 server, which
# clears the in-memory dict and removes the persisted state file.
#
# Intended UX: `docker exec <container> /scripts/reset-noslice.sh`

set -eu

ENDPOINT="${NOSLICE_RESET_ENDPOINT:-http://127.0.0.1:8080/lancache-internal/noslice/reset}"

echo "Resetting noslice blocklist via ${ENDPOINT}..."

# Prefer curl; fall back to wget. Both ship in nginx:alpine via apk in the
# Dockerfile. Output the response body so the caller can confirm success.
if command -v curl >/dev/null 2>&1; then
    HTTP_STATUS=$(curl -sS -o /tmp/noslice-reset.out -w '%{http_code}' \
        -X POST -H 'Content-Type: application/json' \
        --connect-timeout 5 --max-time 10 \
        "${ENDPOINT}")
    BODY=$(cat /tmp/noslice-reset.out 2>/dev/null || true)
    rm -f /tmp/noslice-reset.out
elif command -v wget >/dev/null 2>&1; then
    # busybox wget: -q quiet, -O- to stdout, --post-data to force POST
    BODY=$(wget -q -O- --post-data='' \
        --header='Content-Type: application/json' \
        --timeout=10 \
        "${ENDPOINT}" 2>&1) || HTTP_STATUS="000"
    HTTP_STATUS="${HTTP_STATUS:-200}"
else
    echo "ERROR: neither curl nor wget is available — cannot reach the reset endpoint." >&2
    exit 2
fi

if [ "${HTTP_STATUS}" = "200" ] || [ "${HTTP_STATUS}" = "204" ]; then
    if [ -n "${BODY}" ]; then
        echo "${BODY}"
    fi
    echo "Done. Noslice blocklist cleared (no nginx reload required)."
    exit 0
else
    echo "ERROR: reset endpoint returned HTTP ${HTTP_STATUS}" >&2
    if [ -n "${BODY}" ]; then
        echo "${BODY}" >&2
    fi
    exit 1
fi
