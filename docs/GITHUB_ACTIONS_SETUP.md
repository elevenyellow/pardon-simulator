# GitHub Actions Setup for ECS Deployment

This guide explains how to set up automatic deployments to AWS ECS Fargate using GitHub Actions.

**Current Status:** Active in production deployment

## Overview

The workflow automatically deploys to AWS ECS Fargate whenever you push to `main` branch with changes to:
- `coral-server/**` (Kotlin code)
- `agents/**` (Python agents)
- `ecs-task-definition.json` (Container configuration)
- `website/**` (Auto-deploys via Vercel, not GitHub Actions)

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:

### Option 1: Repository-level Secrets (Simpler)

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these three secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | `AKIA****************` | Your AWS access key ID from IAM |
| `AWS_SECRET_ACCESS_KEY` | `****************************************` | Your AWS secret access key from IAM |
| `AWS_REGION` | `us-east-1` | AWS region (optional, hardcoded in workflow) |

### Option 2: Environment-level Secrets (Recommended for Production)

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Environments**
3. Click **New environment**
4. Name it: `production`
5. (Optional) Add protection rules:
   - ✅ **Required reviewers**: Add yourself or team members
   - ✅ **Wait timer**: Add a delay before deployment
6. Add the same secrets as above to the `production` environment

If using environments, the workflow already includes `environment: production` in the job definition.

## Workflow Details

### File Location
`.github/workflows/deploy-to-ecs-fargate.yml`

### Triggers
- **Automatic**: Push to `main` branch with changes to relevant files
- **Manual**: Click "Run workflow" in GitHub Actions tab

### What It Does

1. **Build Docker Images** (AMD64 for Fargate compatibility)
   - Builds `coral-server` image
   - Builds `pardon-agent` image
   - Tags with git SHA and `latest`

2. **Push to ECR**
   - Pushes images to AWS Elastic Container Registry
   - Uses GitHub Actions cache for faster builds

3. **Deploy to ECS**
   - Registers new task definition
   - Updates ECS service (triggers rolling deployment)
   - Waits for deployment to stabilize (3-5 minutes)

4. **Health Check**
   - Tests `/health` endpoint
   - Reports deployment status

### Deployment Time
- **Total**: ~8-12 minutes
  - Build & Push: 4-6 minutes
  - Deploy & Stabilize: 4-6 minutes

## Testing the Workflow

### First-time Setup Test

1. Add the secrets to GitHub
2. Make a small change (e.g., add a comment to `coral-server/README.md`)
3. Commit and push to `main`:
   ```bash
   git add .
   git commit -m "test: trigger ECS deployment workflow"
   git push origin main
   ```
4. Watch the workflow in **Actions** tab

### Manual Deployment

You can also trigger the workflow manually:
1. Go to **Actions** tab
2. Select **Deploy to ECS Fargate** workflow
3. Click **Run workflow**
4. Select `main` branch
5. Click **Run workflow** button

## Monitoring Deployment

### In GitHub Actions UI
- View live logs of each step
- See deployment status (success/failure)
- Get deployment summary with URLs

### In AWS Console
- **ECS Console**: See service status and task health
- **CloudWatch Logs**: View container logs at `/ecs/pardon-simulator`
- **ALB**: Check target health

### Via AWS CLI
```bash
# Check service status
aws ecs describe-services \
  --cluster pardon-production \
  --services pardon-app \
  --region us-east-1

# View logs
aws logs tail /ecs/pardon-simulator --follow --region us-east-1

# Check running tasks
aws ecs list-tasks \
  --cluster pardon-production \
  --service-name pardon-app \
  --region us-east-1
```

## Production URL

After successful deployment, your Coral server will be available at your ALB endpoint.

Find your ALB URL:
```bash
aws elbv2 describe-load-balancers --query 'LoadBalancers[?contains(LoadBalancerName, `pardon-alb`)].DNSName' --output text
```

Test it:
```bash
curl http://YOUR-ALB-URL:5555/health
```

## Vercel Integration

After ECS deployment completes, update your Vercel environment variables:

1. Go to Vercel project → **Settings** → **Environment Variables**
2. Add/update:
   ```
   CORAL_SERVER_URL=http://YOUR-ALB-URL:5555
   NODE_ENV=production
   ```
3. Redeploy your website (or it will auto-deploy on next push)

## Troubleshooting

### Workflow Fails at "Login to Amazon ECR"
**Problem**: AWS credentials are incorrect or missing

**Solution**: 
- Verify secrets in GitHub Settings
- Ensure IAM user has ECR permissions

### Workflow Fails at "Build and push"
**Problem**: Docker build errors or insufficient ECR permissions

**Solution**:
- Check build logs for specific errors
- Ensure ECR repositories exist (`coral-server` and `pardon-agent`)
- Verify IAM user has `ecr:PutImage` permission

### Workflow Fails at "Wait for deployment to stabilize"
**Problem**: Tasks failing health checks or crashing

**Solution**:
- Check CloudWatch logs: `aws logs tail /ecs/pardon-simulator --follow`
- Verify task definition is correct
- Check security group allows ALB traffic

### Health Check Timeout
**Problem**: Service deployed but not responding

**Solution**:
- Wait 1-2 more minutes (services can be slow to start)
- Check ALB target health in AWS Console
- Verify agents are connecting: check logs for agent startup messages

## Rollback

If a deployment fails or causes issues:

1. **Via AWS Console**:
   - Go to ECS → Services → pardon-app
   - Click **Update**
   - Select previous task definition
   - Click **Update service**

2. **Via AWS CLI**:
   ```bash
   # List task definitions
   aws ecs list-task-definitions --family-prefix pardon-simulator
   
   # Rollback to previous version
   aws ecs update-service \
     --cluster pardon-production \
     --service pardon-app \
     --task-definition pardon-simulator:6 \
     --region us-east-1
   ```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ GitHub Push (main branch)                               │
│   └─ Changes to coral-server/, agents/, or ECS config  │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ GitHub Actions Runner (Ubuntu)                          │
│   1. Build Docker images (AMD64)                        │
│   2. Push to ECR                                        │
│   3. Register task definition                           │
│   4. Update ECS service                                 │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ AWS ECS Fargate                                         │
│   ┌──────────────┐  ┌──────────────┐                   │
│   │ coral-server │  │ agent-cz     │                   │
│   │ (port 5555)  │  │ agent-sbf    │                   │
│   └──────────────┘  └──────────────┘                   │
│           │                                              │
│           └─── ALB (Load Balancer) ───┐                │
└────────────────────────────────────────┼────────────────┘
                                         │
                                         ▼
                              http://pardon-alb-*.amazonaws.com:5555
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │ Vercel (Website)    │
                              │ NODE_ENV=production │
                              └─────────────────────┘
```

## Cost Optimization

The workflow uses GitHub Actions caching to speed up builds and reduce costs:
- Docker layer caching (`cache-from` / `cache-to`)
- Only rebuilds changed layers
- Typical build time reduced from 10 minutes to 2-3 minutes after first run

## Next Steps

1. ✅ Add GitHub secrets
2. ✅ Test the workflow with a small change
3. ✅ Verify deployment in AWS Console
4. ✅ Update Vercel environment variables
5. ✅ Test end-to-end from your website

## Questions?

Check out these resources:
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Documentation](https://docs.docker.com/build/)

