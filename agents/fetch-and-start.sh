#!/bin/bash
set -e

AGENT_NAME=$1

if [ -z "$AGENT_NAME" ]; then
  echo "❌ Error: AGENT_NAME not provided"
  exit 1
fi

echo "=========================================="
echo "🤖 Starting Agent: ${AGENT_NAME}"
echo "=========================================="

cd /app/${AGENT_NAME}

BUCKET_NAME=${S3_BUCKET_NAME:-pardon-simulator-configs}
REGION=${AWS_REGION:-us-east-1}

echo "📥 Fetching configs from S3 (${BUCKET_NAME})..."

# Fetch config files from S3
FILES=("operational-private.txt" "personality-public.txt" "scoring-config.txt" "tool-descriptions.txt" "tool-definitions.json")

for file in "${FILES[@]}"; do
  s3_path="s3://${BUCKET_NAME}/current/agents/${AGENT_NAME}/${file}"
  
  echo -n "  Fetching ${file}... "
  
  if aws s3 cp "${s3_path}" "./${file}" --region ${REGION} --quiet 2>/dev/null; then
    echo "✓"
  else
    echo "⚠ not found, skipping"
  fi
done

# Fetch shared premium services config (MUST go in /app/ not agent dir)
echo -n "  Fetching premium_services.json... "
if aws s3 cp "s3://${BUCKET_NAME}/current/premium_services.json" "/app/premium_services.json" --region ${REGION} --quiet 2>/dev/null; then
  echo "✓"
else
  echo "⚠ not found, skipping"
fi

echo ""
echo "📥 Fetching shared templates (REQUIRED)..."
mkdir -p /app/shared
SHARED_FILES=("operational-template.txt" "personality-template.txt" "scoring-mandate.txt" "agent-comms-note.txt")

for file in "${SHARED_FILES[@]}"; do
  s3_path="s3://${BUCKET_NAME}/current/shared/${file}"
  
  echo -n "  Fetching ${file}... "
  
  if aws s3 cp "${s3_path}" "/app/shared/${file}" --region ${REGION} --quiet 2>/dev/null; then
    echo "✓"
  else
    echo "❌ REQUIRED FILE MISSING!"
    echo "Run: ./scripts/upload-configs.sh to upload shared templates"
    exit 1
  fi
done

echo ""
echo "✅ Configs loaded successfully!"
echo ""
echo "⏳ Waiting for Coral Server to be ready..."

# Wait for Coral Server to be responding (max 60 seconds)
CORAL_URL="${CORAL_SSE_URL%%\?*}"  # Extract base URL without query params
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s -f --max-time 2 "${CORAL_URL}" > /dev/null 2>&1 || \
     curl -s -f --max-time 2 "http://localhost:5555/v1/devmode/app/priv/sessions" > /dev/null 2>&1; then
    echo "✅ Coral Server is ready!"
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    echo "  Attempt $RETRY_COUNT/$MAX_RETRIES - waiting 2s..."
    sleep 2
  else
    echo "⚠️  WARNING: Coral Server not responding after ${MAX_RETRIES} attempts"
    echo "   Proceeding anyway - connection errors may occur"
  fi
done

echo ""
echo "🚀 Starting ${AGENT_NAME} agent..."
echo "=========================================="

# Start the agent
exec python main.py

