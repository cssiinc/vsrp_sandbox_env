# CI/CD Setup: App Deploy

The `app-deploy.yml` workflow builds and deploys the frontend and backend on push to `main` when `app/**` changes.

## Prerequisites

- Terraform applied (ECR repos, ECS cluster, OIDC role exist)
- `github_repository` var set in Terraform (e.g. `"myorg/vsrp_sandbox_env"`)

## GitHub Repository Configuration

### 1. Variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Example | Description |
|----------|---------|-------------|
| `AWS_ACCOUNT_ID` | `123456789012` | Your AWS account ID |
| `AWS_REGION` | `us-east-1` | Default `us-east-1` |
| `ECS_CLUSTER` | `vsrp-sandbox-env-dev` | ECS cluster name |

### 2. Secret

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN` | IAM role ARN from Terraform output `github_actions_role_arn` |

### 3. Get the role ARN

After Terraform apply:

```bash
terraform -chdir=environments/dev output github_actions_role_arn
```

Or from TFC: workspace → Outputs → `github_actions_role_arn`.

Copy the value and add it as repo secret `AWS_ROLE_ARN`.

## Workflow Behavior

- **Trigger:** Push to `main` with changes under `app/`, or manual `workflow_dispatch`
- **Jobs:** Two parallel jobs — `deploy-frontend` and `deploy-backend`
- **Steps:** Checkout → AWS OIDC auth → ECR login → Docker build → Push → ECS force-new-deployment

## package-lock.json

Dockerfiles use `npm ci` when `package-lock.json` exists, otherwise `npm install`. For reproducible builds, run `npm install` in `app/backend` and `app/frontend` and commit the lock files.
