# ECS Fargate Deployment Guide

Guide for deploying Pardon Simulator to AWS ECS Fargate.

---

## Current Production Environment

**Live System:**
- Deployed on AWS ECS Fargate
- Architecture: Single session, all agents in one ECS task
- Database: Managed PostgreSQL
- Config Storage: Cloud storage bucket

---

## ⚠️ Security Warning

**Use AWS Secrets Manager for production secrets.**

The ECS task definition can reference secrets from AWS Secrets Manager instead of hardcoding them inline.

---

## Architecture Overview

**Single Session Design:**
- All agents run in one ECS task (simplified from multi-session)
- Single Coral session: `production-main`
- Agents connect to shared session on startup
- Config files fetched from S3 on container start
- More stable and easier to manage than multi-session

**Container Structure:**
```
ECS Task
├── Coral Server (port 5555)
└── 6 Agent Processes
    ├── trump-donald
    ├── trump-melania
    ├── trump-eric
    ├── trump-donjr
    ├── trump-barron
    └── cz
```

## Deployment

### Quick Deploy

```bash
# Update service with latest code (GitHub Actions handles this)
git push origin main

# Or manual deployment
./scripts/deploy-ecs.sh
```

### Manual Task Definition Update

```bash
# Register new task definition
aws ecs register-task-definition \
  --cli-input-json file://scripts/ecs-task-definition.json

# Update service (use your cluster and service names)
aws ecs update-service \
  --cluster YOUR_CLUSTER_NAME \
  --service YOUR_SERVICE_NAME \
  --force-new-deployment
```

### 2. Configure AWS CLI

```bash
aws configure
# Enter your AWS credentials
```

### 3. Create ECS Cluster (First Time Only)

```bash
aws ecs create-cluster --cluster-name pardon-simulator-cluster
```

### 4. Create ECS Service (First Time Only)

```bash
# Create VPC, subnets, security groups, load balancer, etc.
# See AWS ECS documentation for detailed setup
```

---

## Deployment

### Deploy Updates

```bash
./scripts/deploy-ecs.sh
```

This script:
1. Checks for `scripts/ecs-task-definition.json`
2. Registers new task definition with ECS
3. Updates the service to use new task definition
4. Forces new deployment

### Monitor Deployment

```bash
# Check service status
aws ecs describe-services \
    --cluster pardon-simulator-cluster \
    --services pardon-simulator-service

# View logs
aws logs tail /ecs/pardon-simulator --follow
```

---

## Monitoring Production

### Check Service Health

```bash
# Service status
aws ecs describe-services \
  --cluster YOUR_CLUSTER_NAME \
  --services YOUR_SERVICE_NAME

# List running tasks
aws ecs list-tasks --cluster YOUR_CLUSTER_NAME

# Task details
aws ecs describe-tasks \
  --cluster YOUR_CLUSTER_NAME \
  --tasks <TASK_ID>
```

### View Logs

```bash
# Tail all logs in real-time
aws logs tail YOUR_LOG_GROUP --follow

# Filter specific agent
aws logs tail YOUR_LOG_GROUP --follow --filter-pattern "agent-name"

# Last 1 hour of errors
aws logs filter-log-events \
  --log-group-name YOUR_LOG_GROUP \
  --start-time $(date -u -v-1H +%s)000 \
  --filter-pattern "ERROR"
```

### Restart Service

```bash
# Force new deployment (restarts all agents)
aws ecs update-service \
  --cluster YOUR_CLUSTER_NAME \
  --service YOUR_SERVICE_NAME \
  --force-new-deployment

# Monitor deployment
watch -n 5 'aws ecs describe-services \
  --cluster YOUR_CLUSTER_NAME \
  --services YOUR_SERVICE_NAME \
  --query "services[0].deployments"'
```

## Configuration Management

### Cloud Config Files

Agent configurations stored in cloud storage:
```
config-bucket/
├── agent1/
│   ├── operational-private.txt
│   ├── personality-public.txt
│   └── scoring-config.txt
├── agent2/
├── agent3/
└── ...
```

### Update Agent Config

```bash
# Update config file
aws s3 cp agents/AGENT_NAME/operational-private.txt \
  s3://YOUR_CONFIG_BUCKET/AGENT_NAME/

# Agents reload config on next message (no restart needed)
```

## AWS Secrets Manager (Production)

**Current Production Setup:**

### 1. Create Secrets in AWS Secrets Manager

```bash
# LLM Provider API Key
aws secretsmanager create-secret \
    --name pardon/openai-api-key \
    --secret-string "sk-proj-your-key-here"

# Helius API Key  
aws secretsmanager create-secret \
    --name pardon/helius-api-key \
    --secret-string "your-helius-key"

# Solana Private Keys
aws secretsmanager create-secret \
    --name pardon/solana-private-key-cz \
    --secret-string "your-cz-private-key"
```

### 2. Update Task Definition to Reference Secrets

Instead of:
```json
{"name": "MODEL_API_KEY", "value": "sk-proj-..."}
```

Use:
```json
{
  "name": "MODEL_API_KEY",
  "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:pardon/openai-api-key"
}
```

### 3. Update IAM Task Execution Role

Add permissions to read from Secrets Manager:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:pardon/*"
      ]
    }
  ]
}
```

---

## File Structure

```
scripts/
  ecs-task-definition.json          # Your actual file (GITIGNORED, has secrets)
  ecs-task-definition.example.json  # Template (safe to commit)
  deploy-ecs.sh                     # Deployment script
.ecs-production-url.txt             # Your ECS service URL (GITIGNORED)
```

---

## Security Best Practices

### ✅ DO:
- Keep `scripts/ecs-task-definition.json` in `.gitignore`
- Use AWS Secrets Manager for production
- Rotate secrets regularly
- Use IAM roles for AWS permissions
- Limit task role permissions

### ❌ DON'T:
- Commit task definition with real secrets
- Share `scripts/ecs-task-definition.json` via Slack/email
- Use same secrets for dev/production
- Give task roles overly broad permissions

---

## Troubleshooting

### Task Won't Start

**Check logs:**
```bash
aws logs tail /ecs/pardon-simulator --follow
```

**Common issues:**
- Invalid secrets format
- IAM role permissions
- Container image not found
- Insufficient CPU/memory

### Secrets Not Loading

**Verify secrets exist:**
```bash
aws secretsmanager list-secrets
```

**Check task execution role has permissions:**
```bash
aws iam get-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-name SecretsManagerAccess
```

---

## Cost Optimization

- **CPU/Memory:** Adjust based on actual usage
- **Spot Instances:** Use Fargate Spot for cost savings
- **Auto-scaling:** Scale down during low traffic
- **Monitoring:** Use CloudWatch to track costs

---

## Related Documentation

- **[CONFIGURATION.md](./CONFIGURATION.md)** - Configuration reference
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - General deployment guide
- **[AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)** - Official AWS docs

---

**Remember:** Always use AWS Secrets Manager for production deployments to avoid hardcoding secrets in task definitions!

