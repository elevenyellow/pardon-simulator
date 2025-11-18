#!/bin/bash
# Deploy to AWS ECS Fargate
set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Set AWS region (default to us-east-1 if not set)
export AWS_REGION=${AWS_REGION:-us-east-1}
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}

echo "🚀 Deploying to AWS ECS Fargate"
echo "================================="
echo "📍 Region: $AWS_REGION"
echo ""

# Check if ecs-task-definition.json exists
if [ ! -f "$SCRIPT_DIR/ecs-task-definition.json" ]; then
    echo "❌ Error: scripts/ecs-task-definition.json not found"
    echo "   Copy scripts/ecs-task-definition.example.json and fill in your secrets"
    echo "   cd scripts && cp ecs-task-definition.example.json ecs-task-definition.json"
    exit 1
fi

# Register task definition
echo "📝 Registering task definition..."
TASK_DEFINITION_ARN=$(aws ecs register-task-definition \
    --cli-input-json file://$SCRIPT_DIR/ecs-task-definition.json \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

echo "✅ Task definition registered: $TASK_DEFINITION_ARN"

# Update service (replace with your cluster and service names)
CLUSTER_NAME=${ECS_CLUSTER_NAME:-pardon-production}
SERVICE_NAME=${ECS_SERVICE_NAME:-pardon-app}

echo "🔄 Updating ECS service..."
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition $TASK_DEFINITION_ARN \
    --force-new-deployment

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "📊 Monitor deployment:"
echo "  aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME"
echo ""
echo "📝 View logs:"
echo "  aws logs tail /ecs/pardon-simulator --follow"

