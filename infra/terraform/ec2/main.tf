terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["137112412989"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "cosmix" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "cosmix-ec2-vpc"
  }
}

resource "aws_internet_gateway" "cosmix" {
  vpc_id = aws_vpc.cosmix.id

  tags = {
    Name = "cosmix-ec2-igw"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.cosmix.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true

  tags = {
    Name = "cosmix-ec2-public-subnet"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.cosmix.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.cosmix.id
  }

  tags = {
    Name = "cosmix-ec2-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "cosmix" {
  name        = "cosmix-ec2-sg"
  description = "Ingress for Cosmix single-instance deployment"
  vpc_id      = aws_vpc.cosmix.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  ingress {
    description = "Web app"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.public_ingress_cidrs
  }

  ingress {
    description = "API gateway"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = var.public_ingress_cidrs
  }

  ingress {
    description = "Chat websocket"
    from_port   = 3002
    to_port     = 3002
    protocol    = "tcp"
    cidr_blocks = var.public_ingress_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "cosmix-ec2-sg"
  }
}

resource "aws_instance" "cosmix" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.cosmix.id]
  key_name                    = var.key_pair_name
  associate_public_ip_address = true

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    app_directory = var.app_directory
    repo_branch   = var.repo_branch
    repo_url      = var.repo_url
    swap_size_mb  = var.swap_size_mb
  })

  root_block_device {
    volume_size = var.root_volume_size_gb
    volume_type = "gp3"
  }

  tags = {
    Name = "cosmix-ec2"
  }
}