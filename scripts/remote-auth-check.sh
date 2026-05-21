#!/usr/bin/env bash
set -euo pipefail

printf '== services ==\n'
sudo docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'infra-(web|chat-service|nginx)-1' || true

printf '\n== session unauthenticated ==\n'
curl -k -i -s https://44-193-83-205.nip.io/api/auth/session

cat >/tmp/hardi.json <<'EOF'
{"identifier":"Hardi","password":"123"}
EOF

printf '\n== login hardi ==\n'
curl -k -i -s -c /tmp/hardi.cookies -H 'Content-Type: application/json' --data-binary @/tmp/hardi.json https://44-193-83-205.nip.io/api/auth/login

printf '\n== session hardi ==\n'
curl -k -i -s -b /tmp/hardi.cookies https://44-193-83-205.nip.io/api/auth/session

printf '\n== wellness hardi ==\n'
curl -k -s https://44-193-83-205.nip.io/wellness/data/usr-hardi

printf '\n== wellness laks ==\n'
curl -k -s https://44-193-83-205.nip.io/wellness/data/usr-1776348315064-629418
