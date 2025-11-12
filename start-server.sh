#!/usr/bin/env bash

# Exit on error
set -e

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

# Set Java 21 as the active version (Gradle 8.10 doesn't support Java 25)
export JAVA_HOME="/usr/local/Cellar/openjdk@21/21.0.9/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

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

# Set config path and run gradlew
echo "Starting Coral Server..."
REGISTRY_FILE_PATH="/Users/al/apps/pardon-simulator/coral-server/src/main/resources/registry.toml" ./gradlew run

