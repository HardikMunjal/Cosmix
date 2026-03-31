# Cosmix - A Social Platform

Cosmix is a modern social platform built using a microservice architecture. The project leverages Node.js and Nest.js for the backend, while the frontend is developed using React and Next.js. The application is designed to be scalable and efficient, utilizing Docker and Kubernetes for container orchestration on an AWS stack.

## Project Structure

The project is organized as a monorepo, containing multiple independent services and applications:

- **apps**
  - **api-gateway**: The entry point for the API, handling requests and routing to appropriate services.
  - **web**: The web application built with Next.js, providing a responsive user interface.
  - **mobile**: The mobile application, designed for both iOS and Android platforms.

- **services**
  - **auth-service**: Manages user authentication and login functionalities.
  - **chat-service**: Handles real-time chat functionalities.
  - **user-service**: Manages user profiles and related operations.

- **packages**
  - **ui**: Contains reusable UI components and styles shared across applications.
  - **common**: Utility functions and shared logic across services.
  - **db**: Database entities and configurations for PostgreSQL.
  - **types**: TypeScript type definitions shared across the project.

- **infra**
  - **kubernetes**: Kubernetes deployment configurations for all services.
  - **helm**: Helm charts for managing Kubernetes applications.
  - **terraform**: Infrastructure as code for provisioning resources on AWS.
  - **docker-compose.yml**: Configuration for local development using Docker.

- **scripts**: Shell scripts for building and running the project.

## Features

- **Microservices Architecture**: Each service is independently deployable and scalable.
- **Responsive Design**: The web and mobile applications are designed to accommodate various screen sizes.
- **Real-time Chat**: Users can communicate in real-time through the chat service.
- **User Authentication**: Secure login and user management functionalities.

## Getting Started

To get started with the Cosmix project, follow these steps:

1. Clone the repository:
   ```
   git clone <repository-url>
   cd Cosmix
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

3. Start the development environment:
   ```
   ./scripts/dev.sh
   ```

4. Access the web application at `http://localhost:3000` and the API at `http://localhost:3001`.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.