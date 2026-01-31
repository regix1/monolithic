#!/bin/sh
echo "Verifying nginx configuration..."

if ! /usr/sbin/nginx -t; then
    echo "ERROR: nginx configuration test failed"
    exit 1
fi

echo "Config check successful"

echo "Ready for supervisord startup"
if [ -n "$CACHE_ROOT" ]
then
    echo "Monitor ${CACHE_ROOT}/logs/access.log and ${CACHE_ROOT}/logs/error.log on the host for cache activity"
else
    echo "Monitor access.log and error.log on the host for cache activity"
fi
