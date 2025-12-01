#!/usr/bin/env bash
# start-dev.sh - Opens split panes: 2 on top (Coral + Website), 1 below (Agents)

PROJECT_DIR=$(pwd)

if command -v osascript &> /dev/null; then
  osascript <<EOF
    tell application "iTerm"
      tell current window
        tell current session
          -- Top-left: Coral Server
          write text "cd '$PROJECT_DIR' && echo '🖥️  CORAL SERVER' && echo '' && ./start-server.sh"
          
          -- Split horizontally to create top-right pane
          set websitePane to (split horizontally with default profile)
          
          -- Split vertically to create bottom pane (full width under coral server)
          set agentsPane to (split vertically with default profile)
        end tell
        
        -- Configure website pane (the right pane created first)
        tell websitePane
          delay 0.5
          write text "cd '$PROJECT_DIR' && echo '🌐 WEBSITE' && echo 'Waiting for agents...' && sleep 25 && ./start-website.sh"
        end tell
        
        -- Configure agents pane (the bottom pane created second)
        tell agentsPane
          write text "cd '$PROJECT_DIR' && echo '🤖 AGENTS' && echo 'Waiting for Coral Server...' && sleep 15 && export CORAL_SESSION_ID='dev' && ./start-agents-for-testing.sh"
        end tell
      end tell
    end tell
EOF
  
  echo ""
  echo "✅ Development environment starting in current iTerm2 window!"
  echo ""
  echo "Layout:"
  echo "  ┌────────────────┬────────────────┐"
  echo "  │ Coral Server   │    Website     │"
  echo "  ├────────────────┴────────────────┤"
  echo "  │           Agents                │"
  echo "  └─────────────────────────────────┘"
  echo ""
  echo "Services will start in this order:"
  echo "  1. Coral Server (immediate)"
  echo "  2. Agents (after 15s)"
  echo "  3. Website (after 25s)"
  echo ""
  
else
  echo "❌ This script requires iTerm2 on macOS"
  echo ""
  echo "Please start services manually in separate terminals:"
  echo "  Terminal 1: ./start-server.sh"
  echo "  Terminal 2: export CORAL_SESSION_ID='dev' && ./start-agents-for-testing.sh"
  echo "  Terminal 3: ./start-website.sh"
fi
