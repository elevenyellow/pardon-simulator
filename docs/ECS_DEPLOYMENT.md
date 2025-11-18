# ECS Fargate Deployment Guide

Guide for deploying Pardon Simulator to AWS ECS Fargate.

---

## ⚠️ Security Warning

**NEVER commit `scripts/ecs-task-definition.json` with real secrets!**

The ECS task definition contains environment variables with secrets hardcoded inline. This is a limitation of how ECS task definitions work. Always keep the actual file gitignored.

---

## Setup

### 1. Create Your Task Definition

```bash
# Copy the example
cd scripts
cp ecs-task-definition.example.json ecs-task-definition.json

# Edit with your actual values
nano ecs-task-definition.json
```

**Replace these placeholders:**
- `YOUR_ACCOUNT_ID` - Your AWS account ID
- `YOUR_OPENAI_API_KEY_HERE` - Your OpenAI API key
- `YOUR_HELIUS_API_KEY` - Your Helius API key
- `YOUR_*_SOLANA_PRIVATE_KEY_BASE58` - Solana private keys for each agent

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

## Better Alternative: AWS Secrets Manager

**Recommended:** Instead of hardcoding secrets in task definition, use AWS Secrets Manager:

### 1. Create Secrets in AWS Secrets Manager

```bash
# OpenAI API Key
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

