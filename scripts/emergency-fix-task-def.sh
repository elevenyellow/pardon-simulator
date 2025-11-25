#!/bin/bash

set -e

echo "🚨 EMERGENCY FIX: Adding SOLANA_RPC_URL to Task Definition"
echo "==========================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if HELIUS_API_KEY is provided
if [ -z "$1" ]; then
  echo -e "${RED}ERROR: HELIUS_API_KEY is required${NC}"
  echo ""
  echo "Usage: ./scripts/emergency-fix-task-def.sh YOUR_HELIUS_API_KEY"
  echo ""
  echo "Get your Helius API key from: https://www.helius.dev/"
  exit 1
fi

HELIUS_API_KEY="$1"
SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}"

echo -e "${YELLOW}Step 1: Fetching current task definition${NC}"
TASK_DEF_ARN=$(aws ecs describe-services \
  --cluster pardon-production-cluster \
  --services pardon-production-service \
  --region us-east-1 \
  --query 'services[0].taskDefinition' \
  --output text)

echo "Current: $TASK_DEF_ARN"
echo ""

echo -e "${YELLOW}Step 2: Getting task definition JSON${NC}"
TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition "$TASK_DEF_ARN" \
  --region us-east-1 \
  --query 'taskDefinition' \
  --output json)

echo ""
echo -e "${YELLOW}Step 3: Adding SOLANA_RPC_URL to all agent containers${NC}"

# For each agent, check if SOLANA_RPC_URL exists, and add it if missing
NEW_TASK_DEF=$(echo "$TASK_DEF" | jq \
  --arg RPC_URL "$SOLANA_RPC_URL" \
  '
  # Remove fields that cant be in register-task-definition
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy) |
  
  # Update each agent container to include SOLANA_RPC_URL
  .containerDefinitions |= map(
    if (.name | startswith("agent-")) then
      # Check if SOLANA_RPC_URL already exists
      if (.environment | any(.name == "SOLANA_RPC_URL")) then
        # Update existing SOLANA_RPC_URL
        .environment |= map(
          if .name == "SOLANA_RPC_URL" then
            .value = $RPC_URL
          else
            .
          end
        )
      else
        # Add SOLANA_RPC_URL
        .environment += [{name: "SOLANA_RPC_URL", value: $RPC_URL}]
      end
    else
      .
    end
  )
  ')

echo "✓ Updated JSON"
echo ""

echo -e "${YELLOW}Step 4: Registering new task definition${NC}"
NEW_TASK_DEF_ARN=$(echo "$NEW_TASK_DEF" | \
  aws ecs register-task-definition \
    --cli-input-json file:///dev/stdin \
    --region us-east-1 \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

echo -e "${GREEN}✓ New task definition registered: $NEW_TASK_DEF_ARN${NC}"
echo ""

echo -e "${YELLOW}Step 5: Updating ECS service to use new task definition${NC}"
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --force-new-deployment \
  --region us-east-1 \
  --query 'service.[serviceName,status,runningCount,desiredCount]' \
  --output table

echo ""
echo -e "${GREEN}✅ SERVICE UPDATED!${NC}"
echo ""
echo "Next steps:"
echo "  1. Wait ~2-3 minutes for new tasks to start"
echo "  2. Check agent logs: aws logs tail /ecs/pardon-production --follow"
echo "  3. Verify sessions exist: curl http://pardon-production-alb-437505889.us-east-1.elb.amazonaws.com:5555/api/v1/sessions"
echo "  4. Test chat on website"
echo ""

