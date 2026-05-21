#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <domain> <email>"
  exit 1
fi

DOMAIN="$1"
EMAIL="$2"
REPO_ROOT="/opt/cosmix"
INFRA_DIR="$REPO_ROOT/infra"

mkdir -p "$INFRA_DIR/certbot/conf" "$INFRA_DIR/certbot/www"

echo "[1/5] Stopping nginx container temporarily for certificate issuance"
docker compose -f "$INFRA_DIR/docker-compose.ec2.yml" stop nginx

echo "[2/5] Requesting Let's Encrypt certificate for $DOMAIN"
docker run --rm \
  -p 80:80 \
  -v "$INFRA_DIR/certbot/conf:/etc/letsencrypt" \
  -v "$INFRA_DIR/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL" \
  -d "$DOMAIN"

echo "[3/5] Ensuring certificate symlink path exists"
if [ ! -d "$INFRA_DIR/certbot/conf/live/$DOMAIN" ]; then
  echo "Certificate directory not found for $DOMAIN"
  exit 1
fi

echo "[4/5] Starting stack with HTTPS override"
docker compose \
  -f "$INFRA_DIR/docker-compose.ec2.yml" \
  -f "$INFRA_DIR/docker-compose.ec2.https.yml" \
  up -d --build nginx web chat-service wellness-service

echo "[5/5] Scheduling automatic renewal"
CRON_CMD="docker run --rm -v $INFRA_DIR/certbot/conf:/etc/letsencrypt -v $INFRA_DIR/certbot/www:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot --quiet && docker compose -f $INFRA_DIR/docker-compose.ec2.yml -f $INFRA_DIR/docker-compose.ec2.https.yml restart nginx"
( crontab -l 2>/dev/null | grep -v 'certbot/certbot renew --webroot' ; echo "17 3 * * * $CRON_CMD" ) | crontab -

echo "HTTPS setup complete. Visit: https://$DOMAIN"
