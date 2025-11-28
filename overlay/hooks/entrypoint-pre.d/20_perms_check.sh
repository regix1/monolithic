#!/bin/bash
if [[ "$SKIP_PERMS_CHECK" == "true" ]]; then
    echo "Skipping permissions check (SKIP_PERMS_CHECK=true)"
    exit 0
fi

if [ -d "/data/cache/cache" ]; then
	echo "Running fast permissions check"
	ls -l /data/cache/cache | tail --lines=+2 | grep -v ${WEBUSER} > /dev/null

	if [[ $? -eq 0 || "$FORCE_PERMS_CHECK" == "true" ]]; then
		echo "Fixing permissions..."
		chown -R ${WEBUSER}:${WEBUSER} /data
		echo "Permissions ok"
	else
		echo "Fast permissions check successful, if you have any permissions error try running with -e FORCE_PERMS_CHECK = true"
	fi

fi
