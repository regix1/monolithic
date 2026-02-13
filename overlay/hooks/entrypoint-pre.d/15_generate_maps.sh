#!/bin/bash
set -eo pipefail
mkdir -p /data/cachedomains
echo "Bootstrapping Monolithic from ${CACHE_DOMAINS_REPO}"

export GIT_SSH_COMMAND="ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no"
cd /data/cachedomains
if [[ ! -d .git ]]; then
	git clone "${CACHE_DOMAINS_REPO}" .
fi

if [[ "${NOFETCH:-false}" != "true" ]]; then
	# Disable error checking whilst we attempt to get latest
	set +e
	# Set git timeout to avoid hanging on slow/unresponsive servers
	export GIT_HTTP_LOW_SPEED_LIMIT=1000
	export GIT_HTTP_LOW_SPEED_TIME=30
	git remote set-url origin "${CACHE_DOMAINS_REPO}"
	timeout 60 git fetch origin || echo "Failed to update from remote, using local copy of cache_domains"
	git reset --hard "origin/${CACHE_DOMAINS_BRANCH}"
	# Reenable error checking
	set -e
fi

TEMP_PATH=$(mktemp -d)
trap 'rm -rf "${TEMP_PATH}"' EXIT
OUTPUTFILE="${TEMP_PATH}/outfile.conf"
echo "map \"\$http_user_agent£££\$http_host\" \$cacheidentifier {" >> "${OUTPUTFILE}"
echo "    default \$http_host;" >> "${OUTPUTFILE}"
echo "    ~Valve\\/Steam\\ HTTP\\ Client\\ 1\.0£££.* steam;" >> "${OUTPUTFILE}"
#Next line probably no longer needed as we are now regexing to victory
#echo "    hostnames;" >> "${OUTPUTFILE}"
jq -r '.cache_domains | to_entries[] | .key' cache_domains.json | while read -r CACHE_ENTRY; do
	#for each cache entry, find the cache indentifier
	CACHE_IDENTIFIER=$(jq -r ".cache_domains[$CACHE_ENTRY].name" cache_domains.json)
	jq -r ".cache_domains[$CACHE_ENTRY].domain_files | to_entries[] | .key" cache_domains.json | while read -r CACHEHOSTS_FILEID; do
		#Get the key for each domain files
		jq -r ".cache_domains[$CACHE_ENTRY].domain_files[$CACHEHOSTS_FILEID]" cache_domains.json | while read -r CACHEHOSTS_FILENAME; do
			#Get the actual file name
			echo "Reading cache ${CACHE_IDENTIFIER} from ${CACHEHOSTS_FILENAME}"
			while IFS= read -r CACHE_HOST || [[ -n "${CACHE_HOST}" ]]; do
				#for each file in the hosts file
				#remove all whitespace (mangles comments but ensures valid config files)
				CACHE_HOST=${CACHE_HOST//[[:space:]]/}
				if [[ -n "${CACHE_HOST}" && "${CACHE_HOST}" != \#* ]]; then
					#Use sed to replace . with \. and * with .*
					REGEX_CACHE_HOST=$(sed -e "s#\.#\\\.#g" -e "s#\*#\.\*#g" <<< "${CACHE_HOST}")
					echo "    ~.*£££.*?${REGEX_CACHE_HOST} ${CACHE_IDENTIFIER};" >> "${OUTPUTFILE}"
				fi
			done < "${CACHEHOSTS_FILENAME}"
		done
	done
done
echo "}" >> "${OUTPUTFILE}"
## Append the noslice_host map (must be in the same generated file)
echo "" >> "${OUTPUTFILE}"
echo "# Map for hosts that don't support HTTP Range requests (causes slice errors)" >> "${OUTPUTFILE}"
echo "# The setup script switches the include target based on NOSLICE_FALLBACK" >> "${OUTPUTFILE}"
echo 'map $http_host $noslice_host {' >> "${OUTPUTFILE}"
echo "    default 0;" >> "${OUTPUTFILE}"
echo "    include /etc/nginx/conf.d/noslice-hosts.map;" >> "${OUTPUTFILE}"
echo "}" >> "${OUTPUTFILE}"

cat "${OUTPUTFILE}"
cp "${OUTPUTFILE}" /etc/nginx/maps.d/30_maps.conf
# Note: rm -rf $TEMP_PATH is now handled by the EXIT trap
