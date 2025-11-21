#!/bin/bash
set -e

echo "=========================================="
echo "🚀 Initialize Elastic Beanstalk"
echo "=========================================="
echo ""

# Check if EB CLI is installed
if ! command -v eb &> /dev/null; then
  echo "❌ Elastic Beanstalk CLI not found"
  echo ""
  echo "Install with:"
  echo "  pip install awsebcli"
  echo ""
  echo "Or:"
  echo "  brew install awsebcli  # macOS"
  exit 1
fi

echo "✓ EB CLI found: $(eb --version)"
echo ""

# Check if already initialized
if [ -f ".elasticbeanstalk/config.yml" ]; then
  echo "⚠️  Elastic Beanstalk already initialized"
  echo ""
  echo "Current configuration:"
  cat .elasticbeanstalk/config.yml
  echo ""
  read -p "Reinitialize? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping initialization"
    exit 0
  fi
fi

echo "📦 Initializing Elastic Beanstalk application..."
echo ""

# Initialize EB
eb init pardon-simulator \
  --platform "Docker running on 64bit Amazon Linux 2" \
  --region us-east-1

echo ""
echo "=========================================="
echo "✅ Initialization Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Upload configs to S3:"
echo "     ./scripts/upload-configs.sh"
echo ""
echo "  2. Create environment:"
echo "     ./scripts/eb-create.sh"
echo ""
echo "  3. Deploy:"
echo "     eb deploy"



