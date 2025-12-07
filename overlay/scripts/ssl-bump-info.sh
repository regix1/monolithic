#!/bin/bash
# Display SSL bump certificate download information

# Get server IP addresses for download URL
SERVER_IPS=$(hostname -i 2>/dev/null || ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -3)
if [[ -z "$SERVER_IPS" ]]; then
    SERVER_IPS="YOUR_LANCACHE_IP"
fi
FIRST_IP=$(echo "$SERVER_IPS" | head -1)

echo ""
echo "============================================================"
echo "SSL BUMP ACTIVE - CERTIFICATE DOWNLOAD"
echo "============================================================"
echo ""
echo "Install the CA certificate on your gaming PCs:"
echo ""
echo "  >>> http://${FIRST_IP}/lancache-certs <<<"
echo ""
echo "Direct downloads:"
echo "  Windows: http://${FIRST_IP}/lancache-certs/lancache-ca.der"
echo "  Linux:   http://${FIRST_IP}/lancache-certs/lancache-ca.pem"
echo ""
echo "============================================================"
echo ""
