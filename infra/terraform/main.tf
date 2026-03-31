provider "aws" {
  region = "us-east-1"
}

resource "aws_vpc" "cosmix_vpc" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "cosmix_subnet" {
  vpc_id            = aws_vpc.cosmix_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_db_instance" "cosmix_db" {
  identifier         = "cosmix-db"
  engine            = "postgres"
  instance_class    = "db.t2.micro"
  allocated_storage  = 20
  username          = var.db_username
  password          = var.db_password
  db_name           = "cosmix"
  skip_final_snapshot = true
  vpc_security_group_ids = [aws_security_group.cosmix_sg.id]
}

resource "aws_security_group" "cosmix_sg" {
  vpc_id = aws_vpc.cosmix_vpc.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

output "db_endpoint" {
  value = aws_db_instance.cosmix_db.endpoint
}