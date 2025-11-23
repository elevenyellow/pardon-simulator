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

# Fetch shared premium services config
echo -n "  Fetching premium_services.json... "
if aws s3 cp "s3://${BUCKET_NAME}/current/premium_services.json" "./premium_services.json" --region ${REGION} --quiet 2>/dev/null; then
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
echo "🚀 Starting ${AGENT_NAME} agent..."
echo "=========================================="

# Start the agent
exec python main.py

