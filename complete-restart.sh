#!/usr/bin/env bash

echo "🔄 COMPLETE SYSTEM RESTART"
echo "======================================"
echo ""

# Step 1: Kill all processes
echo "🛑 Step 1: Stopping all processes..."
pkill -f "trump-.*main.py" 2>/dev/null || true
pkill -f gradle 2>/dev/null || true
pkill -f coral-studio 2>/dev/null || true
sleep 3
echo "✅ All processes stopped"
echo ""

# Step 2: Clean venvs (inline)
echo "🧹 Step 2: Cleaning virtual environments..."
cd /Users/al/apps/pardon-simulator
for agent in agents/trump-donald agents/trump-melania agents/trump-eric agents/trump-donjr agents/trump-barron agents/cz agents/sbf; do
    if [ -d "$agent/.venv" ]; then
        echo "  Removing .venv for $(basename $agent)..."
        rm -rf "$agent/.venv"
    fi
done
echo "✅ Virtual environments cleaned"
echo ""

# Step 3: Rebuild virtual environments
echo "🔨 Step 3: Rebuilding virtual environments..."
./rebuild-agent-venvs.sh
echo "✅ Virtual environments rebuilt"
echo ""

# Step 4: Stop any Gradle daemons
echo "🛑 Step 4: Stopping Gradle daemons..."
cd coral-server
./gradlew --stop > /dev/null 2>&1 || true
cd ..
sleep 2
echo "✅ Gradle daemons stopped"
echo ""

# Step 5: Start Coral Server
echo "🚀 Step 5: Starting Coral Server..."
echo "======================================"
echo ""
echo "Server will start now. Watch for:"
echo "  ✅ Exactly 5 agents register (1→2→3→4→5)"
echo "  ✅ NO 'already connected' warnings"
echo "  ✅ Each agent shows 'Waiting for mentions'"
echo ""
echo "After server starts:"
echo "  1. Open http://localhost:3000 in browser"
echo "  2. Hard refresh (Cmd+Shift+R)"
echo "  3. Look for 'Create Thread' button - should be ENABLED"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "======================================"
echo ""

./start-server.sh

