#!/bin/bash
set -e


# This hook runs BEFORE other setup scripts to ensure the web user has correct PUID/PGID
# It must run early so subsequent hooks (like 20_perms_check.sh) use the correct user

# Verify we're running as root (required for user/group modification)
if [ "$(id -u)" != "0" ]; then
    echo "ERROR: PUID/PGID modification requires root privileges"
    exit 1
fi

# Get PUID/PGID from environment (defaults to 1000)
PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Check if user wants to use default IDs
SKIP_PUID=false
SKIP_PGID=false

# Validate PUID - allow "nginx" or "www-data" as special values to keep defaults
if [ "$PUID" = "nginx" ] || [ "$PUID" = "www-data" ]; then
    echo "Using default ${WEBUSER} UID (no modification)"
    SKIP_PUID=true
elif ! [[ "$PUID" =~ ^[0-9]+$ ]]; then
    echo "Warning: PUID '$PUID' is not numeric, using default 1000"
    PUID=1000
fi

# Validate PGID - allow "nginx" or "www-data" as special values to keep defaults
if [ "$PGID" = "nginx" ] || [ "$PGID" = "www-data" ]; then
    echo "Using default ${WEBUSER} GID (no modification)"
    SKIP_PGID=true
elif ! [[ "$PGID" =~ ^[0-9]+$ ]]; then
    echo "Warning: PGID '$PGID' is not numeric, using default 1000"
    PGID=1000
fi

# Get current PUID/PGID of www-data
CURRENT_PUID=$(id -u ${WEBUSER} 2>/dev/null || echo "1000")
CURRENT_PGID=$(id -g ${WEBUSER} 2>/dev/null || echo "1000")

echo "Configuring ${WEBUSER} user with PUID=${PUID} and PGID=${PGID}"

# Only modify if different from current values (avoids unnecessary work on restart)
if [ "$SKIP_PGID" = false ]; then
    if [ "$CURRENT_PGID" != "$PGID" ]; then
        echo "  Changing ${WEBUSER} GID: ${CURRENT_PGID} -> ${PGID}"
        groupmod -o -g "$PGID" ${WEBUSER}
    else
        echo "  GID ${PGID} already set"
    fi
fi

if [ "$SKIP_PUID" = false ]; then
    if [ "$CURRENT_PUID" != "$PUID" ]; then
        echo "  Changing ${WEBUSER} UID: ${CURRENT_PUID} -> ${PUID}"
        usermod -o -u "$PUID" ${WEBUSER}
    else
        echo "  UID ${PUID} already set"
    fi
fi

echo "  User configured: $(id ${WEBUSER})"

# Shallow chown of /data + its top-level subdirs so the (possibly remapped) web
# user can create files like /data/noslice.dict at startup. We deliberately do
# NOT recurse into /data/cache (potentially enormous) — 20_perms_check.sh
# handles deeper cases, and FORCE_PERMS_CHECK=true forces a full recursive fix.
if [ -d /data ]; then
    chown "${WEBUSER}:${WEBUSER}" /data 2>/dev/null || true
    for d in /data/cache /data/logs /data/config /data/info /data/cachedomains; do
        [ -d "$d" ] && chown "${WEBUSER}:${WEBUSER}" "$d" 2>/dev/null || true
    done
    find /data -maxdepth 1 -type f -exec chown "${WEBUSER}:${WEBUSER}" {} + 2>/dev/null || true
fi
