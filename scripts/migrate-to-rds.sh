#!/usr/bin/env bash
# migrate-to-rds.sh
#
# Migrates data from the Docker postgres container to AWS RDS.
# Run this ON the EC2 host after 'terraform apply' creates the RDS instance.
#
# Usage:
#   ssh into EC2, then:
#   bash /opt/cosmix/scripts/migrate-to-rds.sh <rds-endpoint> <db-password>
#
# Get rds-endpoint from:  cd infra/terraform/ec2 && terraform output rds_endpoint
# Get db-password from:   your terraform.tfvars

set -euo pipefail

RDS_HOST="${1:?Usage: $0 <rds-endpoint> <db-password>}"
DB_PASS="${2:?Usage: $0 <rds-endpoint> <db-password>}"
DB_USER="cosmix"
DB_NAME="cosmix"
RDS_PORT=5432
APP_DIR="/opt/cosmix"

echo "==> RDS host: $RDS_HOST"

# ── 1. Install postgresql client on EC2 host ────────────────────────────────
if ! command -v psql &>/dev/null; then
  echo "==> Installing postgresql15 client..."
  dnf install -y postgresql15
fi

# ── 2. Dump current Docker postgres ─────────────────────────────────────────
echo "==> Dumping existing database from Docker container..."
docker exec infra-postgres-1 \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
  > /tmp/cosmix-backup.sql
echo "    Lines: $(wc -l < /tmp/cosmix-backup.sql)"

# ── 3. Restore into RDS ─────────────────────────────────────────────────────
echo "==> Restoring to RDS..."
PGPASSWORD="$DB_PASS" psql \
  -h "$RDS_HOST" -p "$RDS_PORT" \
  -U "$DB_USER" -d "$DB_NAME" \
  -f /tmp/cosmix-backup.sql
echo "    Restore complete."

# ── 4. Verify row counts ─────────────────────────────────────────────────────
echo "==> Verifying tables in RDS:"
PGPASSWORD="$DB_PASS" psql \
  -h "$RDS_HOST" -p "$RDS_PORT" \
  -U "$DB_USER" -d "$DB_NAME" \
  -c "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;"

# ── 5. Update DATABASE_URL in .env ──────────────────────────────────────────
echo "==> Updating DATABASE_URL in $APP_DIR/infra/.env..."
ENCODED_PASS=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")
NEW_URL="postgres://${DB_USER}:${ENCODED_PASS}@${RDS_HOST}:${RDS_PORT}/${DB_NAME}"
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_URL}|" "$APP_DIR/infra/.env"
echo "    New DATABASE_URL written (password hidden)."

# ── 6. Restart services to pick up new DATABASE_URL ─────────────────────────
echo "==> Restarting application services (not postgres)..."
cd "$APP_DIR/infra"
docker compose -f docker-compose.ec2.yml -f docker-compose.ec2.https.yml up -d \
  --force-recreate \
  auth-service chat-service user-service wellness-service api-gateway web nginx

echo "==> Waiting 10s for services to start..."
sleep 10

echo "==> Service status:"
docker compose -f docker-compose.ec2.yml -f docker-compose.ec2.https.yml ps

echo ""
echo "✓ Migration complete!"
echo ""
echo "Next steps:"
echo "  1. Test the app at https://44-193-83-205.nip.io"
echo "  2. Once verified, stop the old postgres container:"
echo "       docker stop infra-postgres-1"
echo "  3. Remove the 'postgres' service from docker-compose.ec2.yml"
echo "     and commit the change to git."
echo "  4. The backup dump is at /tmp/cosmix-backup.sql — remove when done."
