#!/bin/bash
set -e

if [ $# -lt 2 ]; then
  echo "Usage: $0 <agent-name> <config-file>"
  echo ""
  echo "Examples:"
  echo "  $0 cz operational-private.txt"
  echo "  $0 trump-donald personality-public.txt"
  echo ""
  echo "Available agents:"
  echo "  - cz"
  echo "  - trump-donald"
  echo "  - trump-melania"
  echo "  - trump-eric"
  echo "  - trump-donjr"
  echo "  - trump-barron"
  exit 1
fi

AGENT=$1
FILE=$2
FILEPATH="agents/${AGENT}/${FILE}"
REGION=${AWS_REGION:-us-east-1}

if [ ! -f "$FILEPATH" ]; then
  echo "❌ Error: ${FILEPATH} not found"
  exit 1
fi

PARAM_NAME="/pardon/agents/${AGENT}/${FILE%.*}"

echo "=========================================="
echo "📤 Uploading Config"
echo "=========================================="
echo ""
echo "Agent:  ${AGENT}"
echo "File:   ${FILE}"
echo "Param:  ${PARAM_NAME}"
echo "Region: ${REGION}"
echo ""

aws ssm put-parameter \
  --name "$PARAM_NAME" \
  --value file://"$FILEPATH" \
  --type "SecureString" \
  --overwrite \
  --region ${REGION}

echo ""
echo "✅ Config updated successfully!"
echo ""
echo "To apply changes, restart the agent container:"
echo "  ssh ec2-user@YOUR_EC2_IP"
echo "  cd ~/pardon-simulator"
echo "  docker-compose restart agent-${AGENT}"

