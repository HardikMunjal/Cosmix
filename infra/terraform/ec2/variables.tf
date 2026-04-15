variable "aws_region" {
  description = "AWS region for the EC2 deployment"
  type        = string
  default     = "us-east-1"
}

variable "availability_zone" {
  description = "Availability zone for the public subnet"
  type        = string
  default     = "us-east-1a"
}

variable "instance_type" {
  description = "EC2 instance type for the single-node deployment"
  type        = string
  default     = "t3.micro"
}

variable "key_pair_name" {
  description = "Existing AWS EC2 key pair name used for SSH access"
  type        = string
  default     = ""
}

variable "create_key_pair" {
  description = "Create a new AWS EC2 key pair from a local public key"
  type        = bool
  default     = false
}

variable "public_key_path" {
  description = "Path to the local SSH public key used when create_key_pair is true"
  type        = string
  default     = ""

  validation {
    condition     = var.create_key_pair == false || length(trimspace(var.public_key_path)) > 0
    error_message = "public_key_path must be set when create_key_pair is true."
  }
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH into the instance"
  type        = string
  default     = "0.0.0.0/0"
}

variable "public_ingress_cidrs" {
  description = "CIDRs allowed to reach the public application ports"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.42.1.0/24"
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 12
}

variable "swap_size_mb" {
  description = "Swap file size in MB to add on the EC2 instance for small instance types"
  type        = number
  default     = 2048
}

variable "app_directory" {
  description = "Target directory on the EC2 instance where the repo will live"
  type        = string
  default     = "/opt/cosmix"
}

variable "repo_url" {
  description = "Optional Git URL to clone on first boot. Leave empty to copy the repo manually after provisioning"
  type        = string
  default     = ""
}

variable "repo_branch" {
  description = "Git branch to clone when repo_url is provided"
  type        = string
  default     = "main"
}