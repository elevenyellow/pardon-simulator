#!/bin/bash
set -e

echo "=========================================="
echo "🚀 Deploy to Elastic Beanstalk"
echo "=========================================="
echo ""

# Check if EB is initialized
if [ ! -f ".elasticbeanstalk/config.yml" ]; then
  echo "❌ Elastic Beanstalk not initialized"
  echo "Run: ./scripts/eb-init.sh"
  exit 1
fi

# Upload configs to S3 first
echo "📤 Uploading configs to S3..."
./scripts/upload-configs.sh
echo ""

# Deploy to EB
echo "📦 Deploying to Elastic Beanstalk..."
echo "   This may take 3-5 minutes..."
echo ""

eb deploy --staged

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""

# Check status
echo "📊 Environment Status:"
eb status

echo ""
echo "Useful commands:"
echo "  eb health          - Check health status"
echo "  eb logs            - View application logs"
echo "  eb ssh             - SSH into an instance"
echo "  eb open            - Open in browser"


