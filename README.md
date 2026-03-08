# vsrp-sandbox-env: 3-Tier Private Containerized App

**Status:** Draft
**VPC:** vsrp-sandbox-dev (10.3.0.0/24)
**Subnets:** /27 per subnet (27 usable IPs each)
**Repo:** `02_gh/vsrp_sandbox_env`
**Region:** us-east-1 (us-east-1a, us-east-1b)

---

## 1. Design Goals

- **Private only** — No public subnets; access via AWS VPN through TGW or SSM bastion
- **Containerized** — ECS Fargate (no EC2 node management)
- **3-tier architecture** — Web (ALB) → App (Fargate) → Data (RDS PostgreSQL)
- **Cost-conscious** — No NAT in spoke (hub provides); minimal Fargate sizing for sandbox
- **Learning-focused** — End-to-end exposure to ECS, ECR, CI/CD, Terraform, APIs, and database flow

---

## 2. Architecture

The architecture is a 3-tier design: an internal ALB fronting two ECS Fargate services (frontend and backend), with RDS PostgreSQL for event storage. The ALB uses path-based routing: `/api/*` goes to the backend (Node); everything else goes to the frontend (nginx + SPA). The backend proxies public APIs and writes events (logins, sessions, API calls) to RDS. All traffic is private; outbound to public APIs traverses TGW → hub NAT.

```
[ On-prem 10.14.0.0/16 ] --VPN/TGW--> [ Spoke VPC 10.3.0.0/24 ]
                                              |
                                              v
                                  [ Internal ALB ] :80
                                    /api/*  |    /*
                                              v
                     +--------------------+--------+
                     v                                v
            [ ECS: Frontend ]              [ ECS: Backend ] --outbound--> [ Public APIs ]
            nginx + SPA :80                       Node :3000
                                                          |
                                                          v
                                                  [ RDS PostgreSQL ]
```

### Containers and Images

**2 images, 2 containers.** Separate ECR repos and ECS services for isolation and independent updates.

| Container | Image | Contents | Port |
|-----------|-------|----------|------|
| **Frontend** | vsrp-sandbox-env/frontend | nginx + built SPA | 80 |
| **Backend** | vsrp-sandbox-env/backend | Node.js (Express) | 3000 |

### Web Tier (ALB)

- Scheme: internal (no public-facing endpoint)
- Subnets: app us-east-1a, app us-east-1b
- Listener: HTTP port 80 (HTTPS/443 optional later when domain and ACM cert are ready)
- **Path-based routing:** `/api/*` → backend target group (port 3000); default `/*` → frontend target group (port 80)
- SPA calls `fetch('/api/...')` → browser sends to ALB → ALB routes to backend; same-origin, no CORS
- **Health checks (target groups):** Frontend TG → path `/health`, port 80. Backend TG → path `/api/health`, port 3000. Both: 200 OK within timeout.
- DNS: default ALB hostname (*.elb.amazonaws.com); custom Route 53 record added later if needed

### App Tier (ECS Fargate)

- Cluster: vsrp-sandbox-env
- **2 ECS services:** frontend (nginx + SPA) and backend (Node)
- Task sizing: Frontend 0.25 vCPU / 0.5 GB; Backend 0.25–0.5 vCPU / 0.5–1 GB (Node + DB)
- Desired count: 0 initially (Terraform); first app-deploy sets each to 1 — custom images from day 1
- Subnets: app us-east-1a, app us-east-1b (both services)
- Images: 2 images in ECR (frontend, backend); built and pushed by GitHub Actions
- Outbound: Frontend → ECR, CloudWatch; Backend → ECR, CloudWatch, public APIs, RDS (5432)

### Data Tier (RDS PostgreSQL)

- Engine: PostgreSQL 15
- Instance: db.t4g.micro
- Deployment: single-AZ (sandbox)
- Storage: 20 GB gp3, encrypted
- Subnets: data us-east-1a, us-east-1b (from network-hub)
- Purpose: minimal event storage — logins, sessions, API calls — to understand 3-tier flow
- Schema: single `app_events` table (append-only)
- **Credentials:** AWS Secrets Manager. Terraform creates the secret; RDS stores it. ECS task definition injects secret ARN into backend container as env var (e.g. `DB_SECRET_ARN`). Backend fetches secret at startup via AWS SDK.

---

## 3. Security Groups

**Reuse existing security groups from network-hub.** App tier (frontend + backend) uses `app_security_group_id`; data tier uses `data_security_group_id`. We create only `alb-sg` in this Terraform (the ALB is our resource; network-hub typically does not provide it).

| SG | Source | Inbound | Outbound |
|----|--------|---------|----------|
| **alb-sg** | Created here | 80 from 10.14.0.0/16 (on-prem), 80 from TBD (Client VPN) | — |
| **app-sg** | network-hub output | 80, 3000 from alb-sg | 443 (ECR, CloudWatch, public APIs); 5432 to data-sg |
| **data-sg** | network-hub output | 5432 from app-sg | — |

> **Why both 80 and 3000 on app-sg?** Frontend listens on 80, backend on 3000. ALB targets different ports per target group; both ECS tasks use app-sg, so we allow both.
>
> **Terraform:** Use `data "aws_security_group"` or pass `app_security_group_id` and `data_security_group_id` as variables from network-hub remote state. Add rule to app-sg: inbound 80 and 3000 from alb-sg (if network-hub did not already allow this). Ensure data-sg allows 5432 from app-sg.
>
> **Note:** Replace TBD with the AWS Client VPN endpoint CIDR once confirmed.

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

## 4a. Terraform Variables (Required)

Variables can be supplied via `-var-file=deployments/vsrp_sandbox_dev.tfvars`, TFC workspace variables, or environment variables. Prefer remote state from network-hub for VPC/subnet/SG IDs when possible.

| Variable | Type | Required | Description |
|----------|------|---------|-------------|
| `vpc_id` | string | Yes | VPC ID (e.g. from network-hub remote state: `vpc_id`) |
| `app_subnet_ids` | list(string) | Yes | App subnets for ALB and ECS (e.g. `["subnet-xxx","subnet-yyy"]`) |
| `data_subnet_ids` | list(string) | Yes | Data subnets for RDS |
| `app_security_group_id` | string | Yes | Existing app tier SG (frontend + backend) |
| `data_security_group_id` | string | Yes | Existing data tier SG (RDS) |
| `aws_region` | string | No | AWS region; default `us-east-1` |
| `environment` | string | No | Environment name; default `dev` |
| `project` | string | No | Project name; default `vsrp-sandbox-env` |
| `db_name` | string | No | RDS database name; default `vsrp_sandbox` |
| `db_allocated_storage` | number | No | RDS storage GB; default `20` |
| `alb_allowed_cidrs` | list(string) | No | CIDRs allowed to ALB; default `["10.14.0.0/16"]` |

**Example tfvars:**

```hcl
vpc_id                    = "vpc-00b892d2d76661b6e"
app_subnet_ids            = ["subnet-0b096f43b72141823", "subnet-0dac2d24c3e7446d8"]
data_subnet_ids           = ["subnet-0616a22d68353b4b8", "subnet-03a5cddebbc3b02c1"]
app_security_group_id     = "sg-0422971a38775f38d"
data_security_group_id   = "sg-012b1039012d879d7"
aws_region                = "us-east-1"
environment               = "dev"
```

**Using remote state:** If network-hub Terraform outputs these values, use `terraform_remote_state` data source and pass outputs into locals/variables instead of hardcoding in tfvars.

---

## 5. Container Registry (ECR)

- Terraform creates 2 ECR repositories: vsrp-sandbox-env/frontend, vsrp-sandbox-env/backend
- Lifecycle policy: retain last 10 images per repo, expire untagged after 7 days
- Image URI format: `<account_id>.dkr.ecr.us-east-1.amazonaws.com/vsrp-sandbox-env/{frontend|backend}:<tag>`
- Push: GitHub Actions (frontend-deploy, backend-deploy) build and push on path-specific changes
- Pull: ECS Fargate pulls images from ECR via TGW → hub NAT path

---

## 5a. Application: Frontend + Backend

### Frontend Container (nginx + SPA)

| Component | Technology | Role |
|-----------|------------|------|
| SPA | **React (Vite)** recommended | Static assets built at image build time |
| nginx | nginx | Serves SPA only; no proxy — ALB routes `/api/*` to backend |

**Framework recommendation:** **React with Vite** — fast build, minimal setup, easy to extend. Use **Angular** if you prefer more structure or need alignment with tsap/atsap.

**Build:** Multi-stage Dockerfile — Node build stage → nginx serve stage. No Node at runtime.

**nginx config:** Serve SPA from build output; `try_files $uri $uri/ /index.html` for client-side routing.

**Health check:** Expose `/health` that returns 200. Keeps ALB health checks simple and avoids serving the full SPA for every probe.

### Backend Container (Node)

| Component | Technology | Role |
|-----------|------------|------|
| API backend | Node.js (Express) | Proxies public APIs, writes events to RDS |

**Build:** Single-stage Dockerfile — Node image with server code.

**Routing:** ALB forwards the full path (e.g. `/api/dog`) to this container. **Recommended:** Define Express routes under `/api` so the path matches exactly — e.g. `app.get('/api/dog', ...)`, `app.get('/api/health', ...)`. No path stripping; keeps routing clear.

**Health check:** `GET /api/health` must return 200 quickly, without calling external APIs or the database. Used by ALB target group; prevents cascading failures if external APIs are slow.

### Public API Proxy (Backend)

- SPA calls `fetch('/api/dog')` → browser sends to ALB → ALB routes to backend container.
- Backend proxies to public APIs (e.g. [public-apis/public-apis](https://github.com/public-apis/public-apis)) — Dog CEO, Bored API, Open-Meteo, etc.
- Outbound from backend via TGW → hub NAT.
- Each proxy call is logged to RDS `app_events`.

### Schema Bootstrap: app_events Table

**Recommended: Init container in the backend ECS task.** An init container runs a migration script before the main Node container starts. The migration SQL lives in the app repo (e.g. `app/backend/migrations/001_app_events.sql`), so schema changes stay with the application. No extra Terraform providers or manual steps.

| Approach | Pros | Cons |
|----------|------|------|
| **Init container** ✓ | Schema with app; runs on every deploy; no extra providers | Slightly more complex task definition |
| Terraform postgresql provider | Schema as infra | Extra provider; credentials in Terraform |
| Manual SQL | Simple | Not repeatable; easy to forget |

**Implementation:** Add an `init` container to the backend task definition that runs `psql` or a small Node script to execute the migration, then exits. The main container starts only after init succeeds.

### Database: Event Storage

Single table, append-only; minimal schema for learning 3-tier flow:

```sql
CREATE TABLE IF NOT EXISTS app_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_type VARCHAR(50),   -- 'login', 'session_start', 'api_call'
  user_id    VARCHAR(255),
  details    JSONB
);
```

| event_type | When | Example details |
|------------|------|-----------------|
| login | User login or session start | `{"method": "sso"}` |
| session_start | New browser session | `{"user_agent": "..."}` |
| api_call | Each proxy call to public API | `{"endpoint": "...", "status": 200}` |

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
│   ├── alb.tf           # ALB + access logs S3 bucket
│   ├── ecs.tf
│   ├── ecr.tf
│   ├── rds.tf
│   ├── cloudwatch.tf    # Log groups, alarms
│   └── deployments/vsrp_sandbox_dev.tfvars
├── app/
│   ├── frontend/
│   │   ├── Dockerfile       # multi-stage: SPA build → nginx serve
│   │   ├── nginx.conf       # SPA only; try_files; /health
│   │   ├── package.json
│   │   ├── vite.config.ts   # React (Vite)
│   │   └── src/             # SPA source
│   └── backend/
│       ├── Dockerfile
│       ├── package.json
│       ├── index.js         # Express: /api/* routes, /api/health
│       ├── db.js            # RDS + Secrets Manager
│       └── migrations/
│           └── 001_app_events.sql
├── .github/workflows/
│   ├── terraform.yml
│   ├── frontend-deploy.yml
│   └── backend-deploy.yml
└── README.md
```

---

## 6a. Technology Stack: Terraform + Coding Languages

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Infrastructure** | Terraform (HCL) | ECR, ALB, ECS, RDS, security groups, CloudWatch, IAM |
| **API backend** | Node.js / TypeScript (Express) | Proxy public APIs, write events to RDS |
| **Frontend** | React (Vite, TypeScript/JavaScript) | SPA, calls /api/* |
| **Web server** | nginx | Serve SPA only (ALB routes /api/* to backend) |
| **Database** | PostgreSQL (RDS) | Event storage via SQL |
| **CI/CD** | GitHub Actions (YAML) | Build, push, deploy |

All infrastructure is Terraform-managed. All application logic is Node + React. No proprietary or vendor-specific languages.

---

## 7. CI/CD Pipelines

Two independent pipelines in one repo, separated by path-based triggers.

### Infrastructure Pipeline (Terraform Cloud)

- Trigger: changes to `environments/**` merged to main
- GitHub Actions runs `terraform fmt -check` and `terraform validate` as PR quality gate
- TFC picks up changes via VCS-driven runs and executes plan/apply
- TFC manages state; GitHub Actions never runs plan or apply
- Auth: TFC → AWS via OIDC (tfc_aws_dynamic_credentials)

### Application Pipelines (GitHub Actions)

Two workflows for independent deploys:

| Workflow | Trigger | Actions |
|----------|---------|---------|
| frontend-deploy.yml | changes to `app/frontend/**` | Build frontend image → push to ECR → update frontend ECS service |
| backend-deploy.yml | changes to `app/backend/**` | Build backend image → push to ECR → update backend ECS service |

- Steps (each): checkout → configure AWS creds (OIDC) → login to ECR → build Docker image → push to ECR → update respective ECS service (desired_count=1, force new deployment)
- Auth: GitHub Actions → AWS via OIDC (separate IAM role with ECR + ECS deploy permissions only)
- First deploy: Terraform provisions infra with both ECS services desired_count=0. First frontend-deploy and backend-deploy push custom images and set desired_count=1 — both needed for end-to-end

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
| Env Vars | TF_CLI_ARGS_plan, TF_CLI_ARGS_apply = -var-file=deployments/vsrp_sandbox_dev.tfvars |
| Credentials | tfc_aws_dynamic_credentials (OIDC) |
| VPC/Subnet Data | terraform_remote_state from network-hub workspace |

---

## 9. Observability

### Logging (Comprehensive — implement in Terraform)

**CloudWatch Log Groups (one per service):**

| Log Group | Source | Retention | Purpose |
|-----------|--------|-----------|---------|
| `/ecs/vsrp-sandbox-env/frontend` | Frontend container (nginx) | 14 days | Request logs, nginx access/error |
| `/ecs/vsrp-sandbox-env/backend` | Backend container (Node) | 14 days | API logs, errors, stdout/stderr |
| `/ecs/vsrp-sandbox-env/backend-init` | Backend init container | 7 days | Migration output, connection errors |

**ECS Task Configuration:**
- Use `awslogs` log driver for all containers
- Set `awslogs-group`, `awslogs-region`, `awslogs-stream-prefix`
- Application logs to stdout/stderr → auto-captured by awslogs

**ALB Access Logs:**
- Enable access logging to S3
- Terraform creates S3 bucket (or use existing) with lifecycle/encryption
- Logs: client IP, target, path, status, latency — useful for debugging and audit

**Application Logging Best Practices (in code):**
- Backend: Log each `/api/*` request (method, path, status, latency) to stdout
- Backend: Log RDS connection success/failure at startup
- Frontend: nginx access_log and error_log → stdout (default) — captured by awslogs
- Use structured JSON logs for backend (e.g. `{ "level":"info", "msg":"...", "path":"/api/dog" }`)

**Optional (if budget allows):**
- RDS Enhanced Monitoring to CloudWatch — DB metrics (CPU, connections)
- VPC Flow Logs — from network-hub if not already enabled

### Monitoring & Alarms

- ALB target group unhealthy host count alarm
- ECS service running task count alarms (alert if 0 for either frontend or backend)
- RDS CPU utilization alarm (optional, e.g. > 80%)
- All alarms defined in Terraform (cloudwatch.tf)

---

## 9a. Cost Estimate (Monthly, us-east-1)

| Service | Config | Est. Monthly Cost |
|---------|--------|--------------------|
| **ECS Fargate** | Frontend: 0.25 vCPU, 0.5 GB; Backend: 0.25 vCPU, 0.5 GB (ARM) | ~\$7 (2 × ~\$3.50) |
| **ALB** | 1 ALB, ~1 LCU avg | ~\$24 |
| **RDS PostgreSQL** | db.t4g.micro, single-AZ, 20 GB gp3 | ~\$12–14 |
| **ECR** | 2 repos, ~2 GB storage (10 images × ~200 MB) | ~\$0.20 |
| **CloudWatch Logs** | 3 log groups, 14-day retention, ~1–2 GB ingest | ~\$1–2 |
| **Secrets Manager** | 1 secret | ~\$0.40 |
| **S3 (ALB logs)** | ALB access logs, ~1 GB | ~\$0.03 |
| **NAT Gateway** | Hub provides; \$0 in this account | \$0 |
| **Data transfer** | Minimal (private only) | ~\$0–1 |
| **Total** | | **~\$45–50/month** |

**Assumptions:** Linux ARM where available (Fargate); 730 hours/month; low sandbox traffic. Prices as of 2024–2025; verify at [AWS Pricing Calculator](https://calculator.aws/).

**Cost levers:**
- Fargate Spot (if tolerant): up to 70% savings on compute
- RDS Reserved Instance (1 yr): ~\$8–9/month vs ~\$12
- Reduce log retention to 7 days: slightly lower CloudWatch cost
- Budget target \$300–350: this stack is well under; leaves room for experimentation

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
| 1 | Architecture tiers | 3-tier (ALB → Fargate → RDS) | Full stack; event storage for learning |
| 2 | ECS services | 2 services (frontend, backend) | Isolation; independent updates |
| 3 | Containers/images | 2 images, 2 containers | Frontend: nginx+SPA; Backend: Node |
| 4 | Fargate sizing | 0.25–0.5 vCPU / 0.5–1 GB | Node + DB; adjust if needed |
| 5 | Autoscaling | None (desired_count=1 after first app-deploy) | Sandbox; no scaling needed |
| 6 | Frontend framework | React (Vite) | Fast build, minimal setup; Angular if tsap alignment needed |
| 7 | API backend | Node.js (Express) | Proxy public APIs, write events to RDS |
| 8 | Public APIs | Dog CEO, Bored API, Open-Meteo, etc. | Learning; outbound via hub NAT |
| 9 | Database | RDS PostgreSQL 15 | Single app_events table; minimal schema |
| 10 | ALB CIDRs | 10.14.0.0/16 (on-prem) + TBD (Client VPN) | Two access paths |
| 11 | Bastion | No | Access via on-prem and Client VPN |
| 12 | HTTPS | HTTP (80) first | 443 when domain/cert ready |
| 13 | Container registry | Amazon ECR | Native AWS; private network pull |
| 14 | Infra pipeline | Terraform Cloud (VCS-driven) | Already set up with OIDC |
| 15 | App pipelines | GitHub Actions | frontend-deploy, backend-deploy — path-specific build, push, deploy |
| 16 | Auth (both pipelines) | OIDC (separate IAM roles) | No static keys; least privilege |
| 17 | Log retention | 14 days (app), 7 days (init) | Balance visibility vs cost |
| 18 | Bootstrap image | Custom images from day 1 | desired_count=0 in Terraform; first frontend-deploy and backend-deploy set desired_count=1 |
| 19 | Security groups | Reuse app-sg, data-sg from network-hub | Minimize new infra; create alb-sg only |
| 20 | Schema bootstrap | Init container in backend task | Schema with app; no extra Terraform provider |
| 21 | DB credentials | Secrets Manager | ECS injects ARN; backend fetches at startup |
| 22 | Health checks | Frontend /health, Backend /api/health | Explicit probes; no external deps in /api/health |
| 23 | Logging | 3 log groups, ALB access logs to S3, 14-day retention | Comprehensive visibility; implement in Terraform |
| 24 | Cost target | ~\$45–50/month (sandbox) | Fargate, ALB, RDS, ECR, CloudWatch, Secrets Manager |

---

## 12. Initial Deployment Flow

Custom image approach — no public/placeholder images. Terraform provisions infrastructure; first frontend-deploy and backend-deploy bootstrap the running services.

```
Step 1: terraform apply (TFC)
        └── Creates: 2 ECR repos, alb-sg, ALB (access logs to S3), ECS cluster, RDS, Secrets Manager, CloudWatch (3 log groups, alarms)
        └── 2 ECS services with desired_count=0
        └── Uses app_sg, data_sg from network-hub (add rules if needed)

Step 2: First app deploys (GitHub Actions)
        └── frontend-deploy: build frontend image → push ECR → update frontend ECS service (desired_count=1)
        └── backend-deploy: build backend image → push ECR → update backend ECS service (desired_count=1)
        └── Both needed for end-to-end; can run in parallel or sequence

Step 3: Verify
        └── VPN → ALB hostname → SPA (frontend)
        └── SPA calls /api/* → ALB routes to backend → Node proxies public API → returns data
        └── Backend inserts api_call events into RDS
```

**Order:** Infrastructure first (RDS, Secrets Manager, ECS with desired_count=0), then app deploys. Backend init container creates `app_events` on first run. Secrets Manager holds DB credentials; ECS injects secret ARN; backend fetches at startup.

---

## 13. Next Steps

1. Confirm decisions in this document
2. Create GitHub Actions OIDC IAM role for ECR/ECS deploy permissions
3. Implement Terraform: 2 ECR repos, alb-sg, ALB (path-based routing, access logs to S3), 2 ECS services, RDS, Secrets Manager, CloudWatch (3 log groups, alarms). Use `app_security_group_id` and `data_security_group_id` from network-hub.
4. Create TFC workspace with VCS trigger paths scoped to `environments/dev/**`
5. Build frontend: React (Vite) + nginx + `/health` in `app/frontend/`
6. Build backend: Node API with `/api/*` routes, `/api/health`, init container for schema, Secrets Manager integration in `app/backend/`
7. Set up GitHub Actions frontend-deploy and backend-deploy workflows
8. Run terraform apply to provision infrastructure
9. Merge app changes to trigger first frontend-deploy and backend-deploy
10. Test end-to-end: VPN → ALB → SPA → /api/* → public API + RDS event logging