#!/bin/bash
# Cosmix Production Deployment Script
# This script automates the deployment of latest changes to production

set -e  # Exit on any error

echo "=========================================="
echo "Cosmix Production Deployment"
echo "=========================================="
echo ""

# Configuration
PROD_IP="44.193.83.205"
APP_DIR="/opt/cosmix"
BRANCH="main"

echo "[1/5] Pulling latest code from GitHub..."
cd $APP_DIR
git pull origin $BRANCH

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to pull code from GitHub"
    exit 1
fi

echo "[2/5] Code pull completed successfully"
echo ""

echo "[3/5] Rebuilding and restarting web service..."
docker compose -f docker-compose.ec2.yml up -d --build web

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to rebuild and restart web service"
    exit 1
fi

echo "[4/5] Waiting for service to start (30-60 seconds)..."
sleep 30

echo "[5/5] Verifying deployment..."
echo ""

# Check if web service is running
if docker ps | grep -q "web"; then
    echo "✓ Web service is running"
else
    echo "✗ Web service failed to start"
    echo "Checking logs..."
    docker logs $(docker ps -a | grep web | awk '{print $1}' | head -1) --tail=20
    exit 1
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Production URL: http://$PROD_IP/"
echo ""
echo "To verify:"
echo "  - Visit http://$PROD_IP/"
echo "  - Check browser console for errors (F12)"
echo "  - Check logs: docker logs <container-id>"
echo ""
