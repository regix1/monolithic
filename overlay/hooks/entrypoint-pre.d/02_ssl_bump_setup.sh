#!/bin/bash
# SSL Bump Setup Script
# This script sets up SSL bump capabilities for HTTPS caching
# Only runs if ENABLE_SSL_BUMP=true

if [[ "${ENABLE_SSL_BUMP}" != "true" ]]; then
    echo "SSL Bump disabled (ENABLE_SSL_BUMP != true)"
    exit 0
fi

echo "Setting up SSL Bump for HTTPS caching..."

# Check if Squid has SSL bump support
if ! squid -v 2>&1 | grep -q "with-openssl\|with-gnutls\|enable-ssl"; then
    echo "ERROR: Squid was not compiled with SSL support!"
    echo "SSL Bump requires Squid with --with-openssl"
    echo "Please use a Squid package with SSL support or disable ENABLE_SSL_BUMP"
    exit 1
fi

SSL_CERT_DIR="/data/ssl"
CA_CERT="${SSL_CERT_DIR}/lancache-ca.pem"
CA_KEY="${SSL_CERT_DIR}/lancache-ca.key"
CA_DER="${SSL_CERT_DIR}/lancache-ca.der"

# Create SSL directory if it doesn't exist
mkdir -p "${SSL_CERT_DIR}"

# Generate CA certificate if it doesn't exist
if [[ ! -f "${CA_CERT}" ]] || [[ ! -f "${CA_KEY}" ]]; then
    echo "Generating new CA certificate for SSL Bump..."

    # Generate private key
    openssl genrsa -out "${CA_KEY}" 4096

    # Generate CA certificate (valid for 10 years)
    openssl req -new -x509 -days 3650 -key "${CA_KEY}" -out "${CA_CERT}" \
        -subj "/C=XX/ST=LanCache/L=LanCache/O=LanCache SSL Bump/CN=LanCache Root CA"

    # Generate DER format for Windows import
    openssl x509 -in "${CA_CERT}" -outform DER -out "${CA_DER}"

    NEW_CERT=true
else
    echo "Using existing CA certificate: ${CA_CERT}"
    NEW_CERT=false
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
chmod 644 "${CA_CERT}" "${CA_DER}" 2>/dev/null || true

# Note: Server certificate for nginx SSL termination is generated in
# 17_ssl_server_cert.sh after bump-domains.txt is created by 16_ssl_bump_domains.sh

# Initialize Squid SSL certificate database if needed
SSL_DB="/var/lib/squid/ssl_db"
CERTGEN_PATH="/usr/lib/squid/security_file_certgen"

# Alpine may have it in a different location
if [[ ! -x "${CERTGEN_PATH}" ]]; then
    CERTGEN_PATH=$(find /usr -name "security_file_certgen" -o -name "ssl_crtd" 2>/dev/null | head -1)
fi

if [[ -x "${CERTGEN_PATH}" ]] && [[ ! -d "${SSL_DB}" ]]; then
    echo "Initializing Squid SSL certificate database..."
    mkdir -p /var/lib/squid
    "${CERTGEN_PATH}" -c -s "${SSL_DB}" -M 64MB
    chown -R nginx:nginx /var/lib/squid 2>/dev/null || true
fi

echo "SSL Bump setup complete!"
