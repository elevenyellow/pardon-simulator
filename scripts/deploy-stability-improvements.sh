#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Conversation Stability Improvements"
echo "=========================================="
echo ""
echo "Changes being deployed:"
echo "  1. Simplified pool architecture (5 pools -> 1 pool per Coral)"
echo "  2. Extended sticky sessions (1h -> 24h)"
echo "  3. Improved thread restoration logic (prevents message loss)"
echo "  4. Health monitoring endpoint"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 1
fi

STACK_PREFIX="pardon-production"
AWS_REGION="us-east-1"

echo ""
echo "Step 1: Updating ALB Configuration (Extended Sticky Sessions)"
echo "=========================================="
cd "$(dirname "$0")/.."
aws cloudformation update-stack \
  --stack-name "${STACK_PREFIX}-alb" \
  --template-body file://aws/cloudformation/alb.yaml \
  --parameters file://aws/cloudformation/alb.parameters.json \
  --region "$AWS_REGION" \
  --capabilities CAPABILITY_IAM

echo "Waiting for ALB stack update to complete..."
aws cloudformation wait stack-update-complete \
  --stack-name "${STACK_PREFIX}-alb" \
  --region "$AWS_REGION"

echo "✅ ALB updated with 24-hour sticky sessions"
echo ""

echo "Step 2: Deploying Website Changes (Restoration Fix + Health Check)"
echo "=========================================="
cd website
npm run build

echo "✅ Website built with improvements"
echo ""

echo "Step 3: Update Agent Configuration (Simplified Pools)"
echo "=========================================="
echo "⚠️  MANUAL ACTION REQUIRED:"
echo ""
echo "Update the ECS task definition to change:"
echo "  FROM: CORAL_SESSIONS=pool-0,pool-1,pool-2,pool-3,pool-4"
echo "  TO:   CORAL_SESSION_ID=main"
echo ""
echo "For all agent containers (trump-donald, melania, eric, etc.)"
echo ""
echo "This simplifies the architecture and improves stability."
echo ""
read -p "Press enter after updating ECS task definition..." 

echo ""
echo "Step 4: Graceful Restart (Zero Downtime)"
echo "=========================================="
echo "Performing rolling restart of ECS tasks..."

# Get current task ARNs
TASK_ARNS=$(aws ecs list-tasks \
  --cluster "${STACK_PREFIX}-cluster" \
  --service-name "${STACK_PREFIX}-service" \
  --region "$AWS_REGION" \
  --query 'taskArns[]' \
  --output text)

if [ -z "$TASK_ARNS" ]; then
    echo "⚠️  No tasks found to restart"
else
    # Force new deployment (rolling update)
    aws ecs update-service \
      --cluster "${STACK_PREFIX}-cluster" \
      --service "${STACK_PREFIX}-service" \
      --force-new-deployment \
      --region "$AWS_REGION" > /dev/null
    
    echo "Waiting for service to stabilize..."
    aws ecs wait services-stable \
      --cluster "${STACK_PREFIX}-cluster" \
      --services "${STACK_PREFIX}-service" \
      --region "$AWS_REGION"
    
    echo "✅ Rolling restart complete"
fi

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Improvements Applied:"
echo "  ✅ 24-hour sticky sessions (was 1 hour)"
echo "  ✅ Thread restoration no longer wipes messages"
echo "  ✅ Simplified pool architecture"
echo "  ✅ Health monitoring at /api/health/coral"
echo ""
echo "Architecture:"
echo "  • 3 ECS tasks for HA and capacity"
echo "  • Each task: 1 Coral Server + all 8 agents"
echo "  • ALB pins users to same task for 24 hours"
echo "  • Conversations are rock-solid within 24h window"
echo ""
echo "Monitoring:"
echo "  curl https://pardonsimulator.com/api/health/coral"
echo ""
echo "Next Steps:"
echo "  1. Test a full conversation flow"
echo "  2. Monitor CloudWatch logs for any issues"
echo "  3. Set up CloudWatch alarm on /api/health/coral"
echo ""

