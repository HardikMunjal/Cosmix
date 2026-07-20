#!/usr/bin/env bash
# Run on EC2: bash scripts/ec2-deploy-remote.sh [pull|prune|build|up|verify|all]
set -euo pipefail

STEP="${1:-all}"
COMPOSE="docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml"
SERVICES="${COSMIX_DEPLOY_SERVICES:-web api-gateway chat-service wellness-service}"
NO_CACHE="${COSMIX_NO_CACHE:-}"

cd /opt/cosmix

run_pull() {
  echo "=== STEP: pull ==="
  git fetch origin main
  git pull origin main
  git log -1 --oneline
  if [ -f .env ] && [ ! -f infra/.env ]; then
    cp .env infra/.env
    echo "Synced root .env -> infra/.env"
  fi
  if [ ! -f infra/.env ]; then
    echo "ERROR: infra/.env missing"
    exit 1
  fi
}

run_prune() {
  echo "=== STEP: prune ==="
  docker container prune -f || true
  docker image prune -af || true
  docker builder prune -af || true
  docker system prune -af || true
  df -h / | tail -1
  docker system df
}

run_build() {
  echo "=== STEP: build ($SERVICES) ==="
  if [ "$NO_CACHE" = "1" ]; then
    $COMPOSE build --no-cache $SERVICES
  else
    $COMPOSE build $SERVICES
  fi
}

run_up() {
  echo "=== STEP: up ==="
  $COMPOSE up -d --force-recreate nginx web api-gateway chat-service wellness-service auth-service user-service
  $COMPOSE ps
}

run_verify() {
  echo "=== STEP: verify ==="
  git log -1 --oneline
  $COMPOSE ps
  docker system df
  curl -fsS -o /dev/null -w "home:%{http_code}\n" http://127.0.0.1/ || true
}

case "$STEP" in
  pull) run_pull ;;
  prune) run_prune ;;
  build) run_build ;;
  up) run_up ;;
  verify) run_verify ;;
  all)
    run_pull
    run_prune
    run_build
    run_up
    run_verify
    ;;
  *)
    echo "Unknown step: $STEP (use pull|prune|build|up|verify|all)"
    exit 1
    ;;
esac

echo "=== DONE: $STEP ==="
