#!/usr/bin/env bash
# Platform-agnostic script to rebuild all agent virtual environments
# Automatically detects and matches the current runtime architecture

set -e

echo "🔨 Rebuilding agent virtual environments..."
echo ""

# Detect current runtime architecture (what Python actually runs as)
RUNTIME_ARCH=$(python3 -c "import platform; print(platform.machine())")
echo "🔍 Detected runtime architecture: $RUNTIME_ARCH"

# Force x86_64 to match Java architecture
if [[ "$OSTYPE" == "darwin"* ]]; then
    SYSTEM_ARCH=$(uname -m)
    if [[ "$SYSTEM_ARCH" == "arm64" ]]; then
        echo "⚠️  Using x86_64 Python to match Java architecture"
        # Use x86_64 Python from Homebrew
        if [ -f "/usr/local/opt/python@3.11/bin/python3.11" ]; then
            export PYTHON_CMD="/usr/local/opt/python@3.11/bin/python3.11"
        else
            echo "❌ ERROR: x86_64 Python 3.11 not found. Install with: arch -x86_64 brew install python@3.11"
            exit 1
        fi
    else
        export PYTHON_CMD="python3"
    fi
else
    export PYTHON_CMD="python3"
fi

echo "📦 Using Python: $PYTHON_CMD"
$PYTHON_CMD --version
echo "✓ Python will install packages for: $($PYTHON_CMD -c 'import platform; print(platform.machine())')"
echo ""

# Clean up any existing venvs to avoid architecture conflicts
echo "🗑️  Removing existing virtual environments..."
for agent_dir in agents/trump-donald agents/trump-melania agents/trump-eric agents/trump-donjr agents/trump-barron agents/cz agents/sbf; do
    if [ -d "$agent_dir/.venv" ]; then
        rm -rf "$agent_dir/.venv"
        echo "   Removed $agent_dir/.venv"
    fi
done
echo ""

AGENTS=("trump-donald" "trump-melania" "trump-eric" "trump-donjr" "trump-barron" "cz" "sbf")

for agent in "${AGENTS[@]}"; do
    echo "📦 Setting up $agent..."
    cd "agents/$agent"
    
    # Create venv with correct architecture
    $PYTHON_CMD -m venv .venv
    source .venv/bin/activate
    
    # Verify architecture
    VENV_ARCH=$(python -c "import platform; print(platform.machine())")
    echo "   Architecture: $VENV_ARCH"
    
    # Upgrade pip
    pip install --quiet --upgrade pip wheel setuptools
    
    # Install dependencies with --force-reinstall and --no-binary for critical packages
    echo "   Installing dependencies..."
    pip install --quiet --no-cache-dir --force-reinstall \
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
    echo "   ✅ $agent venv ready ($VENV_ARCH)"
    echo ""
    cd ../..
done

echo "✅ All agent virtual environments rebuilt successfully!"

