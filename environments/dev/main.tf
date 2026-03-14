################################################################################
# vsrp-sandbox-env — 3-Tier Private Containerized App
#
# Architecture: ALB → ECS Fargate (frontend + backend) → RDS PostgreSQL
# All traffic private; network from vsrp-sandbox-dev spoke (network-hub).
#
# Terraform Cloud: state and runs via TFC. Create workspace with tags
# ["vsrp-sandbox-env", "dev"] or name vsrp-sandbox-env-dev.
################################################################################

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.9"
    }
  }

  # TFC: state and runs managed in Terraform Cloud
  cloud {
    organization = "cssi"
    workspaces {
      tags = ["vsrp-sandbox-env", "dev"]
    }
  }
}

# AWS provider: region from variable; default_tags applied to all resources
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project
      ManagedBy   = "terraform"
    }
  }
}
