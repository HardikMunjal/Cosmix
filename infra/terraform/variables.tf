variable "aws_region" {
  description = "The AWS region where resources will be provisioned"
  type        = string
  default     = "us-east-1"
}

variable "db_username" {
  description = "The username for the PostgreSQL database"
  type        = string
}

variable "db_password" {
  description = "The password for the PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "The name of the PostgreSQL database"
  type        = string
  default     = "cosmix_db"
}

variable "auth_service_image" {
  description = "Docker image for the Auth service"
  type        = string
}

variable "chat_service_image" {
  description = "Docker image for the Chat service"
  type        = string
}

variable "user_service_image" {
  description = "Docker image for the User service"
  type        = string
}

variable "api_gateway_image" {
  description = "Docker image for the API Gateway"
  type        = string
}