#!/bin/bash
# Sync local configuration files to production S3
set -e

echo "=========================================="
echo "🔄 Syncing Configs to Production"
echo "=========================================="
echo ""
echo "This script uploads your local agent configs"
echo "to S3 so they're available in production."
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ AWS CLI not configured. Please run 'aws configure' first."
  exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Run the upload script
./scripts/upload-configs.sh

echo ""
echo "=========================================="
echo "✅ Configs synced to production S3!"
echo "=========================================="
echo ""
echo "To apply changes to running agents:"
echo ""
echo "  # Force ECS to restart agents with new configs"
echo "  aws ecs update-service \\"
echo "    --cluster pardon-production \\"
echo "    --service pardon-app \\"
echo "    --force-new-deployment \\"
echo "    --region us-east-1"
echo ""
echo "  # Monitor deployment"
echo "  aws ecs describe-services \\"
echo "    --cluster pardon-production \\"
echo "    --services pardon-app \\"
echo "    --region us-east-1"
echo ""

