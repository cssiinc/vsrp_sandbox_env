################################################################################
# RDS PostgreSQL + Secrets Manager (terraform-aws-modules/rds/aws)
#
# Single-AZ sandbox: db.t4g.micro, 20 GB gp3, encrypted.
# Credentials: manage_master_user_password stores in Secrets Manager.
# ECS backend fetches secret at startup via DB_SECRET_ARN env var.
################################################################################

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 7.0"

  identifier = "${var.project}-${var.environment}"

  # ---------------------------------------------------------------------------
  # Engine: PostgreSQL 15
  # ---------------------------------------------------------------------------
  engine               = "postgres"
  engine_version       = "15"
  family               = "postgres15"
  major_engine_version = "15"

  # ---------------------------------------------------------------------------
  # Instance: db.t4g.micro (ARM, cost-effective for sandbox)
  # ---------------------------------------------------------------------------
  instance_class    = "db.t4g.micro"
  allocated_storage = local.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  # ---------------------------------------------------------------------------
  # Database name; credentials in Secrets Manager
  # ---------------------------------------------------------------------------
  db_name  = local.db_name
  username = "vsrp_admin"
  # Password managed by RDS → Secrets Manager (manage_master_user_password)
  manage_master_user_password = true

  # ---------------------------------------------------------------------------
  # Network: data subnets, data SG (allows 5432 from app-sg)
  # ---------------------------------------------------------------------------
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [local.data_security_group_id]

  # ---------------------------------------------------------------------------
  # Single-AZ for sandbox (cost savings)
  # ---------------------------------------------------------------------------
  multi_az = false

  # ---------------------------------------------------------------------------
  # Backup: 7-day retention for sandbox
  # ---------------------------------------------------------------------------
  backup_retention_period = 7
  backup_window           = "03:00-04:00"

  tags = {
    Name = "${var.project}-${var.environment}-rds"
  }
}

# DB subnet group: data subnets from network-hub
resource "aws_db_subnet_group" "this" {
  name        = "${var.project}-${var.environment}-db"
  description = "DB subnet group for ${var.project}"
  subnet_ids  = local.data_subnet_ids

  tags = {
    Name = "${var.project}-${var.environment}-db-subnet"
  }
}
