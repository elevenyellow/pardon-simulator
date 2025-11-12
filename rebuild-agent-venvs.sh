#!/usr/bin/env bash
# Rebuild all agent virtual environments with correct architecture

set -e

echo "🔨 Rebuilding agent virtual environments..."
echo ""

# Detect system architecture
ARCH=$(uname -m)
echo "Current shell architecture: $ARCH"

# Use python3 directly - universal binaries will run natively
# in the shell's architecture without needing arch command
export PYTHON_CMD="python3"

echo "Using Python command: $PYTHON_CMD"
$PYTHON_CMD --version
python3 -c "import platform; print(f'Running as: {platform.machine()}')"
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

