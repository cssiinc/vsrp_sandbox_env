################################################################################
# CloudWatch Log Groups (ECS container logs)
#
# One log group per container: frontend, backend, backend-init.
# ECS awslogs driver streams stdout/stderr to these groups.
# Retention: 14 days (app), 7 days (init) per README.
################################################################################

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${var.project}/${var.environment}/frontend"
  retention_in_days = 14
  kms_key_id        = null # Use default encryption for sandbox

  tags = {
    Name = "${var.project}-${var.environment}-frontend-logs"
  }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project}/${var.environment}/backend"
  retention_in_days = 14
  kms_key_id        = null

  tags = {
    Name = "${var.project}-${var.environment}-backend-logs"
  }
}

resource "aws_cloudwatch_log_group" "backend_init" {
  name              = "/ecs/${var.project}/${var.environment}/backend-init"
  retention_in_days = 7
  kms_key_id        = null

  tags = {
    Name = "${var.project}-${var.environment}-backend-init-logs"
  }
}
