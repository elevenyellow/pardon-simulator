#!/bin/bash
set -e

# Rollback ECS service to previous task definition
# Usage: ./rollback.sh [dev|prod]

ENVIRONMENT=${1:-prod}
CLUSTER_NAME="pardon-${ENVIRONMENT}-cluster"
SERVICE_NAME="pardon-${ENVIRONMENT}-service"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;m' # No Color

echo "========================================="
echo "ECS Service Rollback"
echo "Cluster: $CLUSTER_NAME"
echo "Service: $SERVICE_NAME"
echo "========================================="

# Get current task definition
CURRENT_TASK_DEF=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --query "services[0].taskDefinition" \
    --output text)

echo -e "\n${YELLOW}Current task definition:${NC} $CURRENT_TASK_DEF"

# Get task definition family
TASK_FAMILY=$(echo "$CURRENT_TASK_DEF" | cut -d'/' -f2 | cut -d':' -f1)

# List recent task definitions
echo -e "\n${YELLOW}Recent task definitions:${NC}"
aws ecs list-task-definitions \
    --family-prefix "$TASK_FAMILY" \
    --sort DESC \
    --max-items 5 \
    --query "taskDefinitionArns[]" \
    --output table

# Prompt for rollback confirmation
echo -e "\n${RED}WARNING: This will rollback the service to a previous task definition${NC}"
read -p "Enter the task definition ARN to rollback to: " ROLLBACK_TASK_DEF

if [ -z "$ROLLBACK_TASK_DEF" ]; then
    echo -e "${RED}No task definition provided. Aborting.${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Rolling back to: $ROLLBACK_TASK_DEF${NC}"
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Rollback cancelled"
    exit 0
fi

# Update service with previous task definition
echo -e "\n${YELLOW}Updating service...${NC}"

aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --task-definition "$ROLLBACK_TASK_DEF" \
    --force-new-deployment \
    > /dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Service update initiated${NC}"
else
    echo -e "${RED}✗ Service update failed${NC}"
    exit 1
fi

# Wait for rollback to complete
echo -e "\n${YELLOW}Waiting for rollback to complete...${NC}"
echo "This may take several minutes"

aws ecs wait services-stable \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME"

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}Rollback Complete!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    
    # Display service status
    aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --query "services[0].[runningCount,desiredCount,taskDefinition]" \
        --output table
    
    echo -e "\n${YELLOW}Monitor the service:${NC}"
    echo "https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/$CLUSTER_NAME/services/$SERVICE_NAME"
    
else
    echo -e "\n${RED}✗ Rollback timed out or failed${NC}"
    echo "Check ECS console for service status"
    exit 1
fi













