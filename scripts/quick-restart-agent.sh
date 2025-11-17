#!/bin/bash
set -e

if [ $# -lt 1 ]; then
  echo "Usage: $0 <agent-name> [ec2-host]"
  echo ""
  echo "Examples:"
  echo "  $0 cz"
  echo "  $0 trump-donald 54.123.45.67"
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
EC2_HOST="${2:-${EC2_HOST}}"
EC2_USER="${EC2_USER:-ec2-user}"
KEY_PATH="${EC2_KEY_PATH:-~/.ssh/pardon-aws.pem}"

if [ -z "$EC2_HOST" ]; then
  echo "❌ Error: EC2_HOST not set"
  echo "Set it with: export EC2_HOST=your-ec2-ip"
  exit 1
fi

echo "=========================================="
echo "🔄 Restarting Agent: ${AGENT}"
echo "=========================================="
echo ""
echo "Target: ${EC2_USER}@${EC2_HOST}"
echo ""

ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << ENDSSH
  cd ~/pardon-simulator
  echo "🔄 Restarting agent-${AGENT}..."
  docker-compose restart agent-${AGENT}
  echo ""
  echo "⏳ Waiting for agent to start..."
  sleep 5
  echo ""
  echo "📊 Agent Status:"
  docker-compose ps agent-${AGENT}
  echo ""
  echo "📝 Recent Logs:"
  docker-compose logs --tail=30 agent-${AGENT}
ENDSSH

echo ""
echo "✅ Agent restarted!"

