#!/usr/bin/env bash
# Platform-agnostic script to rebuild all agent virtual environments
# Automatically detects and matches the current runtime architecture

set -e

echo "🔨 Rebuilding agent virtual environments..."
echo ""

# Detect current runtime architecture (what Python actually runs as)
RUNTIME_ARCH=$(python3 -c "import platform; print(platform.machine())")
echo "🔍 Detected runtime architecture: $RUNTIME_ARCH"

# Use python3 directly - it will run in the architecture of the calling process
export PYTHON_CMD="python3"

echo "📦 Using Python: $PYTHON_CMD"
$PYTHON_CMD --version
echo "✓ Python will install packages for: $RUNTIME_ARCH"
echo ""

# Note for users
echo "ℹ️  If you're getting architecture mismatches:"
echo "   - Check if your terminal/tmux is running under Rosetta"
echo "   - Run: file \$(which tmux) or file \$(which python3)"
echo "   - All tools should match the same architecture"
echo ""

AGENTS=("trump-donald" "trump-melania" "trump-eric" "trump-donjr" "trump-barron" "cz" "sbf")

for agent in "${AGENTS[@]}"; do
    echo "📦 Setting up $agent..."
    cd "agents/$agent"
    
    # Create venv with correct architecture
    $PYTHON_CMD -m venv .venv
    source .venv/bin/activate
    
    # Verify architecture
    python -c "import platform; print(f'   Architecture: {platform.machine()}')"
    
    # Upgrade pip
    pip install --quiet --upgrade pip wheel setuptools
    
    # Install dependencies
    echo "   Installing dependencies..."
    pip install --quiet --no-cache-dir \
        langchain==0.3.25 \
        langchain-community==0.3.24 \
        langchain-core \
        langchain-mcp-adapters==0.1.7 \
        langchain-openai==0.3.26 \
        python-dotenv \
        solana \
        solders \
        base58 \
        cdp-sdk \
        aiohttp \
        certifi \
        requests
    
    deactivate
    echo "   ✅ $agent venv ready"
    echo ""
    cd ../..
done

echo "✅ All agent virtual environments rebuilt successfully!"

