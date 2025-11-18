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
FILES=("operational-private.txt" "personality-public.txt" "scoring-config.txt" "tool-descriptions.txt")

for file in "${FILES[@]}"; do
  s3_path="s3://${BUCKET_NAME}/agents/${AGENT_NAME}/${file}"
  
  echo -n "  Fetching ${file}... "
  
  if aws s3 cp "${s3_path}" "./${file}" --region ${REGION} --quiet 2>/dev/null; then
    echo "✓"
  else
    echo "⚠ not found, skipping"
  fi
done

# Fetch shared premium services config
echo -n "  Fetching premium_services.json... "
if aws s3 cp "s3://${BUCKET_NAME}/premium_services.json" "./premium_services.json" --region ${REGION} --quiet 2>/dev/null; then
  echo "✓"
else
  echo "⚠ not found, skipping"
fi

echo ""
echo "✅ Configs loaded successfully!"
echo ""
echo "🚀 Starting ${AGENT_NAME} agent..."
echo "=========================================="

# Start the agent
exec python main.py

