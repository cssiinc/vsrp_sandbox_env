################################################################################
# ECS Cluster + Services (terraform-aws-modules/ecs/aws)
#
# Cluster: vsrp-sandbox-env. 2 services: frontend (nginx+SPA), backend (Node).
# desired_count=0 initially; first app-deploy sets to 1.
# Fargate; app subnets; app-sg; ALB target groups for path-based routing.
################################################################################

# -------------------------------------------------------------------------------
# Task execution role: ECR pull, Secrets Manager, CloudWatch Logs
# Required for Fargate to pull images and fetch DB credentials
# -------------------------------------------------------------------------------
resource "aws_iam_role" "ecs_task_execution" {
  name_prefix = "${var.project}-ecs-exec-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name = "${var.project}-ecs-task-execution"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow task execution role to read Secrets Manager (DB credentials)
data "aws_iam_policy_document" "ecs_task_execution_secrets" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      module.rds.db_instance_master_user_secret_arn
    ]
  }
}

resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name   = "secrets-manager"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_task_execution_secrets.json
}

# -------------------------------------------------------------------------------
# ECS cluster + services (terraform-aws-modules/ecs/aws)
# -------------------------------------------------------------------------------
module "ecs" {
  source  = "terraform-aws-modules/ecs/aws"
  version = "~> 7.0"

  cluster_name = "${var.project}-${var.environment}"

  # Fargate capacity
  cluster_capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy = {
    FARGATE = {
      weight = 1
      base   = 0
    }
  }

  # No cluster-level security group; services use app_sg
  create_security_group = false

  # Services: frontend and backend, desired_count=0
  services = {
    frontend = {
      cpu    = 256 # 0.25 vCPU
      memory = 512 # 0.5 GB

      # Use our custom task execution role (has Secrets Manager access)
      create_task_exec_iam_role = false
      task_exec_iam_role_arn    = aws_iam_role.ecs_task_execution.arn

      desired_count = 0

      # Auto-rollback on failed deployments
      deployment_circuit_breaker = {
        enable   = true
        rollback = true
      }

      # Use existing app subnet and SG
      subnet_ids         = local.app_subnet_ids
      security_group_ids = [local.app_security_group_id]

      # ALB target group attachment
      load_balancer = {
        service = {
          target_group_arn = module.alb.target_groups["frontend"].arn
          container_name   = "frontend"
          container_port   = 80
        }
      }

      container_definitions = {
        frontend = {
          essential                = true
          image                    = "${module.ecr["frontend"].repository_url}:latest"
          readonlyRootFilesystem   = false # nginx needs writable /var/cache/nginx and /var/run
          portMappings = [{
            name          = "frontend"
            containerPort = 80
            hostPort      = 80
            protocol      = "tcp"
          }]
          logConfiguration = {
            logDriver = "awslogs"
            options = {
              "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
              "awslogs-region"        = var.aws_region
              "awslogs-stream-prefix" = "ecs"
            }
          }
        }
      }
    }

    backend = {
      cpu    = 256
      memory = 512

      # Use our custom task execution role (has Secrets Manager access)
      create_task_exec_iam_role = false
      task_exec_iam_role_arn    = aws_iam_role.ecs_task_execution.arn

      desired_count = 0

      # Auto-rollback on failed deployments
      deployment_circuit_breaker = {
        enable   = true
        rollback = true
      }

      subnet_ids         = local.app_subnet_ids
      security_group_ids = [local.app_security_group_id]

      load_balancer = {
        service = {
          target_group_arn = module.alb.target_groups["backend"].arn
          container_name   = "backend"
          container_port   = 3000
        }
      }

      # Backend: main container + init container for schema migration
      container_definitions = {
        backend-init = {
          essential = false
          image     = "${module.ecr["backend"].repository_url}:latest"
          command   = ["node", "run-migration.js"]
          environment = [{
            name  = "DB_SECRET_ARN"
            value = module.rds.db_instance_master_user_secret_arn
          }]
          logConfiguration = {
            logDriver = "awslogs"
            options = {
              "awslogs-group"         = aws_cloudwatch_log_group.backend_init.name
              "awslogs-region"        = var.aws_region
              "awslogs-stream-prefix" = "init"
            }
          }
        }
        backend = {
          essential = true
          image     = "${module.ecr["backend"].repository_url}:latest"
          portMappings = [{
            name          = "backend"
            containerPort = 3000
            hostPort      = 3000
            protocol      = "tcp"
          }]
          environment = [{
            name  = "DB_SECRET_ARN"
            value = module.rds.db_instance_master_user_secret_arn
          }]
          logConfiguration = {
            logDriver = "awslogs"
            options = {
              "awslogs-group"         = aws_cloudwatch_log_group.backend.name
              "awslogs-region"        = var.aws_region
              "awslogs-stream-prefix" = "ecs"
            }
          }
          dependsOn = [{
            containerName = "backend-init"
            condition     = "SUCCESS"
          }]
        }
      }
    }
  }

  tags = {
    Name = "${var.project}-${var.environment}"
  }
}

# -------------------------------------------------------------------------------
# Grant backend task role Secrets Manager access (containers call SM at runtime)
# -------------------------------------------------------------------------------
resource "aws_iam_role_policy" "backend_task_secrets" {
  name   = "secrets-manager"
  role   = module.ecs.services["backend"].tasks_iam_role_name
  policy = data.aws_iam_policy_document.ecs_task_execution_secrets.json
}
