#!/usr/bin/env bash
set -e

# Use python3 directly - universal binaries run natively in shell's architecture
PYTHON_CMD="python3"
VENV_PYTHON=".venv/bin/python"

echo "Using Python: $PYTHON_CMD"
$PYTHON_CMD --version
python3 -c "import platform; print(f'Running as: {platform.machine()}')" 2>/dev/null || true

# Install dependencies if not already installed
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv .venv
    
    source .venv/bin/activate
    
    echo "Upgrading pip and installing wheel..."
    pip install --upgrade pip wheel setuptools
    
    echo "Installing dependencies..."
    pip install --no-cache-dir langchain==0.3.25 langchain-community==0.3.24 langchain-core langchain-mcp-adapters==0.1.7 langchain-openai==0.3.26 python-dotenv solana solders base58 cdp-sdk aiohttp certifi requests
else
    source .venv/bin/activate
fi

echo "Starting Melania Trump agent..."
arch -arm64 $VENV_PYTHON -u "$@"

