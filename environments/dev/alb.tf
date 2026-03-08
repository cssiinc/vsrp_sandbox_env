################################################################################
# Application Load Balancer (terraform-aws-modules/alb/aws)
#
# Internal ALB in app subnets. Path-based routing:
#   /api/*  → backend target group (port 3000)
#   /*      → frontend target group (port 80) — default
#
# Access: on-prem (10.14.0.0/16) and Client VPN via alb_allowed_cidrs.
# Access logs: S3 bucket for audit and debugging.
################################################################################

# -------------------------------------------------------------------------------
# Data sources: account ID, ELB service account (for S3 policy)
# VPC from data.tf (local.vpc_id, data.aws_vpc.spoke)
# -------------------------------------------------------------------------------
data "aws_caller_identity" "current" {}

data "aws_elb_service_account" "main" {}

# -------------------------------------------------------------------------------
# S3 bucket for ALB access logs
# Required for access_logs; bucket policy allows ELB to write
# -------------------------------------------------------------------------------
resource "aws_s3_bucket" "alb_logs" {
  bucket = "${var.project}-${var.environment}-alb-logs-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.project}-${var.environment}-alb-logs"
  }
}

# Block public access — logs contain client IPs and paths
resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Encryption at rest
resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Bucket policy: allow ELB to write logs (required by AWS)
# https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html
resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AWSLogDeliveryWrite"
        Effect    = "Allow"
        Principal = { AWS = data.aws_elb_service_account.main.arn }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/*"
      },
      {
        Sid       = "AWSLogDeliveryAcl"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.alb_logs.arn
      }
    ]
  })
}

# -------------------------------------------------------------------------------
# ALB module: internal, path-based routing, access logs
# -------------------------------------------------------------------------------
module "alb" {
  source  = "terraform-aws-modules/alb/aws"
  version = "~> 10.0"

  name    = "${var.project}-${var.environment}"
  vpc_id  = local.vpc_id
  subnets = local.app_subnet_ids

  # Internal only — no public IP; access via VPN/TGW
  internal = true

  # Sandbox: no deletion protection
  enable_deletion_protection = false

  # ---------------------------------------------------------------------------
  # Security group: ingress 80 from allowed CIDRs, egress to VPC
  # ---------------------------------------------------------------------------
  create_security_group = true
  security_group_ingress_rules = {
    for i, cidr in local.alb_allowed_cidrs :
    "http_${replace(replace(cidr, "/", "_"), ".", "_")}" => {
      from_port   = 80
      to_port     = 80
      ip_protocol = "tcp"
      description = "HTTP from ${cidr}"
      cidr_ipv4   = cidr
    }
  }
  security_group_egress_rules = {
    vpc = {
      ip_protocol = "-1"
      cidr_ipv4   = data.aws_vpc.spoke.cidr_block
      description = "All traffic to VPC (ECS targets)"
    }
  }

  # ---------------------------------------------------------------------------
  # Access logs: S3 bucket for request audit
  # ---------------------------------------------------------------------------
  access_logs = {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  # ---------------------------------------------------------------------------
  # Listener: HTTP 80, default → frontend, /api/* → backend
  # Priority 1 = evaluated first; default handles remainder
  # ---------------------------------------------------------------------------
  listeners = {
    http = {
      port     = 80
      protocol = "HTTP"

      # Default: forward to frontend (SPA)
      forward = {
        target_group_key = "frontend"
      }

      # Path-based rule: /api/* goes to backend
      rules = {
        api = {
          priority = 1
          actions = [
            {
              forward = {
                target_group_key = "backend"
              }
            }
          ]
          conditions = [
            {
              path_pattern = {
                values = ["/api/*"]
              }
            }
          ]
        }
      }
    }
  }

  # ---------------------------------------------------------------------------
  # Target groups: ECS Fargate registers tasks (ip target type)
  # No target_id here — ECS service attaches tasks on deploy
  # ---------------------------------------------------------------------------
  target_groups = {
    frontend = {
      name_prefix       = "fe-"
      protocol          = "HTTP"
      port              = 80
      target_type       = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        path                = "/health"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 3
        timeout             = 5
        interval            = 30
      }
    }

    backend = {
      name_prefix       = "be-"
      protocol          = "HTTP"
      port              = 3000
      target_type       = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        path                = "/api/health"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 3
        timeout             = 5
        interval            = 30
      }
    }
  }

  tags = {
    Name = "${var.project}-${var.environment}-alb"
  }
}

# -------------------------------------------------------------------------------
# S3 lifecycle: expire ALB access logs after 90 days to control costs
# -------------------------------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire-logs-90-days"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}
