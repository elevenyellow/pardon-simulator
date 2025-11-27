#!/bin/bash
set -e

echo "=========================================="
echo "🏗️  Create Elastic Beanstalk Environment"
echo "=========================================="
echo ""

# Check if EB is initialized
if [ ! -f ".elasticbeanstalk/config.yml" ]; then
  echo "❌ Elastic Beanstalk not initialized"
  echo "Run: ./scripts/eb-init.sh"
  exit 1
fi

# Environment name
ENV_NAME="${1:-pardon-production}"

echo "📍 Environment: ${ENV_NAME}"
echo ""

# Check if environment variables file exists
if [ ! -f ".env.production" ]; then
  echo "⚠️  .env.production not found"
  echo ""
  read -p "Create from template? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    cp env.production.template .env.production
    echo "✓ Created .env.production from template"
    echo "⚠️  Please edit .env.production and add your secrets"
    echo ""
    read -p "Press Enter when ready to continue..."
  else
    echo "❌ Cannot continue without .env.production"
    exit 1
  fi
fi

# Load environment variables
set -a
source .env.production
set +a

echo "🚀 Creating Elastic Beanstalk environment..."
echo "   This may take 5-10 minutes..."
echo ""

# Create environment with all required environment variables
eb create ${ENV_NAME} \
  --instance-type t3.medium \
  --envvars \
BACKEND_URL="${BACKEND_URL}",\
MODEL_API_KEY="${MODEL_API_KEY}",\
MODEL_NAME="${MODEL_NAME}",\
SOLANA_RPC_URL="${SOLANA_RPC_URL}",\
SOLANA_PRIVATE_KEY_CZ="${SOLANA_PRIVATE_KEY_CZ}",\
SOLANA_PRIVATE_KEY_DONALD="${SOLANA_PRIVATE_KEY_DONALD}",\
SOLANA_PRIVATE_KEY_MELANIA="${SOLANA_PRIVATE_KEY_MELANIA}",\
SOLANA_PRIVATE_KEY_ERIC="${SOLANA_PRIVATE_KEY_ERIC}",\
SOLANA_PRIVATE_KEY_DONJR="${SOLANA_PRIVATE_KEY_DONJR}",\
SOLANA_PRIVATE_KEY_BARRON="${SOLANA_PRIVATE_KEY_BARRON}",\
AWS_REGION="${AWS_REGION}",\
S3_BUCKET_NAME="${S3_BUCKET_NAME}"

echo ""
echo "=========================================="
echo "✅ Environment Created!"
echo "=========================================="
echo ""

# Get environment info
eb status

echo ""
echo "Next steps:"
echo "  1. Check health:"
echo "     eb health"
echo ""
echo "  2. View logs:"
echo "     eb logs"
echo ""
echo "  3. Open in browser:"
echo "     eb open"
echo ""
echo "  4. Deploy updates:"
echo "     eb deploy"

