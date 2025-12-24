#!/bin/bash
#
# Production Agent Availability Diagnostic Script
# Checks all critical components for agent connectivity
#

set -e

# Use pardon-production AWS profile
export AWS_PROFILE="${AWS_PROFILE:-pardon-production}"

CLUSTER_NAME="${CLUSTER_NAME:-pardon-production-cluster}"
SERVICE_NAME="${SERVICE_NAME:-pardon-production-service}"
LOG_GROUP="${LOG_GROUP:-/ecs/pardon-production}"

echo "=================================="
echo "🔍 Pardon Simulator Diagnostics"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

#
# STEP 1: Check AWS Connectivity
#
echo "📡 Step 1: Checking AWS connectivity..."
if aws sts get-caller-identity > /dev/null 2>&1; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    echo -e "${GREEN}✓${NC} Connected to AWS Account: $AWS_ACCOUNT"
else
    echo -e "${RED}✗${NC} Cannot connect to AWS. Run 'aws configure' first."
    exit 1
fi
echo ""

#
# STEP 2: Check ECS Cluster
#
echo "🏗️  Step 2: Checking ECS cluster..."
if aws ecs describe-clusters --clusters $CLUSTER_NAME --query "clusters[0].status" --output text 2>/dev/null | grep -q "ACTIVE"; then
    echo -e "${GREEN}✓${NC} Cluster '$CLUSTER_NAME' is ACTIVE"
    
    # Get cluster details
    TASK_COUNT=$(aws ecs describe-clusters --clusters $CLUSTER_NAME --query "clusters[0].registeredContainerInstancesCount" --output text)
    ACTIVE_SERVICES=$(aws ecs describe-clusters --clusters $CLUSTER_NAME --query "clusters[0].activeServicesCount" --output text)
    echo "   Tasks: $TASK_COUNT registered"
    echo "   Services: $ACTIVE_SERVICES active"
else
    echo -e "${RED}✗${NC} Cluster '$CLUSTER_NAME' not found or not active"
    echo ""
    echo "Available clusters:"
    aws ecs list-clusters --output table
    echo ""
    echo -e "${YELLOW}ACTION REQUIRED:${NC} Deploy infrastructure first:"
    echo "  ./scripts/deploy-infrastructure.sh prod your-email@example.com"
    exit 1
fi
echo ""

#
# STEP 3: Check ECS Service
#
echo "🚀 Step 3: Checking ECS service..."
if aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query "services[0].status" --output text 2>/dev/null | grep -q "ACTIVE"; then
    RUNNING=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query "services[0].runningCount" --output text)
    DESIRED=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query "services[0].desiredCount" --output text)
    
    if [ "$RUNNING" -eq "$DESIRED" ] && [ "$RUNNING" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} Service '$SERVICE_NAME' is healthy"
        echo "   Running: $RUNNING / Desired: $DESIRED"
    else
        echo -e "${YELLOW}⚠${NC} Service '$SERVICE_NAME' has issues"
        echo "   Running: $RUNNING / Desired: $DESIRED"
        echo ""
        echo "Recent service events:"
        aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query "services[0].events[0:3]" --output table
    fi
else
    echo -e "${RED}✗${NC} Service '$SERVICE_NAME' not found or not active"
    echo ""
    echo -e "${YELLOW}ACTION REQUIRED:${NC} Deploy application first:"
    echo "  ./scripts/deploy-ecs.sh"
    exit 1
fi
echo ""

#
# STEP 4: Check Running Tasks
#
echo "📦 Step 4: Checking running tasks..."
TASK_ARNS=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --desired-status RUNNING --query "taskArns" --output text)

if [ -z "$TASK_ARNS" ]; then
    echo -e "${RED}✗${NC} No running tasks found"
    echo ""
    echo "Checking stopped tasks for errors..."
    STOPPED_TASKS=$(aws ecs list-tasks --cluster $CLUSTER_NAME --desired-status STOPPED --max-items 3 --query "taskArns" --output text)
    
    if [ -n "$STOPPED_TASKS" ]; then
        for TASK_ARN in $STOPPED_TASKS; do
            echo ""
            echo "Task: $TASK_ARN"
            aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --query "tasks[0].[stoppedReason,stopCode,containers[?exitCode!=\`0\`]]" --output table
        done
    fi
    echo ""
    echo -e "${YELLOW}ACTION REQUIRED:${NC} Check logs and fix task definition:"
    echo "  aws logs tail $LOG_GROUP --follow"
    exit 1
else
    TASK_COUNT=$(echo $TASK_ARNS | wc -w)
    echo -e "${GREEN}✓${NC} Found $TASK_COUNT running task(s)"
    
    # Check container health
    for TASK_ARN in $TASK_ARNS; do
        echo ""
        echo "  Task: $(basename $TASK_ARN)"
        
        # Check all containers in task
        CONTAINERS=$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --query "tasks[0].containers[*].[name,lastStatus,healthStatus]" --output text)
        
        echo "$CONTAINERS" | while read NAME STATUS HEALTH; do
            if [ "$STATUS" = "RUNNING" ]; then
                echo -e "    ${GREEN}✓${NC} $NAME: $STATUS"
            else
                echo -e "    ${RED}✗${NC} $NAME: $STATUS"
            fi
        done
    done
fi
echo ""

#
# STEP 5: Check Load Balancer
#
echo "⚖️  Step 5: Checking load balancer..."
ALB_ARN=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?contains(LoadBalancerName, 'pardon')].LoadBalancerArn" --output text 2>/dev/null || echo "")

if [ -n "$ALB_ARN" ]; then
    ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].DNSName" --output text)
    ALB_STATE=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].State.Code" --output text)
    
    echo -e "${GREEN}✓${NC} Load balancer found"
    echo "   DNS: $ALB_DNS"
    echo "   State: $ALB_STATE"
    
    # Check target group health
    TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null || echo "")
    
    if [ -n "$TG_ARN" ]; then
        HEALTHY_COUNT=$(aws elbv2 describe-target-health --target-group-arn $TG_ARN --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" --output text)
        TOTAL_COUNT=$(aws elbv2 describe-target-health --target-group-arn $TG_ARN --query "length(TargetHealthDescriptions)" --output text)
        
        if [ "$HEALTHY_COUNT" -gt 0 ]; then
            echo -e "   ${GREEN}✓${NC} Healthy targets: $HEALTHY_COUNT / $TOTAL_COUNT"
        else
            echo -e "   ${RED}✗${NC} No healthy targets: $HEALTHY_COUNT / $TOTAL_COUNT"
            echo ""
            echo "   Target health details:"
            aws elbv2 describe-target-health --target-group-arn $TG_ARN --query "TargetHealthDescriptions[*].[Target.Id,TargetHealth.State,TargetHealth.Reason]" --output table
        fi
    fi
    
    # Test Coral Server health endpoint
    echo ""
    echo "   Testing Coral Server health..."
    if curl -sf --max-time 5 "http://${ALB_DNS}:5555/health" > /dev/null 2>&1; then
        echo -e "   ${GREEN}✓${NC} Coral Server is responding"
    else
        echo -e "   ${RED}✗${NC} Coral Server not responding at http://${ALB_DNS}:5555/health"
    fi
else
    echo -e "${YELLOW}⚠${NC} No load balancer found (may not be needed for development)"
fi
echo ""

#
# STEP 6: Check Coral Server Sessions (CRITICAL)
#
echo "🧠 Step 6: Checking Coral Server sessions..."

# Try to get Coral Server URL
if [ -n "$ALB_DNS" ]; then
    CORAL_URL="http://${ALB_DNS}:5555"
elif [ -n "$CORAL_SERVER_URL" ]; then
    CORAL_URL="$CORAL_SERVER_URL"
else
    echo -e "${YELLOW}⚠${NC} Cannot determine Coral Server URL. Skipping session check."
    echo "   Set CORAL_SERVER_URL environment variable or ensure ALB exists."
    echo ""
    CORAL_URL=""
fi

if [ -n "$CORAL_URL" ]; then
    echo "   Checking sessions at: $CORAL_URL/api/v1/sessions"
    
    SESSIONS=$(curl -sf --max-time 5 "$CORAL_URL/api/v1/sessions" 2>/dev/null || echo "[]")
    
    if [ "$SESSIONS" = "[]" ] || [ -z "$SESSIONS" ]; then
        echo -e "   ${RED}✗${NC} No sessions found!"
        echo ""
        echo -e "   ${YELLOW}CRITICAL ISSUE:${NC} Agents are not connecting to Coral Server"
        echo "   Expected: [\"production-main\"]"
        echo "   Got: $SESSIONS"
        echo ""
        echo "   Possible causes:"
        echo "   1. Agents not started (check container logs)"
        echo "   2. CORAL_SSE_URL environment variable not set correctly"
        echo "   3. Agents cannot reach Coral Server"
        echo ""
        echo "   Next steps:"
        echo "   - Check agent logs: aws logs tail $LOG_GROUP --follow --filter-pattern 'agent-cz'"
        echo "   - Verify CORAL_SSE_URL ends with '/production-main' in task definition"
        echo "   - Restart ECS service: aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force-new-deployment"
    else
        # Check for production-main session (new simplified architecture)
        if echo "$SESSIONS" | grep -q "production-main"; then
            echo -e "   ${GREEN}✓${NC} Production session is available"
            echo "   Sessions: $SESSIONS"
            echo "   Architecture: Single session (simplified, stable)"
        else
            # Legacy check for pool-based architecture
            POOL_COUNT=$(echo $SESSIONS | grep -o 'pool-' | wc -l)
            if [ "$POOL_COUNT" -gt 0 ]; then
                echo -e "   ${YELLOW}⚠${NC} Found $POOL_COUNT pool session(s)"
                echo "   Sessions: $SESSIONS"
                echo "   Note: Legacy multi-pool architecture detected"
                echo "   Consider upgrading to single-session architecture"
            else
                echo -e "   ${YELLOW}⚠${NC} Unexpected session configuration"
                echo "   Sessions: $SESSIONS"
            fi
        fi
    fi
fi
echo ""

#
# STEP 7: Check Recent Logs
#
echo "📜 Step 7: Checking recent logs for errors..."
RECENT_ERRORS=$(aws logs filter-log-events \
    --log-group-name $LOG_GROUP \
    --start-time $(($(date +%s) - 300))000 \
    --filter-pattern "ERROR" \
    --max-items 5 \
    --query "events[*].message" \
    --output text 2>/dev/null || echo "")

if [ -n "$RECENT_ERRORS" ]; then
    echo -e "${YELLOW}⚠${NC} Found recent errors:"
    echo "$RECENT_ERRORS" | head -n 10
    echo ""
    echo "   View full logs: aws logs tail $LOG_GROUP --follow"
else
    echo -e "${GREEN}✓${NC} No recent errors found"
fi
echo ""

#
# STEP 8: Check Environment Variables
#
echo "🔧 Step 8: Checking critical environment variables..."
TASK_DEF_ARN=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query "services[0].taskDefinition" --output text 2>/dev/null || echo "")

if [ -n "$TASK_DEF_ARN" ]; then
    echo "   Task Definition: $TASK_DEF_ARN"
    
    # Check CZ agent config as sample
    CZ_ENV=$(aws ecs describe-task-definition --task-definition $TASK_DEF_ARN --query "taskDefinition.containerDefinitions[?name=='agent-cz'].environment" --output json 2>/dev/null || echo "[]")
    
    # Check for new single-session architecture (preferred)
    if echo "$CZ_ENV" | grep -q "CORAL_SSE_URL"; then
        CORAL_SSE_URL_VALUE=$(echo "$CZ_ENV" | jq -r '.[][] | select(.name=="CORAL_SSE_URL") | .value' 2>/dev/null || echo "")
        
        if echo "$CORAL_SSE_URL_VALUE" | grep -q "/production-main"; then
            echo -e "   ${GREEN}✓${NC} Single-session architecture configured"
            echo "   CORAL_SSE_URL: $CORAL_SSE_URL_VALUE"
        elif echo "$CZ_ENV" | grep -q "CORAL_SESSIONS"; then
            # Legacy multi-pool architecture
            CORAL_SESSIONS_VALUE=$(echo "$CZ_ENV" | jq -r '.[][] | select(.name=="CORAL_SESSIONS") | .value' 2>/dev/null || echo "")
            echo -e "   ${YELLOW}⚠${NC} Legacy multi-pool architecture detected"
            echo "   CORAL_SESSIONS: $CORAL_SESSIONS_VALUE"
            echo "   CORAL_SSE_URL: $CORAL_SSE_URL_VALUE"
            echo ""
            echo "   Consider upgrading to single-session architecture:"
            echo "   - Remove CORAL_SESSIONS variable"
            echo "   - Set CORAL_SSE_URL to: http://localhost:5555/sse/v1/devmode/app/priv/production-main"
        else
            echo -e "   ${YELLOW}⚠${NC} CORAL_SSE_URL format doesn't match expected pattern"
            echo "   Current: $CORAL_SSE_URL_VALUE"
            echo "   Expected: .../production-main (for single-session) or check CORAL_SESSIONS"
        fi
    else
        echo -e "   ${RED}✗${NC} CORAL_SSE_URL not found in agent-cz configuration"
        echo ""
        echo -e "   ${YELLOW}ACTION REQUIRED:${NC} Add CORAL_SSE_URL to task definition"
    fi
else
    echo -e "   ${YELLOW}⚠${NC} Could not retrieve task definition"
fi
echo ""

#
# SUMMARY
#
echo "=================================="
echo "📊 Diagnostic Summary"
echo "=================================="
echo ""

if [ "$RUNNING" -gt 0 ] && (echo "$SESSIONS" | grep -q "production-main" || [ "$POOL_COUNT" -ge 5 ]); then
    echo -e "${GREEN}✓ System appears healthy${NC}"
    echo ""
    echo "All agents should be available for user conversations."
    echo ""
    echo "Test the system:"
    echo "  curl https://pardonsimulator.com/api/health/coral"
else
    echo -e "${RED}✗ System has issues preventing agent availability${NC}"
    echo ""
    echo "Users CANNOT chat with agents until this is fixed."
    echo ""
    echo "Priority actions:"
    if [ "$RUNNING" -eq 0 ]; then
        echo "  1. Fix ECS service (no running tasks)"
        echo "     - Check CloudWatch logs for startup errors"
        echo "     - Verify task definition is valid"
    fi
    if ! echo "$SESSIONS" | grep -q "production-main" && [ "$POOL_COUNT" -lt 1 ]; then
        echo "  1. Fix agent connections (sessions not created)"
        echo "     - Check agent logs for connection errors"
        echo "     - Verify CORAL_SSE_URL environment variable"
        echo "     - Ensure URL ends with session ID (e.g., /production-main)"
        echo "     - Restart ECS service if needed"
    fi
fi
echo ""

echo "Useful commands:"
echo "  - View logs:      aws logs tail $LOG_GROUP --follow"
echo "  - Restart service: aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force-new-deployment"
echo "  - Check sessions: curl $CORAL_URL/api/v1/sessions"
echo ""
echo "For detailed analysis, see: AGENT_AVAILABILITY_ANALYSIS.md"
echo ""

