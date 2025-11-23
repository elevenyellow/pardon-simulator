#!/bin/bash
# Wait for agents to start up and register with Coral Server
# Usage: ./wait-for-agents.sh <session-id> <required-agent-count> [wait-seconds]

set -e

SESSION_ID=${1:-test-session-fixed}
REQUIRED_AGENTS=${2:-7}
WAIT_TIME=${3:-60}  # Default 60 seconds
CORAL_URL=${CORAL_SERVER_URL:-http://localhost:5555}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}⏳ Waiting for agents to initialize...${NC}"
echo -e "${BLUE}   Session: $SESSION_ID${NC}"
echo -e "${BLUE}   Expected: $REQUIRED_AGENTS agents${NC}"
echo -e "${BLUE}   Wait time: ${WAIT_TIME}s${NC}"
echo ""

# First, verify Coral Server is running (with retries)
echo -ne "${YELLOW}Checking Coral Server...${NC}"
SERVER_READY=false
for i in {1..30}; do
    if curl -s "${CORAL_URL}/health" > /dev/null 2>&1; then
        SERVER_READY=true
        break
    fi
    sleep 1
done

if [ "$SERVER_READY" = true ]; then
    echo -e "\r${GREEN}✓ Coral Server is running${NC}                "
else
    echo -e "\r${RED}✗ Coral Server not responding after 30s${NC}"
    echo -e "${RED}Cannot reach: ${CORAL_URL}/health${NC}"
    exit 1
fi

# Check if session exists
echo -ne "${YELLOW}Checking session...${NC}"
sessions=$(curl -s "${CORAL_URL}/api/v1/sessions" 2>/dev/null || echo "[]")
if echo "$sessions" | grep -q "\"$SESSION_ID\""; then
    echo -e "\r${GREEN}✓ Session '$SESSION_ID' exists${NC}          "
else
    echo -e "\r${YELLOW}⚠ Session not yet created (agents will create it)${NC}"
fi
echo ""

# Wait for agents to connect and register
echo -e "${BLUE}Waiting for $REQUIRED_AGENTS agents to connect...${NC}"
AGENTS_READY=false
for i in $(seq 1 $WAIT_TIME); do
    # Check actual agent count from Coral Server
    agent_response=$(curl -s "${CORAL_URL}/api/v1/sessions/${SESSION_ID}/agents" 2>/dev/null || echo "{}")
    agent_count=$(echo "$agent_response" | grep -o '"agentCount":[0-9]*' | grep -o '[0-9]*')
    
    # Default to 0 if parsing failed
    agent_count=${agent_count:-0}
    
    pct=$((i * 100 / WAIT_TIME))
    bar_length=$((pct / 2))
    bar=$(printf "%${bar_length}s" | tr ' ' '█')
    space=$(printf "%$((50 - bar_length))s")
    
    echo -ne "\r${YELLOW}Progress: [${bar}${space}] ${pct}% - Agents: ${agent_count}/${REQUIRED_AGENTS} (${i}/${WAIT_TIME}s)${NC}"
    
    # Check if we have enough agents
    if [ "$agent_count" -ge "$REQUIRED_AGENTS" ]; then
        AGENTS_READY=true
        echo -ne "\r${GREEN}✓ All $REQUIRED_AGENTS agents connected!                                                  ${NC}"
        echo ""
        break
    fi
    
    sleep 1
done

echo ""
echo ""

if [ "$AGENTS_READY" = false ]; then
    echo -e "${RED}✗ Timeout: Only ${agent_count}/${REQUIRED_AGENTS} agents connected after ${WAIT_TIME}s${NC}"
    echo -e "${YELLOW}Tip: Check agent logs for connection issues: tail -f logs/*.log${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All agents registered with Coral Server!${NC}"
echo ""
echo -e "${BLUE}Checking agent logs for errors...${NC}"

# Check if agent log files exist and show any recent errors
if [ -d "logs" ]; then
    error_count=0
    for log in logs/*.log; do
        if [ -f "$log" ]; then
            agent_name=$(basename "$log" .log)
            # Check for common error patterns
            if tail -50 "$log" 2>/dev/null | grep -qi "error\|exception\|failed\|traceback"; then
                error_count=$((error_count + 1))
                echo -e "  ${RED}⚠${NC} $agent_name may have errors"
            else
                echo -e "  ${GREEN}✓${NC} $agent_name log looks ok"
            fi
        fi
    done
    
    if [ $error_count -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⚠ $error_count agent(s) may have errors. Check: tail -f logs/*.log${NC}"
    fi
else
    echo -e "  ${YELLOW}No logs/ directory found${NC}"
fi

echo ""
echo -e "${GREEN}✓ Ready to run tests!${NC}"
exit 0

