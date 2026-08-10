#!/usr/bin/env bash
set -euo pipefail
cd /opt/cosmix
COMPOSE='docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml'
echo "=== start $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
git fetch origin main
git reset --hard origin/main
git log -1 --oneline
df -h /

# Build first so a failure does not leave the site down with no images.
for svc in auth-service user-service chat-service wellness-service api-gateway web; do
  echo "=== build ${svc} ==="
  docker builder prune -af || true
  $COMPOSE build "${svc}"
  df -h /
done

echo '=== up all ==='
$COMPOSE up -d --force-recreate
$COMPOSE ps
sleep 3
curl -fsS -o /dev/null -w 'https:%{http_code}\n' -k https://127.0.0.1/ || true
curl -fsS -o /dev/null -w 'chat-key:%{http_code}\n' -k https://127.0.0.1/chat-api/chat/push/public-key || true
echo "=== done $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
