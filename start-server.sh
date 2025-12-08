#!/usr/bin/env bash

# Exit on error
set -e

# Set Java 21 as the active version (Gradle 8.10 doesn't support Java 25)
export JAVA_HOME="/usr/local/Cellar/openjdk@21/21.0.9/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

# Validate architecture compatibility
echo "🔍 Validating environment architecture..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    SYSTEM_ARCH=$(uname -m)
    JAVA_ARCH=$(file "$JAVA_HOME/bin/java" 2>/dev/null | grep -o "x86_64\|arm64" || echo "unknown")
    
    echo "   System: $SYSTEM_ARCH"
    echo "   Java: $JAVA_ARCH"
    
    # Check existing venvs match Java architecture  
    for agent_dir in agents/trump-donald agents/trump-melania agents/trump-eric agents/trump-donjr agents/trump-barron agents/cz agents/sbf; do
        if [ -d "$agent_dir/.venv" ]; then
            VENV_ARCH=$($agent_dir/.venv/bin/python -c "import platform; print(platform.machine())" 2>/dev/null || echo "unknown")
            if [[ "$VENV_ARCH" != "$JAVA_ARCH" ]] && [[ "$VENV_ARCH" != "unknown" ]] && [[ "$JAVA_ARCH" != "unknown" ]]; then
                echo ""
                echo "❌ ERROR: Architecture mismatch in $agent_dir/.venv"
                echo "   venv: $VENV_ARCH, Java: $JAVA_ARCH"
                echo "   Venvs must match Java architecture for agents to load properly"
                echo ""
                echo "🔧 Fix: Run ./rebuild-agent-venvs.sh to rebuild all venvs"
                exit 1
            fi
        fi
    done
    
    echo "   ✅ Architecture validation passed (venvs match Java: $JAVA_ARCH)"
    echo ""
fi

# Check if agent venvs exist, build them if not
echo "🔍 Checking agent virtual environments..."
VENVS_MISSING=false
for agent in agents/trump-donald agents/trump-melania agents/trump-eric agents/trump-donjr agents/trump-barron agents/cz agents/sbf; do
    if [ ! -d "$agent/.venv" ]; then
        echo "   Missing: $agent/.venv"
        VENVS_MISSING=true
    fi
done

if [ "$VENVS_MISSING" = true ]; then
    echo ""
    echo "🔨 Building missing virtual environments..."
    ./rebuild-agent-venvs.sh
    echo ""
else
    echo "   ✅ All agent venvs exist"
    echo ""
fi

echo "Using Java version:"
java -version
echo ""

# Initialize and update submodule if needed
if [ ! -d "coral-server/.git" ]; then
    echo "Initializing coral-server submodule..."
    git submodule init
    git submodule update
fi

# Change to coral-server directory
cd coral-server

# Stop any existing Gradle daemon first
echo "Stopping any existing Gradle daemons..."
./gradlew --stop > /dev/null 2>&1 || true

# Set JVM args for Java 21 compatibility
export GRADLE_OPTS="--add-opens=java.base/java.lang=ALL-UNNAMED --enable-native-access=ALL-UNNAMED"

# Set config path and run gradlew (production mode - matches ECS deployment)
echo "Starting Coral Server (production mode)..."
REGISTRY_FILE_PATH="/Users/al/apps/pardon-simulator/coral-server/src/main/resources/registry.toml" ./gradlew run

