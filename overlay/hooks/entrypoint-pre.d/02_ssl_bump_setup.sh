#!/bin/bash
# SSL Bump Setup Script
# This script sets up SSL certificates for HTTPS caching via nginx SSL termination
# Only runs if ENABLE_SSL_BUMP=true

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    echo "SSL Bump disabled (ENABLE_SSL_BUMP != true)"
    exit 0
fi

echo "Setting up SSL certificates for HTTPS caching..."

SSL_CERT_DIR="/data/ssl"
CA_CERT="${SSL_CERT_DIR}/lancache-ca.pem"
CA_KEY="${SSL_CERT_DIR}/lancache-ca.key"
CA_DER="${SSL_CERT_DIR}/lancache-ca.der"
CA_CRL="${SSL_CERT_DIR}/lancache-ca.crl"
CA_CRL_PEM="${SSL_CERT_DIR}/lancache-ca-crl.pem"

# Create SSL directory if it doesn't exist
mkdir -p "${SSL_CERT_DIR}"

# Generate CA certificate if it doesn't exist
if [[ ! -f "${CA_CERT}" ]] || [[ ! -f "${CA_KEY}" ]]; then
    echo "Generating new CA certificate for SSL Bump..."

    # Get server IP for CRL distribution point
    CRL_SERVER_IP=$(hostname -i 2>/dev/null | awk '{print $1}' || ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
    if [[ -z "$CRL_SERVER_IP" ]]; then
        CRL_SERVER_IP="lancache.local"
    fi

    # Create OpenSSL config with CRL Distribution Point
    CA_CONFIG=$(mktemp)
    cat > "${CA_CONFIG}" << EOFCACONF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[req_distinguished_name]
C = XX
ST = LanCache
L = LanCache
O = LanCache SSL Bump
CN = LanCache Root CA

[v3_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always, issuer

[crl_ext]
authorityKeyIdentifier = keyid:always
EOFCACONF

    # Generate private key
    openssl genrsa -out "${CA_KEY}" 4096

    # Generate CA certificate (valid for 10 years)
    openssl req -new -x509 -days 3650 -key "${CA_KEY}" -out "${CA_CERT}" \
        -config "${CA_CONFIG}" -extensions v3_ca

    # Generate DER format for Windows import
    openssl x509 -in "${CA_CERT}" -outform DER -out "${CA_DER}"

    # Generate an empty CRL (Certificate Revocation List) for Windows revocation checking
    echo "Generating empty CRL for revocation checking..."

    # Create CRL config
    CRL_CONFIG=$(mktemp)
    cat > "${CRL_CONFIG}" << EOFCRLCONF
[ca]
default_ca = CA_default

[CA_default]
database = /tmp/index.txt
crlnumber = /tmp/crlnumber
default_crl_days = 3650
default_md = sha256
EOFCRLCONF

    # Initialize the database files
    touch /tmp/index.txt
    echo "01" > /tmp/crlnumber

    # Generate CRL in PEM format
    openssl ca -gencrl -keyfile "${CA_KEY}" -cert "${CA_CERT}" \
        -out "${CA_CRL_PEM}" -config "${CRL_CONFIG}" 2>/dev/null || {
        # Fallback: generate CRL using openssl crl command with req
        openssl crl -in /dev/null -out "${CA_CRL_PEM}" 2>/dev/null || {
            # Second fallback: create minimal CRL manually with openssl
            echo "Using alternative CRL generation method..."
            openssl ca -gencrl -keyfile "${CA_KEY}" -cert "${CA_CERT}" \
                -out "${CA_CRL_PEM}" -config "${CRL_CONFIG}" -crldays 3650 2>/dev/null || true
        }
    }

    # Convert CRL to DER format for Windows
    if [[ -f "${CA_CRL_PEM}" ]]; then
        openssl crl -in "${CA_CRL_PEM}" -outform DER -out "${CA_CRL}" 2>/dev/null || true
    fi

    rm -f "${CA_CONFIG}" "${CRL_CONFIG}" /tmp/index.txt /tmp/index.txt.attr /tmp/crlnumber /tmp/crlnumber.old 2>/dev/null

    NEW_CERT=true
else
    echo "Using existing CA certificate: ${CA_CERT}"
    NEW_CERT=false
fi

# Ensure CRL exists (regenerate if missing)
if [[ ! -f "${CA_CRL}" ]] || [[ ! -f "${CA_CRL_PEM}" ]]; then
    echo "Generating CRL file..."
    CRL_CONFIG=$(mktemp)
    cat > "${CRL_CONFIG}" << EOFCRLCONF
[ca]
default_ca = CA_default

[CA_default]
database = /tmp/index.txt
crlnumber = /tmp/crlnumber
default_crl_days = 3650
default_md = sha256
EOFCRLCONF

    touch /tmp/index.txt
    echo "01" > /tmp/crlnumber

    openssl ca -gencrl -keyfile "${CA_KEY}" -cert "${CA_CERT}" \
        -out "${CA_CRL_PEM}" -config "${CRL_CONFIG}" -crldays 3650 2>/dev/null || true

    if [[ -f "${CA_CRL_PEM}" ]]; then
        openssl crl -in "${CA_CRL_PEM}" -outform DER -out "${CA_CRL}" 2>/dev/null || true
    fi

    rm -f "${CRL_CONFIG}" /tmp/index.txt /tmp/index.txt.attr /tmp/crlnumber /tmp/crlnumber.old 2>/dev/null
fi

# Get server IP addresses for download URL
SERVER_IPS=$(hostname -i 2>/dev/null || ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -3)
if [[ -z "$SERVER_IPS" ]]; then
    SERVER_IPS="YOUR_LANCACHE_IP"
fi
FIRST_IP=$(echo "$SERVER_IPS" | head -1)

echo ""
echo "============================================================"
echo "SSL BUMP ENABLED - HTTPS CACHING ACTIVE"
echo "============================================================"
echo ""
echo "Download and install the CA certificate on your gaming PCs:"
echo ""
echo "  >>> http://${FIRST_IP}/lancache-certs <<<"
echo ""
echo "Direct downloads:"
echo "  Windows: http://${FIRST_IP}/lancache-certs/lancache-ca.der"
echo "  Linux:   http://${FIRST_IP}/lancache-certs/lancache-ca.pem"
echo ""
if [[ "$NEW_CERT" == "true" ]]; then
    echo "NOTE: New certificate generated - install on ALL gaming PCs"
fi
echo "============================================================"
echo ""

# Set proper permissions
chmod 600 "${CA_KEY}"
chmod 644 "${CA_CERT}" "${CA_DER}" "${CA_CRL}" "${CA_CRL_PEM}" 2>/dev/null || true

# Note: Server certificate for nginx SSL termination is generated in
# 17_ssl_server_cert.sh after bump-domains.txt is created by 16_ssl_bump_domains.sh

echo "SSL certificate setup complete!"
