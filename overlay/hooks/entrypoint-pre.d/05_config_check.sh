#!/bin/bash
set -eo pipefail

echo "Checking cache configuration"


print_confighash_warning () {
	echo ""
	echo "ABORTING STARTUP TO AVOID POTENTIALLY INVALIDATING THE CACHE"
	echo ""
	echo "If you are happy that this cache is valid with the current config changes"
	echo "please delete \`/<cache_mount>/CONFIGHASH\`"
	echo ""
	echo "See: https://lancache.net/docs/advanced/config-hash/ for more details"

}

# Read proxy_cache_key directly from nginx config so config-key changes affect CONFIGHASH.
DETECTED_CACHE_KEY=$(grep proxy_cache_key /etc/nginx/sites-available/cache.conf.d/root/30_cache_key.conf | awk '{print $2}')
NEWHASH=$(printf '%s' "GENERICCACHE_VERSION=${GENERICCACHE_VERSION};CACHE_MODE=${CACHE_MODE};CACHE_SLICE_SIZE=${CACHE_SLICE_SIZE};NOSLICE_FALLBACK=${NOSLICE_FALLBACK};CACHE_KEY=${DETECTED_CACHE_KEY}" | md5sum | awk '{print $1}')
# Backward compatibility for the pre-md5 human-readable CONFIGHASH format.
LEGACYHASH="GENERICCACHE_VERSION=${GENERICCACHE_VERSION};CACHE_MODE=${CACHE_MODE};CACHE_SLICE_SIZE=${CACHE_SLICE_SIZE};CACHE_KEY=${DETECTED_CACHE_KEY}"
LEGACYHASH_EMPTY_CACHE_KEY="GENERICCACHE_VERSION=${GENERICCACHE_VERSION};CACHE_MODE=${CACHE_MODE};CACHE_SLICE_SIZE=${CACHE_SLICE_SIZE};CACHE_KEY="

if [ -d /data/cache/cache ]; then
	echo " Detected existing cache data, checking config hash for consistency"
	if [ -f /data/cache/CONFIGHASH ]; then
		OLDHASH=$(cat /data/cache/CONFIGHASH)
		if [ "${OLDHASH}" = "${LEGACYHASH}" ] || [ "${OLDHASH}" = "${LEGACYHASH_EMPTY_CACHE_KEY}" ]; then
			echo " Detected legacy CONFIGHASH format, migrating to current format"
			OLDHASH="${NEWHASH}"
		fi
		if [ "${OLDHASH}" != "${NEWHASH}" ]; then
			echo "ERROR: Detected CONFIGHASH does not match current CONFIGHASH"
			echo " Detected: ${OLDHASH}"
			echo " Current:  ${NEWHASH}"
			print_confighash_warning
			exit 1
		else
			echo " CONFIGHASH matches current configuration"
		fi
	else
		echo " Could not find CONFIGHASH for existing cachedata"
		echo "  This is either an upgrade from an older instance of Lancache"
		echo "  or CONFIGHASH has been deleted intentionally"
		echo ""
		echo " Creating CONFIGHASH from current live configuration"
		echo "   Current:  ${NEWHASH}"
		echo ""
		echo "  See: https://lancache.net/docs/advanced/config-hash/ for more details"
	fi
fi

mkdir -p /data/cache/cache
echo "${NEWHASH}" > /data/cache/CONFIGHASH

# Nginx requires proxy_cache_path directory to be owned by the worker user (WEBUSER).
# Set ownership now so later hooks (e.g. 16_generate_upstream_keepalive) can run nginx -t successfully.
CURRENT_UID=$(stat -c '%u' /data/cache/cache 2>/dev/null || echo "")
WANTED_UID=$(id -u ${WEBUSER} 2>/dev/null || echo "")
if [[ -n "$WANTED_UID" && "$CURRENT_UID" != "$WANTED_UID" ]]; then
    if ! chown ${WEBUSER}:${WEBUSER} /data/cache/cache /data/cache/CONFIGHASH 2>/dev/null; then
        echo "ERROR: Cache directory /data/cache/cache must be owned by ${WEBUSER} (UID ${WANTED_UID}). chown failed (e.g. read-only or restricted mount)."
        echo "On the host run: chown -R ${WANTED_UID}:$(id -g ${WEBUSER}) <path_to_cache_volume>"
        exit 1
    fi
fi
