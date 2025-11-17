#!/bin/bash
set -e

if [ $# -lt 2 ]; then
  echo "Usage: $0 <agent-name> <config-file>"
  echo ""
  echo "Examples:"
  echo "  $0 cz operational-private.txt"
  echo "  $0 trump-donald personality-public.txt"
  echo ""
  echo "This will:"
  echo "  1. Upload the config to S3"
  echo "  2. Restart the agent container on EB"
  exit 1
fi

AGENT=$1
FILE=$2

echo "=========================================="
echo "🔄 Update Agent Config on Elastic Beanstalk"
echo "=========================================="
echo ""

# Upload to S3
echo "📤 Uploading ${FILE} for ${AGENT}..."
./scripts/update-single-config.sh ${AGENT} ${FILE}
echo ""

# Restart agent on EB
echo "🔄 Restarting agent on Elastic Beanstalk..."
echo ""

eb ssh --command "cd /var/app/current && docker-compose restart agent-${AGENT}"

echo ""
echo "✅ Config updated and agent restarted!"
echo ""
echo "View logs:"
echo "  eb logs --stream --log-group /aws/elasticbeanstalk/agent-${AGENT}"

