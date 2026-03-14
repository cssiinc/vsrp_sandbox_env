################################################################################
# ECR Pull Through Cache
#
# Caches public registry images in this account's ECR, eliminating runtime
# dependency on Docker Hub and ECR Public during CI builds.
#
# Dockerfiles reference images via the pull-through cache URL:
#   <account>.dkr.ecr.<region>.amazonaws.com/docker-hub/node:20-alpine
#   <account>.dkr.ecr.<region>.amazonaws.com/ecr-public/amazonlinux:2023
#
# On first pull, ECR fetches from upstream and caches. Subsequent pulls are
# served from ECR — no public registry dependency. Inspector scans cached images.
#
# Setup required after apply:
#   Populate Docker Hub credentials in Secrets Manager (see comment below).
################################################################################

# Note: data.aws_caller_identity.current is declared in alb.tf

# ---------------------------------------------------------------------------
# ECR Public — no credentials required
# ---------------------------------------------------------------------------
resource "aws_ecr_pull_through_cache_rule" "ecr_public" {
  ecr_repository_prefix = "ecr-public"
  upstream_registry_url = "public.ecr.aws"
}

# ---------------------------------------------------------------------------
# Docker Hub — credentials stored in Secrets Manager
#
# Set docker_hub_username and docker_hub_access_token as sensitive
# Terraform variables in the TFC workspace before applying.
#
# Get a PAT at: https://hub.docker.com/settings/security
# Required scope: Public Repo Read
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "docker_hub" {
  name                    = "ecr-pullthroughcache/${var.project}-docker-hub-credentials"
  description             = "Docker Hub PAT for ECR pull-through cache (username + accessToken)"
  recovery_window_in_days = 0 # Sandbox: allow immediate deletion

  tags = {
    Name = "${var.project}-docker-hub-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "docker_hub" {
  secret_id = aws_secretsmanager_secret.docker_hub.id
  secret_string = jsonencode({
    username    = var.docker_hub_username
    accessToken = var.docker_hub_access_token
  })
}

resource "aws_ecr_pull_through_cache_rule" "docker_hub" {
  ecr_repository_prefix = "docker-hub"
  upstream_registry_url = "registry-1.docker.io"
  credential_arn        = aws_secretsmanager_secret.docker_hub.arn

  depends_on = [aws_secretsmanager_secret_version.docker_hub]
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
output "ecr_registry" {
  description = "ECR registry URL — use as REGISTRY build-arg in Dockerfiles"
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "docker_hub_secret_arn" {
  description = "Secrets Manager ARN to populate with Docker Hub credentials after apply"
  value       = aws_secretsmanager_secret.docker_hub.arn
}
