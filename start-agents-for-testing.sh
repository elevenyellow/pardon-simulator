#!/bin/bash
# Helper script to start all agents for testing
# Platform-agnostic: automatically handles x86_64/ARM64 architecture differences

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ensure CORAL_SESSION_ID is set
if [ -z "$CORAL_SESSION_ID" ]; then
    echo -e "${RED}ERROR: CORAL_SESSION_ID not set!${NC}"
    exit 1
fi

echo -e "${GREEN}Starting all agents for session: $CORAL_SESSION_ID${NC}"

# Detect current runtime architecture
CURRENT_ARCH=$(python3 -c "import platform; print(platform.machine())")
echo -e "${BLUE}Runtime architecture: $CURRENT_ARCH${NC}"

# Check if venvs actually work by trying to import a package
# This tests actual package compatibility, not just Python binary architecture
if [ -f "agents/cz/.venv/bin/python" ]; then
    echo -e "${BLUE}Testing venv package compatibility...${NC}"
    TEST_RESULT=$(agents/cz/.venv/bin/python -c "import pydantic_core; print('OK')" 2>&1)
    
    if [[ "$TEST_RESULT" == *"incompatible architecture"* ]]; then
        echo -e "${YELLOW}⚠️  Venv packages incompatible with current runtime${NC}"
        echo -e "${YELLOW}   (This happens when venvs built in different architecture context)${NC}"
        echo -e "${YELLOW}   Auto-rebuilding venvs for $CURRENT_ARCH (takes 2-3 minutes)...${NC}"
        echo ""
        ./rebuild-agent-venvs.sh
        echo ""
        echo -e "${GREEN}✓ Venvs rebuilt successfully and tested${NC}"
    elif [[ "$TEST_RESULT" == "OK" ]]; then
        echo -e "${GREEN}✓ Venv packages compatible with $CURRENT_ARCH runtime${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not verify venv compatibility, rebuilding to be safe...${NC}"
        ./rebuild-agent-venvs.sh
        echo -e "${GREEN}✓ Venvs rebuilt${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No venvs found, building for first time...${NC}"
    ./rebuild-agent-venvs.sh
    echo -e "${GREEN}✓ Venvs created${NC}"
fi

# Function to start an agent
start_agent() {
    local agent_name=$1
    local agent_dir="agents/$agent_name"
    
    if [ ! -d "$agent_dir" ]; then
        echo -e "${RED}ERROR: Agent directory not found: $agent_dir${NC}"
        return 1
    fi
    
    echo -e "${BLUE}Starting $agent_name...${NC}"
    
    # Use agent-specific venv (each agent has its own)
    if [ -f "$agent_dir/.venv/bin/python" ]; then
        PYTHON_EXEC="$agent_dir/.venv/bin/python"
    elif [ -f "$agent_dir/.venv/bin/python3" ]; then
        PYTHON_EXEC="$agent_dir/.venv/bin/python3"
    elif [ -f ".venv/bin/python" ]; then
        # Fallback to root venv
        PYTHON_EXEC=".venv/bin/python"
    else
        echo -e "${RED}ERROR: No virtual environment found for $agent_name${NC}"
        echo -e "${YELLOW}Run ./rebuild-agent-venvs.sh to create venvs${NC}"
        return 1
    fi
    
    # Venv architecture should now match (auto-rebuilt above if needed)
    # No per-agent check needed
    
    # Start agent in background with output redirected to log
    cd "$agent_dir"
    ../../$PYTHON_EXEC main.py > "../../logs/${agent_name}.log" 2>&1 &
    local pid=$!
    cd ../..
    
    echo -e "${GREEN}✓ $agent_name started (PID: $pid)${NC}"
    sleep 0.5
}

# Create logs directory
mkdir -p logs

# Start all agents
echo -e "${YELLOW}Starting agents...${NC}"
start_agent "cz"
start_agent "sbf"
start_agent "trump-donald"
start_agent "trump-melania"
start_agent "trump-eric"
start_agent "trump-donjr"
start_agent "trump-barron"

echo -e "${GREEN}✓ All 7 agents started!${NC}"
echo -e "${BLUE}Check logs in: logs/*.log${NC}"
echo -e "${YELLOW}Monitor with: tail -f logs/*.log${NC}"

# Wait for all agents to initialize and connect to Coral
echo -e "${BLUE}Waiting for agents to connect to Coral Server...${NC}"
echo -e "${YELLOW}This may take 30-60s (or 2-3 minutes if venvs were rebuilt)${NC}"
sleep 10

echo -e "${GREEN}✓ Agents startup initiated${NC}"
echo -e "${YELLOW}💡 Use wait-for-agents.sh to verify all agents are registered${NC}"

