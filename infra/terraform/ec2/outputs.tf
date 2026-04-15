output "public_ip" {
  value       = aws_instance.cosmix.public_ip
  description = "Public IPv4 address of the Cosmix EC2 instance"
}

output "public_dns" {
  value       = aws_instance.cosmix.public_dns
  description = "Public DNS name of the Cosmix EC2 instance"
}

output "ssh_command" {
  value       = "ssh -i <path-to-private-key> ec2-user@${aws_instance.cosmix.public_ip}"
  description = "SSH command template for connecting to the instance"
}

output "key_pair_name" {
  value       = local.effective_key_pair_name
  description = "AWS EC2 key pair name attached to the instance"
}

output "app_directory" {
  value       = var.app_directory
  description = "Directory where the app should be cloned or copied"
}