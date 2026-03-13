TESTsafsfddsaf

# vsrp-sandbox-env: 3-Tier Application on AWS

A **3-tier web application** deployed on AWS using ECS Fargate, RDS PostgreSQL, and an internal Application Load Balancer. Designed for learning and as a reference implementation for containerized, private-only deployments.

**Region:** us-east-1 | **VPC:** vsrp-sandbox-dev | **Access:** Internal only (VPN/TGW required)

---

:
## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [AWS Services Deep Dive](#2-aws-services-deep-dive)
3. [Request Flow: End-to-End](#3-request-flow-end-to-end)
4. [Application Components](#4-application-components)
5. [Infrastructure (Terraform)](#5-infrastructure-terraform)
6. [CI/CD Pipelines](#6-cicd-pipelines)
7. [Database & Secrets](#7-database--secrets)
8. [Networking & Access](#8-networking--access)
9. [Repository Structure](#9-repository-structure)
10. [Operations & Troubleshooting](#10-operations--troubleshooting)

---

## 1. Architecture Overview

### The 3 Tiers

| Tier | AWS Service | Components | Purpose |
|------|-------------|------------|---------|
| **Presentation** | ALB + ECS Fargate | nginx + React SPA | Serves the UI; ALB routes requests |
| **Application** | ECS Fargate | Node.js (Express) | Proxies public APIs; logs events to DB |
| **Data** | RDS | PostgreSQL 15 | Stores application events (append-only) |

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Client (On-prem 10.14.0.0/16 or Client VPN)                                    │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │ HTTP :80
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  TIER 1: Web (Presentation)                                                       │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  Application Load Balancer (Internal)                                      │  │
│  │  • Path-based routing: /api/* → backend  |  /* → frontend                  │  │
│  │  • Health checks: /health (frontend), /api/health (backend)                │  │
│  │  • Access logs → S3 (encrypted, 90-day retention)                         │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           │                                           │
           ▼                                           ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│  ECS Service: frontend       │     │  ECS Service: backend          │
│  • nginx + React SPA         │     │  • Node.js + Express          │
│  • Port 80                   │     │  • Port 3000                  │
│  • Fargate 0.25 vCPU / 512MB │     │  • Fargate 0.25 vCPU / 512MB  │
│  • Image: vsrp-sandbox-env/   │     │  • Init: run-migration.js     │
│    frontend                  │     │  • Image: vsrp-sandbox-env/   │
└──────────────────────────────┘     │    backend                    │
                                     └──────────────┬───────────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              │                     │                     │
                              ▼                     ▼                     ▼
                     ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
                     │  RDS         │      │  Secrets      │      │  Public APIs │
                     │  PostgreSQL  │      │  Manager      │      │  (Dog CEO,   │
                     │  db.t4g.micro│      │  (DB creds)   │      │   Open-Meteo) │
                     └──────────────┘      └──────────────┘      └──────────────┘
```

### Key Design Decisions

- **Private only:** No public subnets; all access via VPN or Transit Gateway.
- **Path-based routing:** Single ALB; `/api/*` → backend, everything else → frontend. No CORS; same-origin.
- **Containerized:** Two ECS services, two ECR repos; independent builds and deploys.
- **Secrets at runtime:** DB credentials stored in Secrets Manager; backend fetches via AWS SDK at startup.
- **Schema via init container:** Migration runs before main backend container; no Terraform postgres provider.

---

## 2. AWS Services Deep Dive

### For Junior Engineers: What Each Service Does

| AWS Service | What It Does | Why We Use It |
|-------------|--------------|---------------|
| **VPC** | Virtual Private Cloud — your isolated network in AWS. | All resources run inside a VPC; no default VPC usage. |
| **Subnets** | Segments of the VPC (e.g., app vs data). | App subnets host ALB + ECS; data subnets host RDS. Separates tiers. |
| **Security Groups** | Stateful firewalls at instance level. | Control which traffic can reach ALB, ECS, RDS. |
| **Application Load Balancer (ALB)** | Distributes HTTP traffic to targets based on rules. | Path-based routing; health checks; single entry point. |
| **ECS (Elastic Container Service)** | Runs Docker containers without managing servers. | Fargate = serverless containers; no EC2 to patch. |
| **Fargate** | Serverless compute for ECS. | Pay per task; no capacity planning. |
| **ECR** | Amazon Elastic Container Registry — stores Docker images. | Private registry; ECS pulls images from here. |
| **RDS** | Managed relational database. | PostgreSQL; automated backups, patching. |
| **Secrets Manager** | Secure storage for secrets (passwords, etc.). | DB credentials; rotate without code changes. |
| **CloudWatch Logs** | Centralized log storage. | ECS tasks ship stdout/stderr here via `awslogs` driver. |
| **S3** | Object storage. | ALB access logs; encrypted; lifecycle to expire old logs. |
| **IAM** | Identity and access management. | Roles for ECS tasks (pull images, read secrets); OIDC for GitHub. |

### Security Group Flow

```
ALB SG:  Inbound 80 from 10.14.0.0/16 (on-prem)  →  Outbound to VPC
App SG:  Inbound 80, 3000 from ALB SG            →  Outbound 443 (ECR, APIs, CloudWatch), 5432 (RDS)
Data SG: Inbound 5432 from App SG                →  (none needed for DB)
```

---

## 3. Request Flow: End-to-End

### Example: User Clicks "Fetch" for Dog API

1. **Browser** sends `GET /api/dog` to ALB DNS (same-origin; no CORS).
2. **ALB** matches path `/api/*` → forwards to **backend target group** (port 3000).
3. **Backend ECS task** receives request at Express route `GET /api/dog`.
4. **Backend** proxies to `https://dog.ceo/api/breeds/image/random`.
5. **Backend** logs event to RDS: `INSERT INTO app_events (event_type, details) VALUES ('api_call', '{"endpoint":"/api/dog","status":200}')`.
6. **Backend** returns JSON to ALB → ALB → browser.
7. **Frontend React** renders the dog image.

### Example: Initial Page Load

1. **Browser** sends `GET /` to ALB.
2. **ALB** default rule → forwards to **frontend target group** (port 80).
3. **Frontend ECS task** (nginx) serves `index.html` and static assets.
4. **React** loads; `ApiCard` components call `fetch('/api/dog')` etc. when user clicks.

### Health Check Flow

| Endpoint | Served By | Purpose |
|----------|------------|---------|
| `/health` | nginx (frontend) | ALB target group health check; returns 200 "ok" |
| `/api/health` | Express (backend) | ALB target group health check; returns `{"status":"ok"}` |

**Important:** Health endpoints must NOT call external APIs or DB; they must return quickly so ALB doesn't mark targets unhealthy.

---

## 4. Application Components

### Frontend

| Layer | Technology | File / Config |
|-------|-------------|---------------|
| Build | React 18 + Vite | `app/frontend/package.json`, `vite.config.js` |
| Runtime | nginx (Alpine) | `app/frontend/Dockerfile`, `nginx.conf` |
| SPA entry | `App.jsx`, `ApiCard.jsx` | Fetches `/api/*`; rich displays per API type |

**Dockerfile (multi-stage):**

- Stage 1: Node builds SPA → `dist/`
- Stage 2: nginx serves `dist/` from `/usr/share/nginx/html`

**nginx.conf:** `try_files $uri $uri/ /index.html` for client-side routing; `/health` returns 200.

### Backend

| Layer | Technology | File |
|-------|-------------|------|
| Runtime | Node 20 (Alpine) | `app/backend/Dockerfile` |
| API | Express 4 | `app/backend/index.js` |
| DB access | `pg` + `@aws-sdk/client-secrets-manager` | `app/backend/db.js` |
| Migration | Node script | `app/backend/run-migration.js` |

**API Routes:**

| Route | Upstream | Purpose |
|-------|----------|---------|
| `GET /api/health` | — | Health check (no external deps) |
| `GET /api` | — | List available APIs |
| `GET /api/dog` | dog.ceo | Random dog image |
| `GET /api/bored` | boredapi.com | Random activity |
| `GET /api/joke` | jokeapi.dev | Programming joke |
| `GET /api/chuck` | chucknorris.io | Chuck Norris joke |
| `GET /api/dadjoke` | icanhazdadjoke.com | Dad joke |
| `GET /api/ghibli` | ghibliapi.herokuapp.com | Random Ghibli film |
| `GET /api/weather` | open-meteo.com | Weather (lat/lon query params) |

**DB connection:** Backend receives `DB_SECRET_ARN`, `DB_HOST`, `DB_PORT`, `DB_NAME` as env vars. It fetches username/password from Secrets Manager at startup; connects to RDS with SSL.

### Init Container (Backend)

Before the main backend container starts, an init container runs:

```bash
node run-migration.js
```

This executes `migrations/001_app_events.sql` to create the `app_events` table if it doesn't exist. The main backend starts only after init succeeds (`dependsOn: SUCCESS`).

---

## 5. Infrastructure (Terraform)

### File Layout

```
environments/dev/
├── data.tf      # Discovers VPC, subnets, SGs from AWS (network-hub)
├── variables.tf # project, environment, vpc_name, aws_region
├── alb.tf       # ALB, target groups, S3 for access logs, path-based rules
├── ecs.tf       # ECS cluster, services (frontend, backend), IAM roles
├── rds.tf       # RDS PostgreSQL, DB subnet group
├── outputs.tf   # ECR URLs, ALB DNS, RDS endpoint, secret ARN
└── deployments/
    └── vsrp_sandbox_dev.tfvars.example
```

### Network Discovery (data.tf)

**No hardcoded VPC/subnet IDs.** Terraform discovers resources from AWS:

- **VPC:** `data "aws_vpc" "spoke"` filtered by `tag:Name = "vsrp-sandbox-dev"`
- **Subnets:** All subnets in VPC, filtered by `tag:Type` = `"app"` or `"data"`
- **Security groups:** All SGs in VPC, filtered by `tag:Type` = `"app"` or `"data"`

The **network-hub** (separate Terraform) creates the VPC and tags subnets/SGs. This env layer consumes them dynamically.

### Key Resources

| Resource | Module / Type | Notes |
|----------|---------------|-------|
| ALB | `terraform-aws-modules/alb/aws` ~> 10.0 | Internal; path rules; access logs to S3 |
| ECS Cluster + Services | `terraform-aws-modules/ecs/aws` ~> 7.0 | Fargate; 2 services; `desired_count=0` initially |
| RDS | `terraform-aws-modules/rds/aws` ~> 7.0 | PostgreSQL 15; db.t4g.micro; Secrets Manager for creds |
| ECR | (module or resource) | 2 repos: frontend, backend |
| CloudWatch Log Groups | `aws_cloudwatch_log_group` | frontend, backend, backend-init |

### IAM Roles

| Role | Used By | Permissions |
|------|---------|-------------|
| ECS Task Execution | Both services at task start | ECR pull, Secrets Manager (DB secret), CloudWatch Logs |
| Backend Task Role | Backend container at runtime | Secrets Manager (backend fetches secret in code) |

---

## 6. CI/CD Pipelines

### app-build.yml (CI)

**Trigger:** Push to `main` when `app/**` changes.

**Jobs:**

1. **changes:** Path filter — `app/frontend/**` → build frontend; `app/backend/**` → build backend.
2. **build-frontend** (if frontend changed): Build Docker image → push to ECR with tag `${{ github.sha }}` → wait for ECR scan → fail on CRITICAL, warn on HIGH.
3. **build-backend** (if backend changed): Same for backend.

**Handles:** ECR immutable tags; if image already exists (e.g., concurrent run), skip build. If push fails but image exists, treat as success.

**Auth:** GitHub OIDC → `secrets.AWS_ROLE_ARN`.

### app-release.yml (CD)

**Trigger:** Manual (`workflow_dispatch`) with inputs: `deploy_frontend`, `deploy_backend`.

**Jobs:**

1. **deploy-frontend:** Ensure image `${{ github.sha }}` exists in ECR; if not, build and push. Update ECS task definition with new image tag → `aws ecs update-service` with `desired-count=1`.
2. **deploy-backend:** Same; updates both `backend` and `backend-init` container images.

**Why manual:** Run after TFC applies Terraform; operator chooses when to deploy.

**Required GitHub vars:** `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECS_CLUSTER`.

---

## 7. Database & Secrets

### Schema: app_events

```sql
CREATE TABLE IF NOT EXISTS app_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_type VARCHAR(50),
  user_id    VARCHAR(255),
  details    JSONB
);
```

| event_type | When | details example |
|------------|------|-------------------|
| api_call | Each proxy call | `{"endpoint":"/api/dog","status":200}` |
| (future) login | User login | `{"method":"sso"}` |
| (future) session_start | New session | `{"user_agent":"..."}` |

### Credentials Flow

1. **RDS** creates master user; `manage_master_user_password = true` → AWS stores password in **Secrets Manager**.
2. **Terraform** passes `DB_SECRET_ARN` (and `DB_HOST`, `DB_PORT`, `DB_NAME`) to ECS task definition as environment variables.
3. **Backend** at startup: `GetSecretValue` with `DB_SECRET_ARN` → parse JSON for `username` and `password` → create `pg.Pool`.
4. **Init container** uses same env vars for migration.

**Why not inject secret as env?** ECS can inject Secrets Manager values into env at task start, but this setup fetches in code so the pattern is explicit and portable.

---

## 8. Networking & Access

### Access Paths

| Source | CIDR | How | Destination |
|--------|------|-----|-------------|
| On-prem | 10.14.0.0/16 | VPN → TGW → spoke VPC | ALB :80 |
| Client VPN | (TBD) | AWS Client VPN → TGW → spoke VPC | ALB :80 |

### Outbound

- **Frontend:** ECR (pull), CloudWatch Logs.
- **Backend:** ECR, CloudWatch, public APIs (HTTPS), RDS (5432). Outbound to internet via TGW → hub NAT.

### ALB DNS

- Internal ALB has a DNS name like `vsrp-sandbox-env-dev-xxxxxxxxx.us-east-1.elb.amazonaws.com`.
- Resolvable only from within the VPC (or VPN-configured DNS).
- Output: `alb_dns_name` from Terraform.

---

## 9. Repository Structure

```
vsrp_sandbox_env/
├── README.md
├── app/
│   ├── frontend/
│   │   ├── Dockerfile          # Multi-stage: build SPA → nginx serve
│   │   ├── nginx.conf           # SPA + /health
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.jsx
│   │       ├── App.jsx
│   │       ├── ApiCard.jsx
│   │       └── index.css
│   └── backend/
│       ├── Dockerfile
│       ├── package.json
│       ├── index.js             # Express routes
│       ├── db.js                # RDS + Secrets Manager
│       ├── run-migration.js     # Init container entrypoint
│       └── migrations/
│           └── 001_app_events.sql
├── environments/dev/
│   ├── data.tf
│   ├── variables.tf
│   ├── alb.tf
│   ├── ecs.tf
│   ├── rds.tf
│   ├── outputs.tf
│   └── deployments/
│       └── vsrp_sandbox_dev.tfvars.example
└── .github/workflows/
    ├── app-build.yml            # Build + push on app/** changes
    └── app-release.yml         # Manual deploy (workflow_dispatch)
```

---

## 10. Operations & Troubleshooting

### How to Deploy

1. **Infrastructure:** Terraform Cloud runs on changes to `environments/dev/**`. Ensure TFC has applied.
2. **Application:** In GitHub Actions, run **App Release** workflow. Select frontend/backend; it uses the commit SHA of the current branch/HEAD.
3. **First deploy:** ECS services start with `desired_count=0`. App Release sets `desired_count=1` and updates task definition.

### Viewing Logs

- **Frontend:** CloudWatch Logs → log group for frontend (e.g. `/ecs/vsrp-sandbox-env/frontend`).
- **Backend:** Log group for backend; init container has its own log group.
- **ALB:** S3 bucket `vsrp-sandbox-env-dev-alb-logs-<account_id>`; prefix `alb/`.

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| 502 from ALB | Backend unhealthy or not running | Check ECS service desired/running count; CloudWatch logs for backend errors |
| "Token has expired" | AWS SSO session expired | Run `aws sso login --profile <profile>` |
| DB connection refused | RDS not in correct subnet/SG | Verify data SG allows 5432 from app SG; check `DB_HOST`/`DB_PORT` |
| ECR push denied | GitHub OIDC role missing or wrong | Ensure `AWS_ROLE_ARN` secret and trust policy allow `sts:AssumeRoleWithWebIdentity` |
| Frontend blank / 404 | SPA routing; nginx config | Ensure `try_files $uri $uri/ /index.html` in nginx.conf |

### Health Checks

- **Frontend:** `curl http://<alb-dns>/health` → `ok`
- **Backend:** `curl http://<alb-dns>/api/health` → `{"status":"ok","service":"backend"}`

### Cost Estimate (Monthly, us-east-1)

| Service | Config | Est. |
|---------|--------|------|
| ECS Fargate | 2 × 0.25 vCPU, 0.5 GB | ~$7 |
| ALB | 1 ALB, ~1 LCU | ~$24 |
| RDS | db.t4g.micro, 20 GB gp3 | ~$12–14 |
| ECR | 2 repos, ~2 GB | ~$0.20 |
| CloudWatch Logs | 3 groups, 14-day retention | ~$1–2 |
| Secrets Manager | 1 secret | ~$0.40 |
| S3 (ALB logs) | ~1 GB | ~$0.03 |
| **Total** | | **~$45–50** |

---

## Quick Reference

| Item | Value |
|------|-------|
| Cluster | `vsrp-sandbox-env-dev` |
| ECS Services | `frontend`, `backend` |
| ECR Repos | `vsrp-sandbox-env/frontend`, `vsrp-sandbox-env/backend` |
| RDS Identifier | `vsrp-sandbox-env-dev` |
| Database | `vsrp_sandbox` |
| Backend Port | 3000 |
| Frontend Port | 80 |
