#!/usr/bin/env bash
# Register (or refresh) the Strava push subscription for Cosmix.
# Usage on EC2:
#   bash scripts/strava-register-webhook.sh
# Or remotely:
#   curl -sS -X POST https://YOUR_HOST/wellness/strava/webhook/register \
#     -H 'Content-Type: application/json' \
#     -d '{"verifyToken":"cosmix-strava-webhook"}'
set -euo pipefail

BASE_URL="${COSMIX_BASE_URL:-https://3-221-127-253.nip.io}"
VERIFY_TOKEN="${STRAVA_WEBHOOK_VERIFY_TOKEN:-cosmix-strava-webhook}"
CALLBACK_URL="${STRAVA_WEBHOOK_CALLBACK_URL:-${BASE_URL}/wellness/strava/webhook}"

echo "Registering Strava webhook -> ${CALLBACK_URL}"
curl -sS -X POST "${BASE_URL}/wellness/strava/webhook/register" \
  -H 'Content-Type: application/json' \
  -d "{\"verifyToken\":\"${VERIFY_TOKEN}\",\"callbackUrl\":\"${CALLBACK_URL}\"}"
echo
curl -sS "${BASE_URL}/wellness/strava/webhook/status"
echo
