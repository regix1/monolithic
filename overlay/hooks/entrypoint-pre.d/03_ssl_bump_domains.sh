#!/bin/bash
# Generate SSL bump domain list from cache-domains
# Only runs if ENABLE_SSL_BUMP=true

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    exit 0
fi

echo "Generating SSL bump domain list from cache-domains..."

BUMP_DOMAINS_FILE="/etc/squid/bump-domains.txt"
CACHE_DOMAINS_DIR="/data/cachedomains"

# Clear existing file
> "${BUMP_DOMAINS_FILE}"

# Check if cache domains directory exists
if [[ ! -d "${CACHE_DOMAINS_DIR}" ]]; then
    echo "Warning: Cache domains directory not found: ${CACHE_DOMAINS_DIR}"
    exit 0
fi

# Read all domain files and add to bump list
# Uses the same domains that lancache already caches via HTTP
for domain_file in "${CACHE_DOMAINS_DIR}"/*.txt; do
    if [[ -f "${domain_file}" ]]; then
        # Skip empty lines and comments, convert wildcards to regex
        while IFS= read -r domain || [[ -n "$domain" ]]; do
            # Skip empty lines and comments
            [[ -z "$domain" || "$domain" =~ ^# ]] && continue

            # Convert wildcard domains to Squid format
            # *.example.com -> .example.com (Squid uses leading dot for wildcards)
            if [[ "$domain" == \*.* ]]; then
                echo "${domain#\*}" >> "${BUMP_DOMAINS_FILE}"
            else
                echo "$domain" >> "${BUMP_DOMAINS_FILE}"
            fi
        done < "$domain_file"
    fi
done

# Remove duplicates and sort
sort -u "${BUMP_DOMAINS_FILE}" -o "${BUMP_DOMAINS_FILE}"

DOMAIN_COUNT=$(wc -l < "${BUMP_DOMAINS_FILE}")
echo "SSL bump domain list generated: ${DOMAIN_COUNT} domains"
echo "Domains will be SSL bumped (decrypted) for HTTPS caching"
