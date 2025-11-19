# Deployment Scripts

Collection of scripts for deploying and managing Pardon Simulator on AWS.

---

## 📁 Scripts Overview

### ECS Fargate (Recommended)

| Script | Purpose | Usage |
|--------|---------|-------|
| `build-and-push.sh` | Build & push Docker images to ECR | `./scripts/build-and-push.sh` |
| `deploy-ecs.sh` | Deploy to ECS Fargate | `./scripts/deploy-ecs.sh` |

### Elastic Beanstalk

| Script | Purpose | Usage |
|--------|---------|-------|
| `eb-init.sh` | Initialize EB application | `./scripts/eb-init.sh` |
| `eb-create.sh` | Create EB environment | `./scripts/eb-create.sh` |
| `eb-deploy.sh` | Deploy to EB | `./scripts/eb-deploy.sh` |
| `deploy-production.sh` | Deploy to EB production | `./scripts/deploy-production.sh` |
| `eb-update-config.sh` | Update agent config | `./scripts/eb-update-config.sh cz operational-private.txt` |
| `eb-scale.sh` | Scale instances | `./scripts/eb-scale.sh 2` |

### Config Management

| Script | Purpose | Usage |
|--------|---------|-------|
| `upload-configs.sh` | Upload all configs to S3 (with versioning) | `./scripts/upload-configs.sh` |
| `update-single-config.sh` | Update single config | `./scripts/update-single-config.sh cz operational-private.txt` |
| `backup-configs.sh` | Create local snapshot (no S3) | `./scripts/backup-configs.sh` |
| `restore-configs.sh` | Restore from local snapshot | `./scripts/restore-configs.sh 2024-11-19_14-30-00` |
| `list-config-versions.sh` | List all snapshots (local & S3) | `./scripts/list-config-versions.sh` |

### EC2 (Legacy - Still Supported)

| Script | Purpose | Usage |
|--------|---------|-------|
| `setup-ec2.sh` | Setup EC2 instance | Run on EC2: `bash setup-ec2.sh` |
| `deploy-to-aws.sh` | Deploy to EC2 | `EC2_HOST=1.2.3.4 ./scripts/deploy-to-aws.sh` |
| `quick-restart-agent.sh` | Restart agent on EC2 | `./scripts/quick-restart-agent.sh cz` |

---

## 🚀 Quick Reference

### ECS Fargate Workflow (Recommended)

```bash
# First time setup - see docs/ECS_DEPLOYMENT.md for cluster/service creation

# Build and push images
./scripts/build-and-push.sh

# Deploy to ECS
./scripts/deploy-ecs.sh

# Or use GitHub Actions (auto-deploys on push to main)
git push origin main

# Monitor
aws ecs describe-services --cluster pardon-production --services pardon-app
aws logs tail /ecs/pardon-simulator --follow
```

### Elastic Beanstalk Workflow

```bash
# First time setup
./scripts/eb-init.sh
./scripts/eb-create.sh

# Daily deployments
git push  # Auto-deploys via GitHub Actions
# OR manually: ./scripts/eb-deploy.sh

# Update agent prompt
vim agents/cz/operational-private.txt
./scripts/eb-update-config.sh cz operational-private.txt

# Scale
./scripts/eb-scale.sh 2
```

### EC2 Workflow (Legacy)

```bash
# First time
export EC2_HOST=your-ip
./scripts/upload-configs.sh
./scripts/deploy-to-aws.sh

# Updates
./scripts/update-single-config.sh cz operational-private.txt
./scripts/quick-restart-agent.sh cz
```

---

## 🔧 Environment Variables

### For Elastic Beanstalk
```bash
# Optional - uses .elasticbeanstalk/config.yml by default
AWS_REGION=us-east-1
S3_BUCKET_NAME=pardon-simulator-configs
```

### For EC2 (if still using)
```bash
# Required
export EC2_HOST=your-ec2-ip

# Optional
export EC2_USER=ec2-user
export EC2_KEY_PATH=~/.ssh/your-key.pem
export AWS_REGION=us-east-1
export S3_BUCKET_NAME=pardon-simulator-configs
```

---

## 📝 Detailed Script Documentation

### build-and-push.sh

**Purpose:** Build Docker images and push to AWS ECR

**What it does:**
- Builds coral-server image for AMD64 (Fargate compatible)
- Builds pardon-agent image for AMD64 (Fargate compatible)
- Pushes both images to ECR with `:latest` and `:$GIT_SHA` tags
- Logs into ECR automatically

**Usage:**
```bash
./scripts/build-and-push.sh
```

**Prerequisites:**
- Docker running
- AWS CLI configured
- ECR repositories created
- Sufficient disk space for builds

**Takes 5-10 minutes** depending on your machine

---

### deploy-ecs.sh

**Purpose:** Deploy to AWS ECS Fargate

**What it does:**
- Checks for `ecs-task-definition.json`
- Registers new task definition with ECS
- Updates service to use new task definition
- Forces new deployment

**Usage:**
```bash
./scripts/deploy-ecs.sh
```

**Prerequisites:**
- `ecs-task-definition.json` configured (copy from `.example`)
- ECS cluster and service created
- Images pushed to ECR

**Takes 3-5 minutes** for rolling deployment

---

### deploy-production.sh

**Purpose:** Deploy to Elastic Beanstalk production

**What it does:**
- Deploys to EB environment `pardon-production`
- Shows health status after deployment
- Displays production URL

**Usage:**
```bash
./scripts/deploy-production.sh
```

**Takes 3-5 minutes**

---

### eb-init.sh

**Purpose:** Initialize Elastic Beanstalk application

**What it does:**
- Checks if EB CLI is installed
- Initializes EB application
- Creates `.elasticbeanstalk/config.yml`

**Usage:**
```bash
./scripts/eb-init.sh
```

**First time only!**

---

### eb-create.sh

**Purpose:** Create Elastic Beanstalk environment

**What it does:**
- Creates EB environment with t3.medium instance
- Sets up auto-scaling (1-3 instances)
- Configures load balancer
- Deploys initial application
- Sets environment variables from `.env.production`

**Usage:**
```bash
./scripts/eb-create.sh [environment-name]

# Default environment name: pardon-production
# Custom name:
./scripts/eb-create.sh pardon-dev
```

**Takes 10 minutes** - grab a coffee! ☕

---

### eb-deploy.sh

**Purpose:** Deploy code to Elastic Beanstalk

**What it does:**
- Uploads configs to S3
- Deploys application to EB
- Shows deployment status
- Verifies health

**Usage:**
```bash
./scripts/eb-deploy.sh
```

**Or just:**
```bash
eb deploy
```

**Takes 3-5 minutes**

---

### eb-update-config.sh

**Purpose:** Update agent config and restart agent

**What it does:**
- Uploads config file to S3
- SSH to EB instance
- Restarts specific agent container

**Usage:**
```bash
./scripts/eb-update-config.sh <agent-name> <config-file>

# Examples:
./scripts/eb-update-config.sh cz operational-private.txt
./scripts/eb-update-config.sh trump-donald personality-public.txt
```

**Takes 1 minute**

---

### eb-scale.sh

**Purpose:** Scale number of instances

**What it does:**
- Scales EB environment to specified instance count
- Shows current status

**Usage:**
```bash
./scripts/eb-scale.sh <number>

# Examples:
./scripts/eb-scale.sh 1  # Scale to 1 instance
./scripts/eb-scale.sh 2  # Scale to 2 instances
./scripts/eb-scale.sh 3  # Scale to 3 instances
```

**Note:** Auto-scaling is enabled and will override this based on CPU

---

### upload-configs.sh

**Purpose:** Upload all agent configs to S3

**What it does:**
- Creates S3 bucket if needed
- Enables encryption
- Blocks public access
- Uploads all config files

**Usage:**
```bash
./scripts/upload-configs.sh
```

**Works with both EB and EC2 deployments!**

---

### update-single-config.sh

**Purpose:** Update a single config file

**What it does:**
- Uploads one config file to S3
- Shows restart instructions

**Usage:**
```bash
./scripts/update-single-config.sh <agent-name> <file>

# Example:
./scripts/update-single-config.sh cz operational-private.txt
```

**Then restart agent:**
- EB: `./scripts/eb-update-config.sh cz operational-private.txt`
- EC2: `./scripts/quick-restart-agent.sh cz`

---

## 💡 Tips

1. **Use aliases:**
   ```bash
   alias eb-deploy='./scripts/eb-deploy.sh'
   alias eb-logs='eb logs --stream'
   alias eb-health='eb health'
   ```

2. **Check status frequently:**
   ```bash
   eb status  # Environment status
   eb health  # Health dashboard
   ```

3. **Monitor logs during deployment:**
   ```bash
   # In another terminal
   eb logs --stream
   ```

4. **Quick agent restart (EB):**
   ```bash
   eb ssh --command "cd /var/app/current && docker-compose restart agent-cz"
   ```

---

## 🆘 Troubleshooting

**Script not executable:**
```bash
chmod +x scripts/*.sh
```

**AWS CLI not configured:**
```bash
aws configure
```

**EB CLI not found:**
```bash
pip install awsebcli
```

**Permission denied on S3:**
```bash
# Check IAM policy includes S3 access
aws iam get-user-policy --user-name pardon-deploy-user --policy-name PardonDeployPolicy
```

---

## 🗂️ Configuration Versioning & Backup

### Overview

Every time you upload configs to S3, a **complete snapshot** is automatically created both locally and in S3. This allows you to:
- Track configuration history over time
- Quickly restore previous versions
- Compare changes between versions
- Rollback after problematic updates

### Automatic Versioning

When you run `./scripts/upload-configs.sh`, the system automatically:

1. **Creates local backup** in `/backups/YYYY-MM-DD_HH-MM-SS/`
2. **Updates changelog** in `AGENTS_CHANGELOG.md` (for git-based deployment)
3. **Uploads to S3 current/** (active configs used by agents)
4. **Uploads to S3 versions/YYYY-MM-DD_HH-MM-SS/** (snapshot archive)

**Example:**
```bash
./scripts/upload-configs.sh
# Creates:
# - backups/2024-11-19_14-30-00/  (local)
# - Updates AGENTS_CHANGELOG.md    (git-tracked)
# - s3://bucket/current/           (active)
# - s3://bucket/versions/2024-11-19_14-30-00/  (snapshot)
```

**Deployment Integration:**
The `AGENTS_CHANGELOG.md` file is tracked in git and automatically updated on each upload. This allows CI/CD to detect config changes and trigger production deployments:

```bash
# After upload-configs.sh completes:
git add AGENTS_CHANGELOG.md
git commit -m "Update agent configs 2024-11-19_14-30-00"
git push origin main  # Triggers GitHub Actions deployment
```

### Backup Structure

Each snapshot contains a complete copy of all configuration files:

```
backups/2024-11-19_14-30-00/
├── agents/
│   ├── cz/
│   │   ├── personality-public.txt
│   │   ├── operational-private.txt
│   │   ├── scoring-config.txt
│   │   └── tool-descriptions.txt
│   ├── sbf/
│   └── ... (all 7 agents)
├── shared/
│   ├── operational-template.txt
│   ├── personality-template.txt
│   ├── scoring-mandate.txt
│   └── agent-comms-note.txt
├── premium_services.json
└── agents-session-configuration.json
```

### Common Tasks

#### List All Available Versions

```bash
./scripts/list-config-versions.sh
```

**Output:**
```
📁 Local Snapshots:
  📦 2024-11-19_14-30-00
     Date: 2024-11-19 at 14:30:00
     Size: 256K (34 files)

☁️ S3 Snapshots:
  ☁️ 2024-11-19_16-45-00
     Date: 2024-11-19 at 16:45:00
     Location: s3://pardon-simulator-configs/versions/2024-11-19_16-45-00/
```

#### Create Manual Backup (Without S3 Upload)

```bash
./scripts/backup-configs.sh
```

Use this when:
- You want to save current state before making risky changes
- You're testing locally and don't want to upload yet
- You want an extra safety net

#### Restore From Local Snapshot

```bash
# List available snapshots
./scripts/list-config-versions.sh

# Restore specific version
./scripts/restore-configs.sh 2024-11-19_14-30-00

# You'll be prompted to confirm before overwriting current files
```

#### Restore From S3 Snapshot

```bash
# Restore entire snapshot from S3
aws s3 sync s3://pardon-simulator-configs/versions/2024-11-19_14-30-00/ . \
  --region us-east-1 \
  --exclude ".git/*"

# Then upload to make it current
./scripts/upload-configs.sh
```

#### Compare Two Versions

```bash
# Compare two local snapshots
diff -r backups/2024-11-19_14-30-00/ backups/2024-11-19_16-45-00/

# Compare specific file across versions
diff backups/2024-11-19_14-30-00/agents/cz/operational-private.txt \
     backups/2024-11-19_16-45-00/agents/cz/operational-private.txt
```

### Rollback Procedure

If you need to rollback after a bad config update:

**Option 1: Quick Local Rollback**
```bash
# 1. Find the last good version
./scripts/list-config-versions.sh

# 2. Restore it
./scripts/restore-configs.sh 2024-11-19_14-30-00

# 3. Restart agents to apply
docker-compose restart

# 4. Upload to S3 if needed
./scripts/upload-configs.sh
```

**Option 2: Rollback from S3**
```bash
# 1. List S3 versions
./scripts/list-config-versions.sh

# 2. Download old version from S3
aws s3 sync s3://pardon-simulator-configs/versions/2024-11-19_14-30-00/ . \
  --region us-east-1 \
  --exclude ".git/*"

# 3. Upload to make it current
./scripts/upload-configs.sh

# 4. Force ECS to restart with new configs
aws ecs update-service \
  --cluster pardon-production \
  --service pardon-app \
  --force-new-deployment \
  --region us-east-1
```

### Backup Retention

**Local backups:**
- Stored in `/backups/` directory
- Not in git (excluded by .gitignore)
- Clean up old versions manually when disk space is low:
  ```bash
  # Remove backups older than 30 days
  find backups/ -type d -mtime +30 -exec rm -rf {} +
  ```

**S3 backups:**
- Stored indefinitely by default
- To save costs, consider adding S3 lifecycle policy to archive old versions:
  ```bash
  # Example: Move versions older than 90 days to Glacier
  aws s3api put-bucket-lifecycle-configuration \
    --bucket pardon-simulator-configs \
    --lifecycle-configuration file://lifecycle-policy.json
  ```

### Best Practices

1. **Before major changes:** Always create a manual backup
   ```bash
   ./scripts/backup-configs.sh
   ```

2. **Test locally first:** Use restore to test old configs locally before deploying

3. **Document changes:** Add notes about what changed in each version
   ```bash
   # Example workflow
   ./scripts/backup-configs.sh
   vim agents/cz/operational-private.txt  # Make changes
   git commit -m "CZ: Updated payment flow logic"
   ./scripts/upload-configs.sh
   ```

4. **Keep critical snapshots:** Download and archive critical versions separately

5. **Regular cleanup:** Clean old local backups monthly to save disk space

---

## 📚 More Information

- **ECS Fargate Deployment:** [docs/ECS_DEPLOYMENT.md](../docs/ECS_DEPLOYMENT.md)
- **GitHub Actions CI/CD:** [docs/GITHUB_ACTIONS_SETUP.md](../docs/GITHUB_ACTIONS_SETUP.md)
- **Configuration Reference:** [docs/CONFIGURATION.md](../docs/CONFIGURATION.md)
- **General Setup:** [docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md)
