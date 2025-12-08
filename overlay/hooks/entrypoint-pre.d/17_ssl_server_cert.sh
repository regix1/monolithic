#!/bin/bash
# Generate server certificate for nginx SSL termination
# Runs after 16_ssl_bump_domains.sh which creates bump-domains.txt
# Only runs if ENABLE_SSL_BUMP=true

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    exit 0
fi

SSL_CERT_DIR="/data/ssl"
CA_CERT="${SSL_CERT_DIR}/lancache-ca.pem"
CA_KEY="${SSL_CERT_DIR}/lancache-ca.key"
SERVER_CERT="${SSL_CERT_DIR}/server.pem"
SERVER_KEY="${SSL_CERT_DIR}/server.key"
BUMP_DOMAINS_FILE="/etc/squid/bump-domains.txt"

# Check if CA exists
if [[ ! -f "${CA_CERT}" ]] || [[ ! -f "${CA_KEY}" ]]; then
    echo "ERROR: CA certificate not found. Run 02_ssl_bump_setup.sh first."
    exit 1
fi

generate_server_cert() {
    echo "Generating server certificate for SSL termination..."

    # Generate server private key
    openssl genrsa -out "${SERVER_KEY}" 2048

    # Create CSR config with SANs
    local san_config=$(mktemp)
    cat > "${san_config}" << 'EOFCSR'
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = XX
ST = LanCache
L = LanCache
O = LanCache SSL Bump
CN = lancache.local

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = lancache.local
DNS.2 = *.lancache.local
EOFCSR

    # Add bump domains as SANs if the file exists
    local san_num=3
    if [[ -f "${BUMP_DOMAINS_FILE}" ]] && [[ -s "${BUMP_DOMAINS_FILE}" ]]; then
        while IFS= read -r domain || [[ -n "$domain" ]]; do
            [[ -z "$domain" || "$domain" =~ ^# ]] && continue
            if [[ "$domain" == .* ]]; then
                # Wildcard domain like .gog.cdn.net -> *.gog.cdn.net
                echo "DNS.${san_num} = *${domain}" >> "${san_config}"
            else
                echo "DNS.${san_num} = ${domain}" >> "${san_config}"
            fi
            ((san_num++))
        done < "${BUMP_DOMAINS_FILE}"
    fi

    local san_count=$((san_num - 1))
    echo "Adding ${san_count} SANs to server certificate..."

    # Generate CSR
    openssl req -new -key "${SERVER_KEY}" -out /tmp/server.csr -config "${san_config}"

    # Sign with CA (valid for 1 year)
    openssl x509 -req -days 365 \
        -in /tmp/server.csr \
        -CA "${CA_CERT}" \
        -CAkey "${CA_KEY}" \
        -CAcreateserial \
        -out "${SERVER_CERT}" \
        -extensions v3_req \
        -extfile "${san_config}"

    rm -f /tmp/server.csr "${san_config}"
    chmod 600 "${SERVER_KEY}"
    chmod 644 "${SERVER_CERT}"

    echo "Server certificate generated with ${san_count} SANs"
}

# Check if we need to regenerate server cert
# Regenerate if: doesn't exist, or bump domains file is newer
NEED_SERVER_CERT=false
if [[ ! -f "${SERVER_CERT}" ]] || [[ ! -f "${SERVER_KEY}" ]]; then
    echo "Server certificate not found - generating..."
    NEED_SERVER_CERT=true
elif [[ -f "${BUMP_DOMAINS_FILE}" ]]; then
    # Check if bump domains file is newer than server cert
    if [[ "${BUMP_DOMAINS_FILE}" -nt "${SERVER_CERT}" ]]; then
        echo "Bump domains changed - regenerating server certificate..."
        NEED_SERVER_CERT=true
    fi
fi

if [[ "$NEED_SERVER_CERT" == "true" ]]; then
    generate_server_cert
else
    echo "Using existing server certificate: ${SERVER_CERT}"
fi
