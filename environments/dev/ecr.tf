################################################################################
# ECR Repositories (terraform-aws-modules/ecr/aws)
#
# Two private repos: vsrp-sandbox-env/frontend, vsrp-sandbox-env/backend
# Used by ECS Fargate to pull container images. GitHub Actions pushes on deploy.
#
# Module provides: encryption, scan-on-push, lifecycle policy, repository policy.
# Using registry module ensures we get full config options without adding later.
################################################################################

locals {
  # Repo names for for_each; full name = project/key (e.g. vsrp-sandbox-env/frontend)
  ecr_repos = ["frontend", "backend"]
}

module "ecr" {
  source  = "terraform-aws-modules/ecr/aws"
  version = "~> 3.0"

  for_each = toset(local.ecr_repos)

  # ---------------------------------------------------------------------------
  # Repository identity
  # ---------------------------------------------------------------------------
  repository_name = "${var.project}/${each.key}"

  # IMMUTABLE: each tag is unique and traceable; CI pushes commit SHA tags
  repository_image_tag_mutability = "IMMUTABLE"

  # ---------------------------------------------------------------------------
  # Security: encryption at rest, scan on push
  # ---------------------------------------------------------------------------
  repository_encryption_type    = "AES256"
  repository_image_scan_on_push = true

  # ---------------------------------------------------------------------------
  # Access: no custom repository policy; same-account ECS pull uses default
  # ---------------------------------------------------------------------------
  attach_repository_policy = false
  create_repository_policy = false

  # ---------------------------------------------------------------------------
  # Lifecycle: retain last 10 images, expire untagged after 7 days
  # Prevents unbounded storage growth in sandbox
  # ---------------------------------------------------------------------------
  create_lifecycle_policy = true
  repository_lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })

  # ---------------------------------------------------------------------------
  # Tags (in addition to provider default_tags)
  # ---------------------------------------------------------------------------
  tags = {
    Name = "${var.project}-${each.key}"
  }
}
