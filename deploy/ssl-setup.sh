#!/bin/bash
# deploy/ssl-setup.sh
# Generates a self-signed TLS certificate for https://20.164.207.196
# Run this ONCE on the VM before starting nginx.
#
# Usage:
#   chmod +x deploy/ssl-setup.sh
#   sudo ./deploy/ssl-setup.sh
#
# The cert and key will be mounted into the nginx container via docker-compose.production.yml:
#   - ./ssl:/etc/nginx/ssl:ro

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SSL_DIR="$SCRIPT_DIR/ssl"
VM_IP="20.164.207.196"

echo "=== Okiru SSL Setup for https://$VM_IP ==="

mkdir -p "$SSL_DIR"

# Generate self-signed cert valid for 825 days (max Safari/Chrome accept)
openssl req -x509 -nodes -days 825 \
  -newkey rsa:2048 \
  -keyout "$SSL_DIR/okiru-selfsigned.key" \
  -out    "$SSL_DIR/okiru-selfsigned.crt" \
  -subj "/C=ZA/ST=Gauteng/L=Johannesburg/O=Okiru/OU=B-BBEE/CN=$VM_IP" \
  -addext "subjectAltName=IP:$VM_IP"

chmod 600 "$SSL_DIR/okiru-selfsigned.key"
chmod 644 "$SSL_DIR/okiru-selfsigned.crt"

echo ""
echo "=== SSL certificate generated ==="
echo "Certificate: $SSL_DIR/okiru-selfsigned.crt"
echo "Private key: $SSL_DIR/okiru-selfsigned.key"
echo ""
echo "NOTE: Browsers will show a security warning for self-signed certs."
echo "      Users can click 'Advanced → Proceed' to access the site."
echo ""
echo "To migrate to a trusted cert later:"
echo "  1. Point a domain to $VM_IP"
echo "  2. Update DOMAIN in .env"  
echo "  3. Run: certbot certonly --standalone -d yourdomain.com"
echo "  4. Update nginx.conf ssl_certificate paths"
echo "  5. docker compose -f docker-compose.production.yml restart nginx"
