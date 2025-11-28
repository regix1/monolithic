#!/bin/bash
if [[ "$SKIP_PERMS_CHECK" == "true" ]]; then
    echo "Skipping permissions check (SKIP_PERMS_CHECK=true)"
    exit 0
fi

if [ -d "/data/cache/cache" ]; then
	echo "Running fast permissions check"
	# Get the UID of the web user for comparison
	TARGET_UID=$(id -u ${WEBUSER})
	# Check if any top-level cache dirs have wrong ownership
	WRONG_OWNER=$(find /data/cache/cache -maxdepth 1 -mindepth 1 \! -user ${TARGET_UID} 2>/dev/null | head -1)

	if [[ -n "$WRONG_OWNER" ]]; then
		echo "Warning: Some files in /data/cache/cache are not owned by ${WEBUSER} (UID: ${TARGET_UID})"
		echo "This may cause permission errors. To fix, run on the host: chown -R ${TARGET_UID}:${TARGET_UID} /path/to/cache"
		if [[ "$FORCE_PERMS_CHECK" == "true" ]]; then
			echo "FORCE_PERMS_CHECK=true, attempting to fix permissions..."
			chown -R ${WEBUSER}:${WEBUSER} /data 2>/dev/null || true
			echo "Permissions fix attempted"
		fi
	else
		echo "Permissions ok"
	fi

fi
