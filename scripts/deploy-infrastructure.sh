#!/bin/bash
set -e

# Deploy all CloudFormation stacks for Pardon Simulator
# Usage: ./deploy-infrastructure.sh [dev|prod]

ENVIRONMENT=${1:-prod}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CLOUDFORMATION_DIR="$SCRIPT_DIR/../aws/cloudformation"
STACK_PREFIX="pardon-${ENVIRONMENT}"

echo "========================================="
echo "Deploying Pardon Simulator Infrastructure"
echo "Environment: $ENVIRONMENT"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to wait for stack completion
wait_for_stack() {
    local stack_name=$1
    echo "Waiting for stack $stack_name to complete..."
    aws cloudformation wait stack-create-complete --stack-name "$stack_name" 2>/dev/null || \
    aws cloudformation wait stack-update-complete --stack-name "$stack_name" 2>/dev/null
}

# Function to deploy a stack
deploy_stack() {
    local stack_name=$1
    local template_file=$2
    local parameters_file=$3
    
    echo -e "\n${YELLOW}Deploying stack: $stack_name${NC}"
    
    # Check if template exists
    if [ ! -f "$template_file" ]; then
        echo -e "${RED}Template not found: $template_file${NC}"
        exit 1
    fi
    
    # Validate template
    echo "Validating template..."
    aws cloudformation validate-template --template-body file://"$template_file" > /dev/null
    
    # Build deploy command
    local deploy_cmd="aws cloudformation deploy \
        --template-file \"$template_file\" \
        --stack-name \"$stack_name\" \
        --capabilities CAPABILITY_NAMED_IAM"
    
    # Add parameters if file exists
    if [ -f "$parameters_file" ]; then
        deploy_cmd="$deploy_cmd --parameter-overrides file://\"$parameters_file\""
    fi
    
    # Execute deployment
    eval $deploy_cmd
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Stack $stack_name deployed successfully${NC}"
    else
        echo -e "${RED}✗ Failed to deploy stack $stack_name${NC}"
        exit 1
    fi
}

# Function to get stack outputs
get_stack_output() {
    local stack_name=$1
    local output_key=$2
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text
}

# Step 1: Deploy Network Infrastructure
echo -e "\n${YELLOW}=========================================${NC}"
echo -e "${YELLOW}Step 1: Network Infrastructure${NC}"
echo -e "${YELLOW}=========================================${NC}"

deploy_stack \
    "${STACK_PREFIX}-network" \
    "$CLOUDFORMATION_DIR/network.yaml" \
    "$CLOUDFORMATION_DIR/network.parameters.json"

# Step 2: Deploy Secrets Manager
echo -e "\n${YELLOW}=========================================${NC}"
echo -e "${YELLOW}Step 2: AWS Secrets Manager${NC}"
echo -e "${YELLOW}=========================================${NC}"

deploy_stack \
    "${STACK_PREFIX}-secrets" \
    "$CLOUDFORMATION_DIR/secrets.yaml" \
    "$CLOUDFORMATION_DIR/secrets.parameters.json"

echo -e "${YELLOW}IMPORTANT: Update secrets with actual values using:${NC}"
echo -e "${YELLOW}  ./scripts/update-secrets.sh $ENVIRONMENT${NC}"

# Step 3: Deploy RDS Database
echo -e "\n${YELLOW}=========================================${NC}"
echo -e "${YELLOW}Step 3: RDS PostgreSQL Database${NC}"
echo -e "${YELLOW}=========================================${NC}"

if [ -f "$CLOUDFORMATION_DIR/rds.parameters.json" ]; then
    deploy_stack \
        "${STACK_PREFIX}-rds" \
        "$CLOUDFORMATION_DIR/rds.yaml" \
        "$CLOUDFORMATION_DIR/rds.parameters.json"
    
    DB_ENDPOINT=$(get_stack_output "${STACK_PREFIX}-rds" "DBInstanceEndpoint")
    echo -e "${GREEN}Database endpoint: $DB_ENDPOINT${NC}"
else
    echo -e "${YELLOW}Skipping RDS deployment (no parameters file)${NC}"
    echo -e "${YELLOW}Create $CLOUDFORMATION_DIR/rds.parameters.json with:${NC}"
    echo '  [
      {"ParameterKey": "DBUsername", "ParameterValue": "pardon_admin"},
      {"ParameterKey": "DBPassword", "ParameterValue": "YOUR_SECURE_PASSWORD"}
    ]'
fi

# Step 4: Deploy Application Load Balancer
echo -e "\n${YELLOW}=========================================${NC}"
echo -e "${YELLOW}Step 4: Application Load Balancer${NC}"
echo -e "${YELLOW}=========================================${NC}"

deploy_stack \
    "${STACK_PREFIX}-alb" \
    "$CLOUDFORMATION_DIR/alb.yaml" \
    "$CLOUDFORMATION_DIR/alb.parameters.json"

ALB_DNS=$(get_stack_output "${STACK_PREFIX}-alb" "LoadBalancerDNS")
echo -e "${GREEN}Load Balancer DNS: $ALB_DNS${NC}"

# Step 5: Deploy ECS Cluster
echo -e "\n${YELLOW}=========================================${NC}"
echo -e "${YELLOW}Step 5: ECS Fargate Cluster${NC}"
echo -e "${YELLOW}=========================================${NC}"

deploy_stack \
    "${STACK_PREFIX}-ecs" \
    "$CLOUDFORMATION_DIR/ecs-cluster.yaml" \
    "$CLOUDFORMATION_DIR/ecs-cluster.parameters.json"

# Summary
echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Infrastructure Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Update secrets: ./scripts/update-secrets.sh $ENVIRONMENT"
echo "2. Update DATABASE_URL in secrets with: postgresql://username:password@$DB_ENDPOINT:5432/pardon_simulator"
echo "3. Run database migrations: cd website && npx prisma migrate deploy"
echo "4. Point DNS to ALB: $ALB_DNS"
echo "5. Deploy application: ./scripts/deploy-ecs.sh"

echo -e "\n${YELLOW}Monitoring:${NC}"
echo "ECS Console: https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/${STACK_PREFIX}-cluster"
echo "CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group//ecs/${STACK_PREFIX}"
echo "RDS Console: https://console.aws.amazon.com/rds/home?region=us-east-1"

echo -e "\n${GREEN}Deployment completed successfully!${NC}"


