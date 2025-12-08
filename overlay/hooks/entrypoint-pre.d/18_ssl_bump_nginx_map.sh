#!/bin/bash
# Generate nginx stream map for SSL bump domains
# Runs after 16_ssl_bump_domains.sh which creates bump-domains.txt
# Only runs if ENABLE_SSL_BUMP=true

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    exit 0
fi

BUMP_DOMAINS_FILE="/etc/nginx/ssl-bump/bump-domains.txt"
MAP_FILE="/etc/nginx/stream.d/ssl-bump-map.conf"

echo "Generating nginx SSL bump domain map..."
mkdir -p /etc/nginx/stream.d

if [[ -f "${BUMP_DOMAINS_FILE}" ]] && [[ -s "${BUMP_DOMAINS_FILE}" ]]; then
    # Convert bump-domains.txt to nginx map format
    # Each domain gets mapped to "bump"
    > "${MAP_FILE}"

    count=0
    while IFS= read -r domain || [[ -n "$domain" ]]; do
        # Skip empty lines and comments
        [[ -z "$domain" || "$domain" =~ ^# ]] && continue

        # Handle wildcard domains (convert .domain.com to regex)
        if [[ "$domain" == .* ]]; then
            # Wildcard domain like .gog.cdn.net -> regex match for *.gog.cdn.net
            # Escape dots for regex: .gog.cdn.net -> \.gog\.cdn\.net
            # nginx map regex format: "~*pattern$" value; (quoted regex)
            escaped=$(echo "${domain}" | sed 's/\./\\./g')
            printf '    "~*%s$" bump;\n' "${escaped}" >> "${MAP_FILE}"
        else
            # Exact domain
            echo "    ${domain} bump;" >> "${MAP_FILE}"
        fi
        ((count++))
    done < "${BUMP_DOMAINS_FILE}"

    echo "SSL bump map generated with ${count} domain entries"
else
    # Empty map file
    > "${MAP_FILE}"
    echo "No bump domains found - SSL bump map is empty"
fi
