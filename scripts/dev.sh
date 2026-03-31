#!/bin/bash

# Start the development environment for Cosmix

# Navigate to the API Gateway and start the service
cd apps/api-gateway
npm install
npm run start:dev &

# Navigate to the Auth Service and start the service
cd ../auth-service
npm install
npm run start:dev &

# Navigate to the Chat Service and start the service
cd ../chat-service
npm install
npm run start:dev &

# Navigate to the User Service and start the service
cd ../user-service
npm install
npm run start:dev &

# Navigate to the Web application and start the service
cd ../../web
npm install
npm run dev &

# Navigate to the Mobile application and start the service
cd ../mobile
npm install
npm run start &

# Wait for all services to start
wait

echo "Development environment for Cosmix is up and running!"