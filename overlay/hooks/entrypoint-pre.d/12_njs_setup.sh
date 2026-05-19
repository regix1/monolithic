#!/bin/bash
# 12_njs_setup.sh — runtime template substitution for the njs-owned configs.
#
# The periodics conf and
# (in future) other njs-adjacent files carry template tokens that need to be
# resolved at container start because the underlying env vars are user-set:
#
#   BEAT_TIME              — heartbeat js_periodic interval
#   NOSLICE_SCAN_INTERVAL  — error-log scanner js_periodic interval
#
# This hook runs before nginx is started (entrypoint-pre.d/*). It is a tiny
# sed pass, NOT a background script — no subprocess churn at request time.
#
# Reads:  /etc/nginx/sites-available/50_njs_periodics.conf (template)
# Writes: same file, in-place
#
# Idempotent: tokens are matched as full words so re-running on a substituted
# file is a no-op (the value won't match the token regex).

set -e

PERIODICS_CONF=/etc/nginx/sites-available/50_njs_periodics.conf

if [[ ! -f "${PERIODICS_CONF}" ]]; then
    echo "[12_njs_setup] WARNING: ${PERIODICS_CONF} missing — njs periodics will not be scheduled"
    exit 0
fi

# Defaults mirror the ENV defaults baked into the Dockerfile. The values are
# only used when an operator runs an older image with a newer overlay; under
# normal use the Dockerfile ENV defaults take effect first.
BEAT_TIME=${BEAT_TIME:-1h}
NOSLICE_SCAN_INTERVAL=${NOSLICE_SCAN_INTERVAL:-10s}

# Validate format — nginx parses "1h", "30s", "5m". Reject anything else loudly
# so the failure message is here, not in a confusing nginx -t error.
if ! [[ "${BEAT_TIME}" =~ ^[0-9]+[smhd]?$ ]]; then
    echo "[12_njs_setup] ERROR: BEAT_TIME='${BEAT_TIME}' is not a valid nginx time value" >&2
    exit 1
fi
if ! [[ "${NOSLICE_SCAN_INTERVAL}" =~ ^[0-9]+[smhd]?$ ]]; then
    echo "[12_njs_setup] ERROR: NOSLICE_SCAN_INTERVAL='${NOSLICE_SCAN_INTERVAL}' is not a valid nginx time value" >&2
    exit 1
fi

# Word-boundary anchored substitution so we never accidentally rewrite a
# comment that happens to contain the token name.
sed -i \
    -e "s/\\bBEAT_TIME\\b/${BEAT_TIME}/g" \
    -e "s/\\bNOSLICE_SCAN_INTERVAL\\b/${NOSLICE_SCAN_INTERVAL}/g" \
    "${PERIODICS_CONF}"

echo "[12_njs_setup] njs periodics configured: BEAT_TIME=${BEAT_TIME} NOSLICE_SCAN_INTERVAL=${NOSLICE_SCAN_INTERVAL}"
