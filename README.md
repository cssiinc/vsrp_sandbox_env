# vsrp-sandbox-env: 2-Tier Private Containerized App

**Status:** Draft
**VPC:** vsrp-sandbox-dev (10.3.0.0/24)
**Subnets:** /27 per subnet (27 usable IPs each)
**Repo:** `02_gh/vsrp_sandbox_env`
**Region:** us-east-1 (us-east-1a, us-east-1b)

---

## 1. Design Goals

- **Private only** — No public subnets; access via AWS VPN through TGW or SSM bastion
- **Containerized** — ECS Fargate (no EC2 node management)
- **2-tier architecture** — Web (ALB) → App (Fargate); no database tier initially
- **Cost-conscious** — No NAT in spoke (hub provides); minimal Fargate sizing for sandbox
- **Learning-focused** — End-to-end exposure to ECS, ECR, CI/CD, and Terraform workflows

---

## 2. Architecture

The architecture is a 2-tier design: an internal Application Load Balancer fronting ECS Fargate tasks running a static nginx container. All traffic is private, routed through the Transit Gateway from on-prem or AWS VPN.

```
[ On-prem 10.14.0.0/16 ] --VPN/TGW--> [ Spoke VPC 10.3.0.0/24 ]
                                              |
                                              v
                                  [ Internal ALB ] :80
                                              |
                                              v
                                  [ ECS Fargate Tasks ]
```

### Web Tier (ALB)

- Scheme: internal (no public-facing endpoint)
- Subnets: app us-east-1a, app us-east-1b
- Listener: HTTP port 80 (HTTPS/443 optional later when domain and ACM cert are ready)
- DNS: default ALB hostname (*.elb.amazonaws.com); custom Route 53 record added later if needed

### App Tier (ECS Fargate)

- Cluster: vsrp-sandbox-env
- Service: 1 ECS service running nginx (static web page + health endpoint)
- Task sizing: 0.25 vCPU / 0.5 GB (Fargate minimum; sufficient for static content)
- Desired count: 1 (no autoscaling for sandbox)
- Subnets: app us-east-1a, app us-east-1b
- Images: stored in Amazon ECR; pulled by Fargate over TGW → hub NAT
- Outbound: TGW → hub NAT Gateway (for ECR, CloudWatch, S3 endpoints)

### Data Tier (Future)

No database tier in the initial deployment. When a database-backed application is needed, add RDS PostgreSQL 15 (db.t4g.micro, single-AZ, 20 GB gp3 encrypted) in the data subnets. Secrets Manager for credential management.

---

## 3. Security Groups

| SG | Inbound | Outbound |
|--------|----------------------------------------|----------------------------------------|
| alb-sg | 80 from 10.14.0.0/16 (on-prem) | Target port to app-sg (health checks) |
| | 80 from TBD (AWS Client VPN CIDR) | |
| app-sg | 80 from alb-sg | 443 to ECR/CloudWatch/S3 endpoints |

> **Note:** Replace TBD with the AWS Client VPN endpoint CIDR once confirmed.
>
> **Note:** data-sg (port 5432 from app-sg) will be added when the database tier is introduced.

---

## 4. Network & Access

### Routing

- Spoke VPC has 0.0.0.0/0 → TGW route confirmed
- Hub NAT Gateway provisioned and routing confirmed
- Fargate outbound (ECR pulls, CloudWatch logs) traverses TGW → hub NAT

### Access Paths

- **On-prem:** 10.14.0.0/16 → TGW → spoke VPC → internal ALB
- **AWS Client VPN:** TBD CIDR → TGW → spoke VPC → internal ALB
- No bastion initially

### DNS

Initial access uses the ALB's default AWS hostname. Custom DNS (e.g., sandbox.internal.company.com) via Route 53 private hosted zone is a future enhancement. VPN DNS resolution should be verified during testing.

---

## 5. Container Registry (ECR)

- Terraform creates the ECR repository (e.g., vsrp-sandbox-env/web)
- Lifecycle policy: retain last 10 images, expire untagged after 7 days
- Image URI format: `<account_id>.dkr.ecr.us-east-1.amazonaws.com/vsrp-sandbox-env/web:<tag>`
- Push: GitHub Actions builds and pushes images on app code changes
- Pull: ECS Fargate pulls images from ECR via TGW → hub NAT path

---

## 6. Repository Structure

Single repo with infrastructure and application code separated by directory. CI/CD pipelines are triggered independently based on path filters.

```
vsrp_sandbox_env/
├── environments/dev/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── security_groups.tf
│   ├── alb.tf
│   ├── ecs.tf
│   ├── ecr.tf
│   ├── cloudwatch.tf
│   └── deployments/vsrp_sandbox_dev.tfvars
├── app/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── html/
│       └── index.html
├── .github/workflows/
│   ├── terraform.yml
│   └── app-deploy.yml
└── README.md
```

---

## 7. CI/CD Pipelines

Two independent pipelines in one repo, separated by path-based triggers.

### Infrastructure Pipeline (Terraform Cloud)

- Trigger: changes to `environments/**` merged to main
- GitHub Actions runs `terraform fmt -check` and `terraform validate` as PR quality gate
- TFC picks up changes via VCS-driven runs and executes plan/apply
- TFC manages state; GitHub Actions never runs plan or apply
- Auth: TFC → AWS via OIDC (tfc_aws_dynamic_credentials)

### Application Pipeline (GitHub Actions)

- Trigger: changes to `app/**` merged to main
- Steps: checkout → configure AWS creds (OIDC) → login to ECR → build Docker image → push to ECR → update ECS service
- Auth: GitHub Actions → AWS via OIDC (separate IAM role with ECR + ECS deploy permissions only)
- First deploy: infrastructure must exist before first image push

### IAM Roles

| Pipeline | Auth Method | Permissions |
|-----------------|--------------------------------------|--------------------------------------------------------|
| Terraform Cloud | OIDC (tfc_aws_dynamic_credentials) | Broad infra provisioning (VPC, ALB, ECS, ECR, IAM, CloudWatch) |
| GitHub Actions | OIDC (GitHub → AWS federation) | ECR push, ECS UpdateService, CloudWatch Logs read |

---

## 8. TFC Workspace Configuration

| Setting | Value |
|---------------------|---------------------------------------------------------------|
| Workspace Name | vsrp-sandbox-env-dev |
| Working Directory | environments/dev |
| VCS Trigger Paths | environments/dev/** |
| Tags | vsrp-sandbox-env, dev |
| Env Vars | TF_CLI_ARGS_plan = -var-file=deployments/vsrp_sandbox_dev.tfvars |
| Credentials | tfc_aws_dynamic_credentials (OIDC) |
| VPC/Subnet Data | terraform_remote_state from network-hub workspace |

---

## 9. Observability

### Logging

- CloudWatch Log Group for ECS Fargate container logs
- Retention: 7 days (sandbox)
- Provisioned via Terraform

### Monitoring & Alarms

- ALB target group unhealthy host count alarm
- ECS service running task count alarm (alert if 0)
- All alarms defined in Terraform (cloudwatch.tf)

---

## 10. Tagging Strategy

Default tags applied via the AWS provider block in Terraform:

| Tag Key | Value |
|-------------|------------------------|
| Project | vsrp-sandbox-env |
| Environment | dev |
| Owner | \<team or individual\> |
| ManagedBy | terraform |

---

## 11. Decisions Log

| # | Decision | Choice | Rationale |
|-----|------------------------|-------------------------------|--------------------------------------|
| 1 | Architecture tiers | 2-tier (ALB → Fargate) | No DB needed for static app; add later |
| 2 | ECS services | 1 service (nginx) | Sandbox simplicity |
| 3 | Fargate sizing | 0.25 vCPU / 0.5 GB | Minimum; sufficient for static content |
| 4 | Autoscaling | None (desired_count=1) | Sandbox; no scaling needed |
| 5 | Placeholder app | nginx + health endpoint | Prove design end-to-end |
| 6 | ALB CIDRs | 10.14.0.0/16 (on-prem) + TBD (Client VPN) | Two access paths, separate SG rules |
| 7 | Bastion | No | Access via on-prem and Client VPN |
| 8 | HTTPS | HTTP (80) first | 443 when domain/cert ready |
| 9 | Container registry | Amazon ECR | Native AWS; private network pull |
| 10 | Infra pipeline | Terraform Cloud (VCS-driven) | Already set up with OIDC |
| 11 | App pipeline | GitHub Actions | Build/push images, deploy to ECS |
| 12 | Auth (both pipelines) | OIDC (separate IAM roles) | No static keys; least privilege |
| 13 | Log retention | 7 days | Sandbox; minimal cost |
| 14 | Database | Deferred | Add RDS PostgreSQL when app needs it |

---

## 12. Next Steps

1. Confirm decisions in this document
2. Create GitHub Actions OIDC IAM role for ECR/ECS deploy permissions
3. Implement Terraform code (ALB, ECS, ECR, CloudWatch, security groups)
4. Create TFC workspace with VCS trigger paths scoped to `environments/dev/**`
5. Build placeholder nginx app (Dockerfile, nginx.conf, index.html)
6. Set up GitHub Actions app-deploy workflow (build, push ECR, deploy ECS)
7. Run terraform apply to provision infrastructure
8. Push first container image and verify ECS deployment
9. Test end-to-end: VPN → ALB hostname → nginx page
10. Verify DNS resolution over VPN (troubleshoot if ALB hostname doesn't resolve)