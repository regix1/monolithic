#!/bin/bash
# Generate SSL bump domain list by testing which domains require HTTPS
# Only runs if ENABLE_SSL_BUMP=true

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    exit 0
fi

echo "Detecting HTTPS-only domains for SSL bump..."

BUMP_DOMAINS_FILE="/etc/squid/bump-domains.txt"
CACHE_DOMAINS_DIR="/data/cachedomains"
TEMP_FILE="/tmp/bump-domains-temp.txt"
TEMP_HTTPS="/tmp/https-domains.txt"
TIMEOUT="${SSL_BUMP_TEST_TIMEOUT:-3}"
MAX_PARALLEL="${SSL_BUMP_TEST_PARALLEL:-10}"

# Clear existing files
> "${BUMP_DOMAINS_FILE}"
> "${TEMP_FILE}"
> "${TEMP_HTTPS}"

# Check if cache domains directory exists
if [[ ! -d "${CACHE_DOMAINS_DIR}" ]]; then
    echo "Warning: Cache domains directory not found: ${CACHE_DOMAINS_DIR}"
    exit 0
fi

# Function to test if a domain requires HTTPS
# Returns 0 if HTTPS-only, 1 if HTTP works
test_https_required() {
    local domain="$1"
    local test_domain="$domain"

    # For wildcard domains (.example.com), test the base domain
    if [[ "$domain" == .* ]]; then
        test_domain="${domain:1}"
    fi

    # Skip if domain looks invalid
    if [[ ! "$test_domain" =~ \. ]]; then
        return 1
    fi

    # Test 1: Try HTTP and check for redirect to HTTPS
    local http_result
    http_result=$(curl -s -o /dev/null -w '%{http_code}:%{redirect_url}' \
        --connect-timeout "$TIMEOUT" \
        --max-time "$((TIMEOUT * 2))" \
        -A "Mozilla/5.0" \
        "http://${test_domain}/" 2>/dev/null)

    local http_code="${http_result%%:*}"
    local redirect_url="${http_result#*:}"

    # If HTTP redirects to HTTPS, domain requires HTTPS
    if [[ "$redirect_url" == https://* ]]; then
        return 0
    fi

    # If HTTP works (2xx, 3xx, 4xx), no SSL bump needed
    if [[ "$http_code" =~ ^[234] ]]; then
        return 1
    fi

    # Test 2: If HTTP failed/refused, check if HTTPS works
    if [[ "$http_code" == "000" ]]; then
        local https_code
        https_code=$(curl -s -o /dev/null -w '%{http_code}' \
            --connect-timeout "$TIMEOUT" \
            --max-time "$((TIMEOUT * 2))" \
            -k -A "Mozilla/5.0" \
            "https://${test_domain}/" 2>/dev/null)

        # HTTPS works but HTTP doesn't = HTTPS-only
        if [[ "$https_code" =~ ^[234] ]]; then
            return 0
        fi
    fi

    # Default: assume HTTP works or domain is unreachable
    return 1
}

# Export function for parallel execution
export -f test_https_required
export TIMEOUT

# Read all domain files and collect unique domains
echo "Collecting domains from cache-domains..."
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
TOTAL_DOMAINS=$(wc -l < "${TEMP_FILE}")
echo "Found ${TOTAL_DOMAINS} unique domains to test..."

# Test each domain for HTTPS requirement
TESTED=0
HTTPS_COUNT=0

while IFS= read -r domain; do
    TESTED=$((TESTED + 1))

    # Show progress every 20 domains
    if [[ $((TESTED % 20)) -eq 0 ]]; then
        echo "  Testing domain ${TESTED}/${TOTAL_DOMAINS}... (${HTTPS_COUNT} HTTPS-only found)"
    fi

    if test_https_required "$domain"; then
        echo "$domain" >> "${TEMP_HTTPS}"
        HTTPS_COUNT=$((HTTPS_COUNT + 1))
        # Log HTTPS-only domains as they're found
        if [[ "$domain" == .* ]]; then
            echo "  [HTTPS] *${domain}"
        else
            echo "  [HTTPS] ${domain}"
        fi
    fi
done < "${TEMP_FILE}"

echo "Testing complete: ${HTTPS_COUNT} HTTPS-only domains found out of ${TOTAL_DOMAINS}"

# Now filter out conflicting domains from the HTTPS list
# (specific domains covered by wildcards)
if [[ -s "${TEMP_HTTPS}" ]]; then
    sort -u "${TEMP_HTTPS}" -o "${TEMP_HTTPS}"

    while IFS= read -r domain; do
        # If this is a wildcard, always keep it
        if [[ "$domain" == .* ]]; then
            echo "$domain" >> "${BUMP_DOMAINS_FILE}"
            continue
        fi

        # Check if any parent wildcard exists
        skip_domain=false
        check_domain="$domain"

        while [[ "$check_domain" == *.* ]]; do
            if grep -qx "\.${check_domain}" "${TEMP_HTTPS}" 2>/dev/null; then
                skip_domain=true
                break
            fi
            check_domain="${check_domain#*.}"
            if grep -qx "\.${check_domain}" "${TEMP_HTTPS}" 2>/dev/null; then
                skip_domain=true
                break
            fi
        done

        if [[ "$skip_domain" == "false" ]]; then
            echo "$domain" >> "${BUMP_DOMAINS_FILE}"
        fi
    done < "${TEMP_HTTPS}"
fi

rm -f "${TEMP_FILE}" "${TEMP_HTTPS}"

FINAL_COUNT=$(wc -l < "${BUMP_DOMAINS_FILE}" 2>/dev/null || echo "0")
echo ""
echo "SSL bump domain list generated: ${FINAL_COUNT} HTTPS-only domains"
if [[ "$FINAL_COUNT" -gt 0 ]]; then
    echo "These domains will be SSL bumped (decrypted) for HTTPS caching:"
    head -10 "${BUMP_DOMAINS_FILE}" | while read d; do
        if [[ "$d" == .* ]]; then
            echo "  - *${d}"
        else
            echo "  - ${d}"
        fi
    done
    if [[ "$FINAL_COUNT" -gt 10 ]]; then
        echo "  ... and $((FINAL_COUNT - 10)) more"
    fi
else
    echo "No HTTPS-only domains detected - SSL bump may not be needed"
fi
