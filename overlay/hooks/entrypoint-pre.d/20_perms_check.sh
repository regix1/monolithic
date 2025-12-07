#!/bin/bash
if [[ "$SKIP_PERMS_CHECK" == "true" ]]; then
    echo "Skipping permissions check (SKIP_PERMS_CHECK=true)"
    exit 0
fi

if [ -d "/data/cache/cache" ]; then
    echo "Running fast permissions check"
    # Check if the web user can actually read and write to the cache directory
    # This is more accurate than ownership checks for storage backends that don't support ownership changes
    PERMISSION_ISSUES=$(su - ${WEBUSER} -s /bin/sh -c 'find /data/cache/cache -maxdepth 1 -mindepth 1 \( ! -readable -o ! -writable \) 2>/dev/null' | head -5)

    if [[ -n "$PERMISSION_ISSUES" ]]; then
        echo "Warning: Some files in /data/cache/cache are not readable/writable by ${WEBUSER}"
        echo "Files with permission issues:"
        echo "$PERMISSION_ISSUES"
        if [[ "$FORCE_PERMS_CHECK" == "true" ]]; then
            echo "FORCE_PERMS_CHECK=true, attempting to fix permissions..."
            echo "Doing full checking of permissions (This WILL take a long time on large caches)..."
            find /data \! -user ${WEBUSER} -exec chown ${WEBUSER}:${WEBUSER} '{}' + 2>/dev/null || true
            echo "Permissions fix attempted"
        else
            echo "To fix, either:"
            echo "  1. Run on the host: chown -R $(id -u ${WEBUSER}):$(id -g ${WEBUSER}) /path/to/cache"
            echo "  2. Set FORCE_PERMS_CHECK=true to attempt automatic fix"
        fi
    else
        echo "Permissions ok"
    fi
fi
