# ⚡ Professional Deployment - Quick Start

Get your Coral Server deployed in **3 simple steps**!

---

## 🎯 Goal

Deploy your Coral Server with enterprise-grade CI/CD pipeline so you can set:
```bash
CORAL_SERVER_URL=http://pardon-production.eba-bfv2dghu.us-east-1.elasticbeanstalk.com:5555
```

---

## ✅ Prerequisites Checklist

- [x] AWS account configured (`aws configure` done)
- [x] GitHub repository set up
- [x] AWS environment variables set in EB (already done ✅)
- [ ] GitHub Secrets configured (do this now ⬇️)

---

## 🚀 3 Steps to Deploy

### Step 1: Configure GitHub Secrets (2 minutes)

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add these:

```
Name: AWS_ACCESS_KEY_ID
Value: <your AWS access key>

Name: AWS_SECRET_ACCESS_KEY
Value: <your AWS secret key>

Name: AWS_REGION
Value: us-east-1
```

> **Where to get AWS credentials?**
> Run: `cat ~/.aws/credentials` or create new ones in AWS IAM

---

### Step 2: Push to GitHub (1 minute)

```bash
cd /Users/al/apps/pardon-simulator

# Add all changes
git add .

# Commit
git commit -m "Setup professional CI/CD deployment with ECR"

# Push (this triggers the deployment!)
git push origin main
```

---

### Step 3: Watch the Magic ✨ (10-15 minutes)

1. **Go to GitHub → Actions tab**
2. Click on the running workflow: "Professional CI/CD - Build & Deploy to EB"
3. Watch the progress:
   - ✅ Build Docker images (5-7 min)
   - ✅ Push to ECR (1-2 min)
   - ✅ Deploy to Elastic Beanstalk (3-5 min)
   - ✅ Health checks & smoke tests (2 min)

---

## 🎉 Verify Deployment

### Check Status

```bash
eb status pardon-production
```

Should show:
```
Status: Ready
Health: Green
```

### Test Health Endpoint

```bash
curl http://pardon-production.eba-bfv2dghu.us-east-1.elasticbeanstalk.com:5555/health
```

Should return:
```json
{"status":"healthy"}
```

Or similar success response.

---

## 📝 Update Your Next.js Backend

In your Vercel project settings, set:

```bash
CORAL_SERVER_URL=http://pardon-production.eba-bfv2dghu.us-east-1.elasticbeanstalk.com:5555
```

Then redeploy Vercel:
```bash
vercel --prod
```

---

## 🎯 Daily Workflow (After First Deploy)

From now on, deploying is **automatic**:

```bash
# Make your changes
vim agents/cz/operational-private.txt

# Commit and push
git add .
git commit -m "Update CZ agent prompt"
git push

# 🎉 That's it! GitHub Actions deploys automatically
```

---

## 📊 Key Commands

```bash
# Check deployment status
eb status pardon-production

# View health
eb health pardon-production

# View logs
eb logs pardon-production --stream

# SSH to instance (if needed)
eb ssh pardon-production

# Manual deploy (if needed)
eb deploy pardon-production
```

---

## ❌ Troubleshooting

### GitHub Actions fails?

1. Check the Actions tab for error logs
2. Verify GitHub Secrets are set correctly
3. Check AWS credentials are valid

### Deployment succeeds but health is Red?

```bash
# Check logs
eb logs pardon-production

# SSH and check containers
eb ssh pardon-production
docker-compose ps
docker-compose logs
```

### Can't access the URL?

1. Check security group allows port 5555
2. Verify load balancer is configured
3. Test from instance: `curl http://localhost:5555/health`

---

## 🏁 Success Checklist

- [ ] GitHub Actions workflow completed successfully
- [ ] `eb health` shows Green/Ok
- [ ] Health endpoint responds: `curl ...5555/health`
- [ ] Updated Vercel with `CORAL_SERVER_URL`
- [ ] Next.js can send messages to agents

---

## 🎉 You're Done!

**You now have:**
- ✅ Enterprise-grade CI/CD pipeline
- ✅ Automatic deployments on `git push`
- ✅ Private Docker registry (ECR)
- ✅ Auto-scaling infrastructure
- ✅ Zero-downtime updates
- ✅ Production-ready Coral Server

**Your Coral Server URL:**
```
http://pardon-production.eba-bfv2dghu.us-east-1.elasticbeanstalk.com:5555
```

---

## 📚 More Info

- **Detailed Guide**: See `DEPLOYMENT_PROFESSIONAL.md`
- **Architecture**: See architecture diagram in `DEPLOYMENT_PROFESSIONAL.md`
- **Troubleshooting**: Full guide in `DEPLOYMENT_PROFESSIONAL.md`

---

**Ready to deploy? Go to Step 1! 🚀**

