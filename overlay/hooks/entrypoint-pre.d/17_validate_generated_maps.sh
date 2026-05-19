#!/bin/bash
set -eo pipefail

MAP_FILE="/etc/nginx/maps.d/30_maps.conf"

echo "Validating generated nginx maps"

if [[ ! -s "${MAP_FILE}" ]]; then
	echo "ERROR: Expected generated maps file '${MAP_FILE}' is missing or empty"
	exit 1
fi

if ! grep -Eq '^[[:space:]]*map[[:space:]].*\$cacheidentifier[[:space:]]*\{' "${MAP_FILE}"; then
	echo "ERROR: Missing \$cacheidentifier map definition in ${MAP_FILE}"
	exit 1
fi

# Note: $noslice_host is no longer a generated `map` block — it is a `js_set`
# variable exposed by the njs `lancache` module (see overlay/etc/nginx/conf.d/05_njs.conf).
# Validating the njs binding belongs to the runtime `nginx -t` check, not here.

echo "Generated maps validation passed"
