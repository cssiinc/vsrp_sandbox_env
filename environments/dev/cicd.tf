################################################################################
# GitHub Actions OIDC — IAM role for app-deploy workflow
#
# Allows: ECR push, ECS UpdateService. No static keys.
# Create GitHub repo secret AWS_ROLE_ARN with the role ARN output.
#
# Requires: vars.github_repository (e.g. "myorg/vsrp_sandbox_env")
################################################################################

variable "github_repository" {
  description = "GitHub org/repo for OIDC trust (e.g. myorg/vsrp_sandbox_env)"
  type        = string
  default     = ""
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN; leave empty to create one"
  type        = string
  default     = ""
}

# GitHub OIDC provider (account-level; create only if not provided)
resource "aws_iam_openid_connect_provider" "github" {
  count = var.github_repository != "" && var.github_oidc_provider_arn == "" ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]

  tags = {
    Name = "github-actions-oidc"
  }
}

locals {
  github_oidc_arn = coalesce(var.github_oidc_provider_arn, try(aws_iam_openid_connect_provider.github[0].arn, ""))
}

# IAM role for GitHub Actions
resource "aws_iam_role" "github_actions" {
  count = var.github_repository != "" ? 1 : 0

  name_prefix = "${var.project}-gha-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = local.github_oidc_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Only allow main branch pushes to assume this role
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:ref:refs/heads/main"
        }
      }
    }]
  })

  tags = {
    Name = "${var.project}-github-actions"
  }
}

# Policy: ECR push + ECS update
data "aws_iam_policy_document" "github_actions" {
  count = var.github_repository != "" ? 1 : 0

  statement {
    sid    = "ECR"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ECRPush"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload"
    ]
    resources = [
      module.ecr["frontend"].repository_arn,
      module.ecr["backend"].repository_arn
    ]
  }

  # RegisterTaskDefinition and DescribeTaskDefinition are global (no resource/condition scoping)
  statement {
    sid    = "ECSTaskDef"
    effect = "Allow"
    actions = [
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeTaskDefinition"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ECSService"
    effect = "Allow"
    actions = [
      "ecs:UpdateService",
      "ecs:DescribeServices"
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ecs:cluster"
      values   = [module.ecs.cluster_arn]
    }
  }

  # Pass the task execution role to ECS when registering task definitions
  statement {
    sid    = "PassRole"
    effect = "Allow"
    actions = [
      "iam:PassRole"
    ]
    resources = [
      aws_iam_role.ecs_task_execution.arn
    ]
  }

  # ECR scan results for vulnerability gating in CI/CD
  statement {
    sid    = "ECRScan"
    effect = "Allow"
    actions = [
      "ecr:DescribeImageScanFindings"
    ]
    resources = [
      module.ecr["frontend"].repository_arn,
      module.ecr["backend"].repository_arn
    ]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  count = var.github_repository != "" ? 1 : 0

  name   = "ecr-ecs-deploy"
  role   = aws_iam_role.github_actions[0].id
  policy = data.aws_iam_policy_document.github_actions[0].json
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC — set as repo secret AWS_ROLE_ARN"
  value       = var.github_repository != "" ? aws_iam_role.github_actions[0].arn : null
}
