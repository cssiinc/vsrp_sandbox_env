VSRP Sandbox Environment – 3‑Tier AWS App
=========================================

## 1. Purpose

This repository defines a **sandbox AWS environment** used to prototype and validate **VSRP CI/CD pipelines** against a realistic, production‑like **3‑tier web application**.  
All infrastructure will be managed with **Terraform** and deployed via **Terraform Cloud + GitHub Actions**, with AWS as the target platform.

The goals of this sandbox:

- Validate that CI/CD pipelines can safely create, update, and destroy a 3‑tier stack
- Exercise IAM, networking, tagging, and security patterns that will be used in real environments
- Provide an isolated playground to iterate on Terraform modules and workflows

## 2. High‑Level Architecture

At a high level, the app follows a classic **presentation / application / data** pattern inside a single AWS account and VPC:

```text
Internet
   |
   v
Route 53 (optional) + ACM
   |
   v
Application Load Balancer (public subnets)
   |
   v
ECS Fargate Service (app containers in private subnets)
   |
   v
Amazon RDS (PostgreSQL) in isolated data subnets
```

### Environments

For this sandbox, the default assumption is a single **sandbox** environment (e.g., `env = "sandbox"`), with the option to add more later (e.g., `dev`, `staging`, `prod`) using the same patterns.

## 3. Networking & Security

- **VPC**
  - One dedicated VPC for the sandbox environment (no default VPC usage)
  - CIDR sized to allow future expansion (e.g., `/16` or `/20` depending on org standards)

- **Subnets (per AZ)**
  - **Public subnets**:  
    - Contain only the **Application Load Balancer** and **NAT Gateways**
  - **Private app subnets**:  
    - Run the **ECS Fargate tasks** (application containers)
    - Outbound internet via NAT gateways only
  - **Private data subnets**:  
    - Host the **RDS database**
    - No direct internet access

- **Security groups**
  - ALB SG: allows inbound HTTP/HTTPS from the internet, forwards only to app SG
  - App SG: allows inbound from ALB SG on app ports; outbound to DB SG
  - DB SG: allows inbound only from app SG on the DB port (e.g., 5432)
  - No 0.0.0.0/0 ingress to DB or app tiers

- **Observability & logs**
  - VPC Flow Logs enabled to CloudWatch Logs or S3
  - ALB access logs optionally sent to S3
  - ECS task logs to CloudWatch Logs using a consistent log group naming convention

## 4. Tiers & Components

### 4.1 Presentation Tier

- **Route 53** (optional for sandbox) for DNS records (e.g., `sandbox.vsrp.example.com`)
- **ACM** certificates for TLS on the ALB
- **Application Load Balancer**
  - Listeners (HTTP → redirect to HTTPS, HTTPS → target groups)
  - Target groups pointing to ECS service tasks

### 4.2 Application Tier

- **ECS Fargate cluster & service**
  - One or more services running containerized web/API workloads
  - Deployed into private app subnets across at least two AZs
  - IAM task roles with least‑privilege access to any required AWS APIs

- **Container images**
  - Built by CI (GitHub Actions) and pushed to **ECR**
  - Tagged by commit SHA and environment (e.g., `:sandbox-<sha>`)

### 4.3 Data Tier

- **Amazon RDS (PostgreSQL)** in private data subnets
  - Encrypted at rest (KMS)
  - Automated backups, backup window, and maintenance window configured
  - Parameter group for any environment‑specific DB tuning
  - Access restricted via DB security group as described above

## 5. CI/CD & Terraform Workflow (Planned)

- **Source control**
  - This repo (`vsrp_sandbox_env`) contains the **infrastructure code** for the sandbox environment

- **Terraform**
  - Terraform version pinned (>= 1.5) with AWS provider (>= 5.0)
  - State managed via **Terraform Cloud** workspaces
  - Standard patterns:
    - Every variable has `description` and `type`
    - Every output has `description`
    - `for_each` preferred over `count`
    - Common tags applied: `Environment`, `Project`, `ManagedBy = "terraform"`

- **GitHub Actions**
  - On PR: run `terraform fmt`, `terraform validate`, and `terraform plan` via Terraform Cloud
  - On merge to main: run `terraform apply` via Terraform Cloud
  - Authentication to AWS via **OIDC** (no long‑lived access keys)

- **Sandbox safety**
  - Resources scoped to the sandbox account and VPC
  - Clear tagging and naming conventions to distinguish sandbox from other environments
  - Ability to destroy and recreate the entire stack from Terraform when needed

## 6. Next Steps

1. Define the Terraform project layout in this repo (root modules, environment modules, shared modules if needed).  
2. Implement the VPC, subnets, and security groups.  
3. Add ALB + ECS Fargate service and connect to a sample container image.  
4. Add RDS PostgreSQL and wire in connectivity from the app tier.  
5. Wire up GitHub Actions + Terraform Cloud to manage plans and applies for this sandbox.

