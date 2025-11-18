#!/bin/bash
# Build Docker images locally and push to AWS ECR
set -e

echo "🏗️  Building and Pushing Docker Images to ECR"
echo "=============================================="

# Configuration
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
GIT_SHA=$(git rev-parse --short HEAD)

# Ensure Docker is in PATH
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Step 1: Login to ECR
echo "🔑 Logging into AWS ECR..."
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

# Step 2: Build Coral Server (for AMD64/x86_64 - Fargate compatible)
# Note: Building from project root context to include agent registry files
echo ""
echo "🏗️  Building coral-server for AMD64..."
docker build \
  --platform linux/amd64 \
  -t $ECR_REGISTRY/coral-server:latest \
  -t $ECR_REGISTRY/coral-server:$GIT_SHA \
  -f ./coral-server/Dockerfile \
  .

# Step 3: Build Pardon Agent (for AMD64/x86_64 - Fargate compatible)
echo ""
echo "🤖 Building pardon-agent for AMD64..."
docker build \
  --platform linux/amd64 \
  -t $ECR_REGISTRY/pardon-agent:latest \
  -t $ECR_REGISTRY/pardon-agent:$GIT_SHA \
  -f ./agents/Dockerfile.agent.minimal \
  ./agents

# Step 4: Push Images
echo ""
echo "📤 Pushing images to ECR..."
docker push $ECR_REGISTRY/coral-server:latest
docker push $ECR_REGISTRY/coral-server:$GIT_SHA
docker push $ECR_REGISTRY/pardon-agent:latest
docker push $ECR_REGISTRY/pardon-agent:$GIT_SHA

# Step 5: Verify
echo ""
echo "✅ Build and push complete!"
echo ""
echo "Images in ECR:"
echo "  - coral-server:latest (SHA: $GIT_SHA)"
echo "  - pardon-agent:latest (SHA: $GIT_SHA)"
echo ""
echo "Next steps:"
echo "  1. Deploy: ./scripts/deploy-ecs.sh"
echo "  2. Or wait for GitHub Actions to deploy automatically"


