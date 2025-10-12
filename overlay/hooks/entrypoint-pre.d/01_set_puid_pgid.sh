#!/bin/bash
set -e

# This hook runs BEFORE other setup scripts to ensure www-data user has correct PUID/PGID
# It must run early so subsequent hooks (like 20_perms_check.sh) use the correct user

# Verify we're running as root (required for user/group modification)
if [ "$(id -u)" != "0" ]; then
    echo "ERROR: PUID/PGID modification requires root privileges"
    exit 1
fi

# Get PUID/PGID from environment (defaults to 1000)
PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Validate they're numeric
if ! [[ "$PUID" =~ ^[0-9]+$ ]]; then
    echo "Warning: PUID '$PUID' is not numeric, using default 1000"
    PUID=1000
fi
if ! [[ "$PGID" =~ ^[0-9]+$ ]]; then
    echo "Warning: PGID '$PGID' is not numeric, using default 1000"
    PGID=1000
fi

# Get current PUID/PGID of www-data
CURRENT_PUID=$(id -u ${WEBUSER} 2>/dev/null || echo "1000")
CURRENT_PGID=$(id -g ${WEBUSER} 2>/dev/null || echo "1000")

echo "Configuring ${WEBUSER} user with PUID=${PUID} and PGID=${PGID}"

# Only modify if different from current values (avoids unnecessary work on restart)
if [ "$CURRENT_PGID" != "$PGID" ]; then
    echo "  Changing ${WEBUSER} GID: ${CURRENT_PGID} -> ${PGID}"
    groupmod -o -g "$PGID" ${WEBUSER}
else
    echo "  GID ${PGID} already set"
fi

if [ "$CURRENT_PUID" != "$PUID" ]; then
    echo "  Changing ${WEBUSER} UID: ${CURRENT_PUID} -> ${PUID}"
    usermod -o -u "$PUID" ${WEBUSER}
else
    echo "  UID ${PUID} already set"
fi

echo "  User configured: $(id ${WEBUSER})"

# Note: We don't do chown -R here because:
# 1. It's slow on large cache directories
# 2. The existing 20_perms_check.sh hook already handles this intelligently with a fast check
# 3. Use FORCE_PERMS_CHECK=true environment variable if you need a full recursive fix
