# 🚨 ROOT CAUSE ANALYSIS - Agent Availability Issues

**Date:** November 25, 2025  
**Status:** CRITICAL - ALL AGENTS FAILING TO START

---

## 🔍 Investigation Summary

### What We Found:

1. ✅ **Coral Server is running** and healthy
2. ✅ **Serialization bug was FIXED** (no longer getting mixed-type errors)
3. ❌ **ALL 7 AGENT CONTAINERS ARE STOPPED** with exit code 1
4. ❌ **No pool sessions exist** (because agents never connect)

### Timeline of Issues:

1. **Initial Issue:** Serialization error when querying `/api/v1/sessions/{sessionId}/agents`
   - **Fixed:** Changed response to use proper data class

2. **Second Issue:** Docker images in ECR were UNTAGGED
   - **Fixed:** Manually tagged images with commit SHA (7046e2f) and latest

3. **Current Issue:** Agents crash immediately on startup (before logging)

---

## 🎯 ROOT CAUSE: Docker Build Failures

### The Problem:

Looking at `agents/Dockerfile.agent.minimal` lines 52-56:

```dockerfile
# Install Trump agents - skip if they fail (dependency conflicts)
RUN cd /app/trump-donald && rm -rf .venv && poetry config virtualenvs.create false && (poetry install --only main --no-root || echo "Trump Donald skipped") && \
    cd /app/trump-melania && rm -rf .venv && poetry config virtualenvs.create false && (poetry install --only main --no-root || echo "Trump Melania skipped") && \
    cd /app/trump-eric && rm -rf .venv && poetry config virtualenvs.create false && (poetry install --only main --no-root || echo "Trump Eric skipped") && \
    cd /app/trump-donjr && rm -rf .venv && poetry config virtualenvs.create false && (poetry install --only main --no-root || echo "Trump Donjr skipped") && \
    cd /app/trump-barron && rm -rf .venv && poetry config virtualenvs.create false && (poetry install --only main --no-root || echo "Trump Barron skipped")
```

**The `|| echo "skipped"` pattern means:**
- If `poetry install` fails, the build continues anyway
- The agent directory exists but has NO installed dependencies
- When the agent tries to start, it fails immediately because required Python packages are missing

### Why This Is Failing:

1. **GitHub Actions builds the images** but dependency installation failures are hidden
2. **Images are pushed to ECR** even though they're broken
3. **ECS pulls the broken images** and tries to run them
4. **Agents crash instantly** because Python can't import required packages

### Evidence:

- All agents exit with code 1
- No logs are written (failure happens before logging initializes)
- CZ and SBF use different install strategy (lines 48-49) - they also fail, suggesting wider issue

---

## ✅ THE SOLUTION

### Fix 1: Update Dockerfile

Remove the `|| echo "skipped"` pattern and make dependency installation REQUIRED:

```dockerfile
# Install dependencies for ALL agents (MUST succeed)
RUN cd /app/cz && rm -rf .venv && poetry config virtualenvs.create false && poetry install --only main --no-root && \
    cd /app/sbf && rm -rf .venv && poetry config virtualenvs.create false && poetry install --only main --no-root && \
    cd /app/trump-donald && rm -rf .venv && poetry config virtualenvs.create false && poetry install --only main --no-root && \
    cd /app/trump-melania && rm -rf .venv && poetry config virtualenvs.create false && poetry install --only main --no-root && \
    cd /app/trump-eric && rm -rf .venv && poetry config virtualenvs.create false && poetry install --only main --no-root && \
    cd /app/trump-donjr && rm -rf .venv && poetry config virtualenvs.create false && poetry install --only main --no-root && \
    cd /app/trump-barron && rm -rf .venv && poetry config virtualenvs.create false && poetry install --only main --no-root
```

**If any agent's dependencies fail, the Docker build will FAIL** - which is what we want!

### Fix 2: Resolve Dependency Conflicts

If dependency installation still fails, we need to:

1. Check each agent's `pyproject.toml` for conflicts
2. Ensure all agents use compatible package versions
3. Consider using a shared `requirements.txt` for common dependencies

### Fix 3: Improve GitHub Actions

Add validation step in `.github/workflows/deploy-to-ecs-fargate.yml`:

```yaml
- name: 🧪 Validate agent dependencies
  run: |
    echo "Testing if agent dependencies installed correctly..."
    docker run --rm ${{ env.ECR_REGISTRY }}/pardon-agent:${{ steps.meta.outputs.tags }} \
      python -c "import langchain; import anthropic; print('✅ Dependencies OK')"
```

---

## 🚀 Deployment Plan

### Step 1: Fix Dockerfile

```bash
cd /Users/al/apps/pardon-simulator

# Edit agents/Dockerfile.agent.minimal
# Remove || echo "skipped" from lines 52-56
# Ensure all poetry install commands MUST succeed
```

### Step 2: Commit and Push

```bash
git add agents/Dockerfile.agent.minimal
git commit -m "fix(agents): ensure all dependencies install correctly

- Remove || echo skipped pattern that hides failures
- Make dependency installation required for all agents
- Docker build will now fail if any agent dependencies fail

This ensures we never deploy broken images to production."

git push origin main
```

### Step 3: Monitor GitHub Actions

Watch the build at: https://github.com/YOUR_REPO/actions

**Expected:**
- If dependencies install correctly → Build succeeds, agents start
- If dependencies have conflicts → Build FAILS (which is good - we catch the issue early)

### Step 4: If Build Fails - Fix Dependencies

Check the GitHub Actions logs to see which agent failed and why:

```bash
# Common issues:
# 1. Version conflicts between packages
# 2. Missing system dependencies in Dockerfile
# 3. Poetry lock file out of sync

# Solutions:
cd agents/FAILING_AGENT
poetry lock --no-update  # Regenerate lock file
poetry install  # Test locally
```

### Step 5: Verify Deployment

Once GitHub Actions succeeds and deploys:

```bash
# Check sessions exist
curl http://pardon-production-alb-437505889.us-east-1.elb.amazonaws.com:5555/api/v1/sessions

# Should return:
# ["pool-0","pool-1","pool-2","pool-3","pool-4"]

# Check each pool has all 7 agents
for pool in pool-0 pool-1 pool-2 pool-3 pool-4; do
  echo "Pool: $pool"
  curl http://pardon-production-alb-437505889.us-east-1.elb.amazonaws.com:5555/api/v1/sessions/$pool/agents | jq '.agentCount'
done

# Should return: 7 for each pool
```

---

## 📊 Expected Results After Fix

**Before (Current State):**
```
✅ Coral Server: RUNNING
❌ Agents: ALL STOPPED (exit code 1)
❌ Sessions: []
❌ User experience: Cannot chat with any agent
```

**After (Fixed State):**
```
✅ Coral Server: RUNNING
✅ All 7 Agents: RUNNING in all 5 pools
✅ Sessions: ["pool-0","pool-1","pool-2","pool-3","pool-4"]
✅ User experience: Can chat with any agent
```

---

## 🔧 Alternative Quick Fix (If Dockerfile Fix Takes Too Long)

If we need agents working NOW and can't wait for full fix:

### Option A: Roll Back to Known Working Image

```bash
# Find last known working image tag
aws ecr list-images --repository-name pardon-agent --filter tagStatus=TAGGED --query 'imageIds[*].imageTag' --output table

# Update task definition to use that tag
# Force new deployment
```

### Option B: Deploy Only Working Agents First

Temporarily remove Trump agents from task definition, deploy only CZ and SBF until Trump agent dependencies are fixed.

---

## 📝 Lessons Learned

1. **Never silently ignore build failures** - `|| echo "skipped"` hides critical issues
2. **Add validation steps** to CI/CD to catch broken images before deployment
3. **Test locally first** - run `docker build` and `docker run` before pushing
4. **Monitor logs during deployment** - we should have caught this faster

---

## 🎯 Action Items

- [ ] Fix Dockerfile to remove silent failure pattern
- [ ] Add dependency validation to GitHub Actions
- [ ] Test Docker build locally before pushing
- [ ] Add health check script that validates all agent imports
- [ ] Document dependency management process
- [ ] Consider using shared base image to reduce duplication

---

**Status:** Awaiting Dockerfile fix and rebuild  
**Priority:** CRITICAL  
**Owner:** Development Team  
**Est. Time to Fix:** 15-30 minutes (Dockerfile edit + rebuild + deploy)

