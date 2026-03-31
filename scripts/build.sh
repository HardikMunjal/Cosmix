#!/bin/bash

# Build the Docker images for all services
echo "Building Docker images..."

# Build API Gateway
cd apps/api-gateway
docker build -t cosmix/api-gateway .

# Build Auth Service
cd ../../services/auth-service
docker build -t cosmix/auth-service .

# Build Chat Service
cd ../chat-service
docker build -t cosmix/chat-service .

# Build User Service
cd ../user-service
docker build -t cosmix/user-service .

# Build Web Application
cd ../../../apps/web
docker build -t cosmix/web .

# Build Mobile Application
cd ../mobile
docker build -t cosmix/mobile .

echo "Docker images built successfully."