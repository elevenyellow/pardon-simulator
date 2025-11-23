#!/bin/bash

# Ultimate Pardon Simulator Test Suite Runner
# Starts EVERYTHING needed for testing in one command
# Uses tmux for multi-pane management

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SESSION_NAME="pardon-test"
CORAL_SESSION_ID="${CORAL_SESSION_ID:-test-session-fixed}"
export CORAL_SESSION_ID

# Banner
echo -e "${MAGENTA}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     🏛️  PARDON SIMULATOR - FULL TEST SUITE LAUNCHER 🏛️      ║
║                                                              ║
║  This script starts EVERYTHING you need for testing:        ║
║  • Coral Server                                              ║
║  • All 7 Agents                                              ║
║  • Next.js Website                                           ║
║  • Automated Tests (optional)                                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check if tmux is installed
if ! command -v tmux &> /dev/null; then
    echo -e "${RED}ERROR: tmux is not installed${NC}"
    echo -e "${YELLOW}Install with:${NC}"
    echo -e "  macOS:   ${CYAN}brew install tmux${NC}"
    echo -e "  Ubuntu:  ${CYAN}sudo apt-get install tmux${NC}"
    echo -e "  Fedora:  ${CYAN}sudo dnf install tmux${NC}"
    exit 1
fi

# Check if we're already in the project root
if [ ! -d "agents" ] || [ ! -d "website" ] || [ ! -d "coral-server" ]; then
    echo -e "${RED}ERROR: Must run from project root${NC}"
    echo -e "${YELLOW}Expected directories: agents/, website/, coral-server/${NC}"
    exit 1
fi

# Check for architecture mismatch and auto-fix
echo -e "${BLUE}Checking agent virtual environments...${NC}"
RUNTIME_ARCH=$(python3 -c "import platform; print(platform.machine())")
if [ -f "agents/cz/.venv/bin/python" ]; then
    VENV_ARCH=$(agents/cz/.venv/bin/python -c "import platform; print(platform.machine())" 2>/dev/null || echo "unknown")
    if [ "$VENV_ARCH" != "$RUNTIME_ARCH" ] && [ "$VENV_ARCH" != "unknown" ]; then
        echo -e "${YELLOW}⚠️  Architecture mismatch detected:${NC}"
        echo -e "${YELLOW}   Runtime: $RUNTIME_ARCH, Venvs: $VENV_ARCH${NC}"
        echo -e "${YELLOW}   Automatically rebuilding venvs for $RUNTIME_ARCH...${NC}"
        ./rebuild-agent-venvs.sh
        echo -e "${GREEN}✓ Venvs rebuilt successfully${NC}"
        echo ""
    fi
fi

# Check Java version (Coral Server requires Java 21)
echo -e "${BLUE}Checking Java version...${NC}"
if command -v java &> /dev/null; then
    java_version=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
    
    # Check if Java 21 is available (even if not default)
    java21_available=false
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - check with java_home
        if /usr/libexec/java_home -v 21 &> /dev/null; then
            java21_available=true
            export JAVA_HOME=$(/usr/libexec/java_home -v 21)
        fi
    fi
    
    if [ "$java_version" == "21" ]; then
        echo -e "${GREEN}✓ Java 21 (default)${NC}"
    elif [ "$java21_available" == true ]; then
        echo -e "${GREEN}✓ Java 21 found (set as JAVA_HOME for this session)${NC}"
        echo -e "${BLUE}  (Default is Java ${java_version}, but using Java 21 for Coral Server)${NC}"
    else
        # Java 21 not available, but newer Java might work
        if [ "$java_version" -gt 21 ]; then
            echo -e "${YELLOW}⚠️  Java ${java_version} detected (Coral Server prefers Java 21)${NC}"
            echo -e "${BLUE}Note: Newer Java versions may work, but Java 21 is recommended${NC}"
            echo -e "${BLUE}If Coral Server fails to start, install Java 21:${NC}"
            echo -e "  ${CYAN}brew install openjdk@21${NC}"
            echo -e ""
            echo -e "${GREEN}Continuing... (press Ctrl+C to cancel, or wait 3s)${NC}"
            sleep 3
        else
            echo -e "${RED}ERROR: Java ${java_version} too old (need Java 21+)${NC}"
            echo -e "Install Java 21: ${CYAN}brew install openjdk@21${NC}"
            exit 1
        fi
    fi
else
    echo -e "${RED}ERROR: Java not found${NC}"
    echo -e "${YELLOW}Install Java 21:${NC}"
    echo -e "  macOS:   ${CYAN}brew install openjdk@21${NC}"
    echo -e "  Ubuntu:  ${CYAN}sudo apt install openjdk-21-jdk${NC}"
    exit 1
fi

# ✅ CRITICAL FIX: Always kill orphaned agent processes to prevent duplicate registrations
echo -e "${YELLOW}🧹 Cleaning up any orphaned agent processes...${NC}"
pkill -9 -f "python.*agents/.*/main.py" 2>/dev/null || true

# Automatically kill existing test session (no prompt)
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${YELLOW}Existing test session found - automatically killing...${NC}"
    tmux kill-session -t "$SESSION_NAME"
    # Kill agents again with force
    pkill -9 -f "python.*agents/.*/main.py" 2>/dev/null || true
fi

sleep 2

# Ask which test suite to run
echo -e "\n${BLUE}Test Suite Selection:${NC}"
echo -e "  ${YELLOW}1)${NC} Quick Suite    (9 tests,  ~6 min)   - Original bulk-agent-test"
echo -e "  ${YELLOW}2)${NC} Extended Suite (33 tests, ~34 min)  - NEW comprehensive tests"
echo -e "  ${YELLOW}3)${NC} Full Suite     (42 tests, ~40 min)  - Both quick + extended"
echo -e "  ${YELLOW}4)${NC} Integration    (All integration tests + E2E)"
read -p "Choice (1/2/3/4) [default: 1]: " test_suite
test_suite=${test_suite:-1}

# Ask if user wants to auto-run tests
echo -e "\n${BLUE}Test Automation Options:${NC}"
echo -e "  1) Start services only (manual testing)"
echo -e "  2) Start services + auto-run tests after 30s"
echo -e "  3) Start services + wait for input + run tests"
read -p "Choice (1/2/3) [default: 1]: " auto_test
auto_test=${auto_test:-1}

# Set the test command based on suite selection
# Using :live versions for real-time progress output
case $test_suite in
    1)
        TEST_CMD="npm run test:live:quick"
        TEST_NAME="Quick Suite (9 tests)"
        TEST_WAIT=30
        ;;
    2)
        TEST_CMD="npm run test:live:extended"
        TEST_NAME="Extended Suite (33 tests)"
        TEST_WAIT=30
        ;;
    3)
        TEST_CMD="npm run test:live:comprehensive"
        TEST_NAME="Full Suite (42 tests)"
        TEST_WAIT=30
        ;;
    4)
        TEST_CMD="npm run test:all"
        TEST_NAME="All Tests (Integration + E2E)"
        TEST_WAIT=30
        ;;
esac

echo -e "\n${GREEN}Starting test environment...${NC}"

# Create logs directory
mkdir -p logs

# Create the tmux session with multiple panes
tmux new-session -d -s "$SESSION_NAME" -n "testing"

# Create the layout:
# +------------------+------------------+
# |                  |                  |
# |  Coral Server    |    Agents        |
# |                  |                  |
# +------------------+------------------+
# |                  |                  |
# |    Website       |    Tests         |
# |                  |                  |
# +------------------+------------------+

# Split into 4 panes
tmux split-window -h -t "$SESSION_NAME"      # Split horizontally (right)
tmux split-window -v -t "$SESSION_NAME:0.0"  # Split left pane vertically
tmux split-window -v -t "$SESSION_NAME:0.2"  # Split right pane vertically

# Pane 0 (top-left): Coral Server
tmux send-keys -t "$SESSION_NAME:0.0" "echo -e '${CYAN}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo -e '${CYAN}    🌐 CORAL SERVER${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo -e '${CYAN}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "cd coral-server" C-m
# Set JAVA_HOME if we found Java 21
if [ -n "$JAVA_HOME" ]; then
    tmux send-keys -t "$SESSION_NAME:0.0" "export JAVA_HOME='$JAVA_HOME'" C-m
    tmux send-keys -t "$SESSION_NAME:0.0" "echo 'Using Java: \$(java -version 2>&1 | head -n1)'" C-m
fi
tmux send-keys -t "$SESSION_NAME:0.0" "echo 'Starting Coral Server...' && sleep 2" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "./gradlew run --warning-mode none" C-m

# Pane 1 (bottom-left): Website
tmux send-keys -t "$SESSION_NAME:0.1" "echo -e '${MAGENTA}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "echo -e '${MAGENTA}    🌐 NEXT.JS WEBSITE${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "echo -e '${MAGENTA}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "cd website" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "echo 'Waiting for Coral Server (5s)...' && sleep 5" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "npm run dev" C-m

# Pane 2 (top-right): All Agents
tmux send-keys -t "$SESSION_NAME:0.2" "echo -e '${GREEN}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "echo -e '${GREEN}    🤖 ALL AGENTS${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "echo -e '${GREEN}    Session: ${CORAL_SESSION_ID}${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "echo -e '${GREEN}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "export CORAL_SESSION_ID='$CORAL_SESSION_ID'" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "echo 'Waiting for Coral Server (25s)...'" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "sleep 25" C-m
# Use the helper script to start all agents cleanly
tmux send-keys -t "$SESSION_NAME:0.2" "./start-agents-for-testing.sh" C-m

# Pane 3 (bottom-right): Tests
tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${BLUE}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${BLUE}    🧪 TEST RUNNER${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${BLUE}═══════════════════════════════════${NC}'" C-m
tmux send-keys -t "$SESSION_NAME:0.3" "cd website" C-m

case $auto_test in
    1)
        # Manual testing mode
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${YELLOW}Manual Testing Mode${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${MAGENTA}Selected: $TEST_NAME${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${BLUE}Services are starting...${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo ''" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${GREEN}When ready, verify agents then run tests:${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '  ${CYAN}../wait-for-agents.sh $CORAL_SESSION_ID 7 60${NC}  (wait up to 60s)'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo ''" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${GREEN}Then run your desired test suite:${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '  ${CYAN}npm run test:quick${NC}          (9 tests, ~6 min)'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '  ${CYAN}npm run test:extended${NC}       (33 tests, ~34 min)'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '  ${CYAN}npm run test:comprehensive${NC}  (42 tests, ~40 min)'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '  ${CYAN}npm run test:e2e${NC}            (E2E tests)'" C-m
        ;;
    2)
        # Auto-run after waiting for agents
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${YELLOW}Auto-Test Mode${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${MAGENTA}Running: $TEST_NAME${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo ''" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${BLUE}Waiting for Coral Server and agents...${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "sleep 15" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "../wait-for-agents.sh $CORAL_SESSION_ID 7 90" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${GREEN}All agents ready! Starting tests...${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "sleep 3" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "$TEST_CMD" C-m
        ;;
    3)
        # Wait for user input
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${YELLOW}Interactive Mode${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${MAGENTA}Will run: $TEST_NAME${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo ''" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${BLUE}Waiting for agents to register...${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "sleep 15" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "../wait-for-agents.sh $CORAL_SESSION_ID 7 180" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "echo -e '${GREEN}Agents ready!${NC}'" C-m
        tmux send-keys -t "$SESSION_NAME:0.3" "read -p 'Press Enter to start tests...' && $TEST_CMD" C-m
        ;;
esac

# Create a control script for this session
cat > /tmp/pardon-test-control.sh << 'CONTROL_EOF'
#!/bin/bash
SESSION_NAME="pardon-test"

case "${1:-help}" in
    attach|a)
        tmux attach-session -t "$SESSION_NAME"
        ;;
    stop|kill|k)
        echo "Stopping all services..."
        tmux kill-session -t "$SESSION_NAME"
        # Also kill any agent processes
        pkill -f "python.*agents/.*/main.py" 2>/dev/null || true
        echo "✓ All services stopped"
        ;;
    logs|l)
        tail -f logs/*.log
        ;;
    status|s)
        if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
            echo "✓ Test session is running"
            echo "Panes:"
            tmux list-panes -t "$SESSION_NAME" -F "#{pane_index}: #{pane_current_command}"
        else
            echo "✗ Test session is not running"
        fi
        ;;
    *)
        echo "Pardon Simulator Test Control"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  attach (a)  - Attach to the test session"
        echo "  stop (k)    - Stop all services and kill session"
        echo "  logs (l)    - Tail all agent logs"
        echo "  status (s)  - Check if session is running"
        ;;
esac
CONTROL_EOF
chmod +x /tmp/pardon-test-control.sh

# Print success message
clear
echo -e "${GREEN}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              ✅  TEST ENVIRONMENT STARTED! ✅                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${BLUE}📊 Tmux Session Layout:${NC}"
echo -e "${CYAN}  ┌─────────────────┬─────────────────┐${NC}"
echo -e "${CYAN}  │  Coral Server   │   All Agents    │${NC}"
echo -e "${CYAN}  ├─────────────────┼─────────────────┤${NC}"
echo -e "${CYAN}  │  Next.js Site   │  Test Runner    │${NC}"
echo -e "${CYAN}  └─────────────────┴─────────────────┘${NC}"

echo -e "\n${GREEN}🎮 Control Commands:${NC}"
echo -e "  ${YELLOW}Attach to session:${NC}  ${CYAN}tmux attach -t $SESSION_NAME${NC}"
echo -e "  ${YELLOW}Or use helper:${NC}      ${CYAN}/tmp/pardon-test-control.sh attach${NC}"

echo -e "\n${BLUE}🔧 Quick Commands:${NC}"
echo -e "  ${YELLOW}View logs:${NC}          ${CYAN}/tmp/pardon-test-control.sh logs${NC}"
echo -e "  ${YELLOW}Check status:${NC}       ${CYAN}/tmp/pardon-test-control.sh status${NC}"
echo -e "  ${YELLOW}Stop everything:${NC}    ${CYAN}/tmp/pardon-test-control.sh stop${NC}"

echo -e "\n${MAGENTA}📊 After Tests Complete:${NC}"
echo -e "  ${YELLOW}Generate JSON report:${NC} ${CYAN}cd website && npm run test:report${NC}"

echo -e "\n${MAGENTA}⌨️  Tmux Keyboard Shortcuts (once attached):${NC}"
echo -e "  ${CYAN}Ctrl+B, arrow keys${NC}  - Switch between panes"
echo -e "  ${CYAN}Ctrl+B, d${NC}           - Detach (keeps running)"
echo -e "  ${CYAN}Ctrl+B, [${NC}           - Scroll mode (q to exit)"
echo -e "  ${CYAN}Ctrl+B, z${NC}           - Zoom current pane"
echo -e "  ${CYAN}Ctrl+C${NC}              - Stop current pane's process"

echo -e "\n${YELLOW}⏰ Timeline:${NC}"
echo -e "  ${BLUE}Now:${NC}      Coral Server starting"
echo -e "  ${BLUE}+5s:${NC}     Website starting"
echo -e "  ${BLUE}+10s:${NC}    Coral Server ready"
echo -e "  ${BLUE}+25s:${NC}    Agents starting"
echo -e "  ${BLUE}+40s:${NC}    Checking for all 7 agents..."
echo -e "  ${BLUE}~70s:${NC}    Tests will begin (or longer if venvs rebuilding)"

echo -e "\n${MAGENTA}📊 Test Suite: $TEST_NAME${NC}"

if [ "$auto_test" == "2" ]; then
    echo -e "${GREEN}🤖 Tests will auto-run after agents register (wait shown in test pane)${NC}"
elif [ "$auto_test" == "3" ]; then
    echo -e "${YELLOW}🤖 Press Enter in test pane after agents finish registering${NC}"
fi

echo -e "\n${GREEN}✨ Attaching to session in 3 seconds...${NC}"
sleep 3

# Attach to the session
tmux attach-session -t "$SESSION_NAME"

# This runs after detaching or session ends
echo -e "${YELLOW}Session detached. Services still running in background.${NC}"
echo -e "${BLUE}Reattach with: ${CYAN}tmux attach -t $SESSION_NAME${NC}"
echo -e "${BLUE}Stop all with: ${CYAN}/tmp/pardon-test-control.sh stop${NC}"

