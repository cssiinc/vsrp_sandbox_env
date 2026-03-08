################################################################################
# vsrp-sandbox-env Variables
#
# Network (vpc_id, subnets, SGs) discovered via data.tf from AWS — no variables.
# Optional: vpc_name to override lookup (default: vsrp-sandbox-dev).
################################################################################

# -------------------------------------------------------------------------------
# Network lookup (optional override)
# -------------------------------------------------------------------------------

variable "vpc_name" {
  description = "VPC Name tag for lookup (data.tf discovers resources from AWS)"
  type        = string
  default     = "vsrp-sandbox-dev"
}

# -------------------------------------------------------------------------------
# General
# -------------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, qa, prod)"
  type        = string
  default     = "dev"
}

variable "project" {
  description = "Project name; used for resource naming and ECR repo prefix"
  type        = string
  default     = "vsrp-sandbox-env"
}

# -------------------------------------------------------------------------------
# No RDS or ALB variables — values in locals (rds.tf, alb.tf)
# db_name, db_allocated_storage, alb_allowed_cidrs are hardcoded for sandbox.
# -------------------------------------------------------------------------------
