#!/bin/bash
# Generate SSL bump domain list from cache-domains
# Only runs if ENABLE_SSL_BUMP=true

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    exit 0
fi

echo "Generating SSL bump domain list from cache-domains..."

BUMP_DOMAINS_FILE="/etc/squid/bump-domains.txt"
CACHE_DOMAINS_DIR="/data/cachedomains"
TEMP_FILE="/tmp/bump-domains-temp.txt"

# Clear existing files
> "${BUMP_DOMAINS_FILE}"
> "${TEMP_FILE}"

# Check if cache domains directory exists
if [[ ! -d "${CACHE_DOMAINS_DIR}" ]]; then
    echo "Warning: Cache domains directory not found: ${CACHE_DOMAINS_DIR}"
    exit 0
fi

# Read all domain files and add to temp list
for domain_file in "${CACHE_DOMAINS_DIR}"/*.txt; do
    if [[ -f "${domain_file}" ]]; then
        while IFS= read -r domain || [[ -n "$domain" ]]; do
            # Skip empty lines and comments
            [[ -z "$domain" ]] && continue
            [[ "$domain" =~ ^[[:space:]]*# ]] && continue

            # Trim whitespace
            domain=$(echo "$domain" | tr -d '[:space:]')
            [[ -z "$domain" ]] && continue

            # Convert wildcard domains to Squid format
            # *.example.com -> .example.com (Squid uses leading dot for wildcards)
            if [[ "$domain" == \*.* ]]; then
                echo "${domain#\*}" >> "${TEMP_FILE}"
            else
                echo "$domain" >> "${TEMP_FILE}"
            fi
        done < "$domain_file"
    fi
done

# Sort and remove duplicates
sort -u "${TEMP_FILE}" -o "${TEMP_FILE}"

# Remove conflicting entries: Squid errors if a specific domain is also covered by a wildcard
# Examples of conflicts:
#   - cdn.blizzard.com conflicts with .cdn.blizzard.com
#   - officecdn.microsoft.com.edgesuite.net conflicts with .microsoft.com.edgesuite.net
#
# Strategy: For each non-wildcard domain, check if any parent wildcard would match it
while IFS= read -r domain; do
    # If this is already a wildcard (starts with .), always keep it
    if [[ "$domain" == .* ]]; then
        echo "$domain" >> "${BUMP_DOMAINS_FILE}"
        continue
    fi

    # For specific domains, check if any parent wildcard exists
    skip_domain=false
    check_domain="$domain"

    # Walk up the domain hierarchy checking for wildcards
    while [[ "$check_domain" == *.* ]]; do
        # Check if wildcard for this exact domain exists (.domain.com)
        if grep -qx "\.${check_domain}" "${TEMP_FILE}" 2>/dev/null; then
            skip_domain=true
            break
        fi
        # Remove the leftmost label and check parent
        check_domain="${check_domain#*.}"
        # Check if wildcard for parent exists (.parent.com would match sub.parent.com)
        if grep -qx "\.${check_domain}" "${TEMP_FILE}" 2>/dev/null; then
            skip_domain=true
            break
        fi
    done

    if [[ "$skip_domain" == "false" ]]; then
        echo "$domain" >> "${BUMP_DOMAINS_FILE}"
    fi
done < "${TEMP_FILE}"

rm -f "${TEMP_FILE}"

DOMAIN_COUNT=$(wc -l < "${BUMP_DOMAINS_FILE}")
echo "SSL bump domain list generated: ${DOMAIN_COUNT} domains"
echo "Domains will be SSL bumped (decrypted) for HTTPS caching"
