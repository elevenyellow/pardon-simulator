#!/bin/bash
set -e

# Configuration
EC2_HOST="${EC2_HOST}"
EC2_USER="${EC2_USER:-ec2-user}"
KEY_PATH="${EC2_KEY_PATH:-~/.ssh/pardon-aws.pem}"

echo "=========================================="
echo "🚀 Deploying to AWS EC2"
echo "=========================================="
echo ""

# Check if variables are set
if [ -z "$EC2_HOST" ]; then
  echo "❌ Error: EC2_HOST environment variable not set"
  echo ""
  echo "Usage:"
  echo "  export EC2_HOST=your-ec2-ip-or-hostname"
  echo "  export EC2_KEY_PATH=~/.ssh/your-key.pem  # optional"
  echo "  ./scripts/deploy-to-aws.sh"
  echo ""
  echo "Or pass directly:"
  echo "  EC2_HOST=your-ec2-ip ./scripts/deploy-to-aws.sh"
  exit 1
fi

if [ ! -f "$KEY_PATH" ]; then
  echo "❌ Error: SSH key not found at: $KEY_PATH"
  echo ""
  echo "Set the correct path:"
  echo "  export EC2_KEY_PATH=/path/to/your/key.pem"
  exit 1
fi

echo "📍 Target:  ${EC2_USER}@${EC2_HOST}"
echo "🔑 SSH Key: ${KEY_PATH}"
echo ""

# Step 1: Upload configs to S3 (if you have them locally)
if [ -d "agents" ]; then
  echo "📤 Uploading configs to S3..."
  ./scripts/upload-configs.sh
  echo ""
else
  echo "⚠️  Skipping config upload (agents directory not found)"
  echo ""
fi

# Step 2: Deploy to EC2
echo "🔄 Deploying to EC2..."
echo ""

ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << 'ENDSSH'
  set -e
  
  echo "📥 Pulling latest code..."
  cd ~/pardon-simulator
  git fetch origin
  git pull origin main
  echo "✓ Code updated"
  echo ""
  
  echo "🛑 Stopping services..."
  docker-compose down
  echo "✓ Services stopped"
  echo ""
  
  echo "🔨 Rebuilding containers..."
  docker-compose build --no-cache
  echo "✓ Containers built"
  echo ""
  
  echo "🚀 Starting services..."
  docker-compose up -d
  echo "✓ Services started"
  echo ""
  
  echo "⏳ Waiting for services to be ready..."
  sleep 10
  
  echo ""
  echo "📊 Service Status:"
  docker-compose ps
  echo ""
  
  echo "📝 Recent logs:"
  docker-compose logs --tail=20
ENDSSH

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Check status:"
echo "  ssh -i $KEY_PATH $EC2_USER@$EC2_HOST 'docker-compose ps'"
echo ""
echo "View logs:"
echo "  ssh -i $KEY_PATH $EC2_USER@$EC2_HOST 'docker-compose logs -f'"
echo ""
echo "Coral Server should be accessible at:"
echo "  http://${EC2_HOST}:5555"

