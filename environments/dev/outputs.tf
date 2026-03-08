################################################################################
# vsrp-sandbox-env Outputs
#
# Outputs consumed by: GitHub Actions (ECR URLs), operators (ALB DNS), etc.
# Additional outputs added as resources are created (ALB, ECS, RDS).
################################################################################

output "vpc_id" {
  description = "VPC ID from network-hub spoke (vsrp-sandbox-dev)"
  value       = local.vpc_id
}

output "ecr_frontend_url" {
  description = "ECR repository URL for frontend image (used by frontend-deploy workflow)"
  value       = module.ecr["frontend"].repository_url
}

output "ecr_backend_url" {
  description = "ECR repository URL for backend image (used by backend-deploy workflow)"
  value       = module.ecr["backend"].repository_url
}

output "alb_dns_name" {
  description = "ALB DNS name for access (requires VPN; internal ALB)"
  value       = module.alb.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID for Route 53 alias records (optional)"
  value       = module.alb.zone_id
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (for backend connection)"
  value       = module.rds.db_instance_endpoint
}

output "db_secret_arn" {
  description = "Secrets Manager ARN for DB credentials (injected into backend container)"
  value       = try(module.rds.db_instance_master_user_secret[0].secret_arn, null)
}
