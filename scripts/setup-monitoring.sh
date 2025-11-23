#!/bin/bash
set -e

# Deploy monitoring stack and configure CloudWatch
# Usage: ./setup-monitoring.sh [dev|prod] [alarm-email]

ENVIRONMENT=${1:-prod}
ALARM_EMAIL=$2
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CLOUDFORMATION_DIR="$SCRIPT_DIR/../aws/cloudformation"
STACK_PREFIX="pardon-${ENVIRONMENT}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;32m' # No Color

echo "========================================="
echo "Setting up Monitoring"
echo "Environment: $ENVIRONMENT"
echo "========================================="

# Deploy monitoring stack
echo -e "\n${YELLOW}Deploying monitoring stack...${NC}"

DEPLOY_CMD="aws cloudformation deploy \
    --template-file \"$CLOUDFORMATION_DIR/monitoring.yaml\" \
    --stack-name \"${STACK_PREFIX}-monitoring\" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides EnvironmentName=${STACK_PREFIX}"

if [ -n "$ALARM_EMAIL" ]; then
    DEPLOY_CMD="$DEPLOY_CMD AlarmEmail=${ALARM_EMAIL}"
    echo "Alarm email: $ALARM_EMAIL"
fi

eval $DEPLOY_CMD

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Monitoring stack deployed${NC}"
else
    echo -e "${RED}✗ Failed to deploy monitoring stack${NC}"
    exit 1
fi

# Get dashboard URL
DASHBOARD_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_PREFIX}-monitoring" \
    --query "Stacks[0].Outputs[?OutputKey=='DashboardURL'].OutputValue" \
    --output text)

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Monitoring Setup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"

echo -e "\n${YELLOW}CloudWatch Dashboard:${NC}"
echo "$DASHBOARD_URL"

echo -e "\n${YELLOW}Configured Alarms:${NC}"
echo "- High CPU Utilization (>80%)"
echo "- High Memory Utilization (>85%)"
echo "- Unhealthy ALB Targets"
echo "- High 5XX Error Rate"
echo "- RDS High CPU"
echo "- RDS Low Storage"

if [ -n "$ALARM_EMAIL" ]; then
    echo -e "\n${YELLOW}IMPORTANT: Check your email and confirm SNS subscription${NC}"
fi

echo -e "\n${YELLOW}Custom Metrics:${NC}"
echo "Pool health metrics are published by the /api/cron/pool-health endpoint"
echo "These will appear in CloudWatch under the 'PardonSimulator' namespace"

echo -e "\n${GREEN}Monitoring setup complete!${NC}"

