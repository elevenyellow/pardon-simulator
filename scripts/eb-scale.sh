#!/bin/bash
set -e

if [ $# -lt 1 ]; then
  echo "Usage: $0 <number-of-instances>"
  echo ""
  echo "Examples:"
  echo "  $0 1         - Scale to 1 instance"
  echo "  $0 2         - Scale to 2 instances"
  echo "  $0 3         - Scale to 3 instances"
  echo ""
  echo "Note: Auto-scaling is configured to scale between 1-3 instances"
  echo "      based on CPU utilization (scale up at 75%, down at 25%)"
  exit 1
fi

INSTANCES=$1

echo "=========================================="
echo "📊 Scaling Elastic Beanstalk Environment"
echo "=========================================="
echo ""

echo "Scaling to ${INSTANCES} instance(s)..."
echo ""

eb scale ${INSTANCES}

echo ""
echo "✅ Scaling complete!"
echo ""

# Show current status
eb status

echo ""
echo "Note: Auto-scaling is enabled and will adjust based on load"
echo "  - Min: 1 instance"
echo "  - Max: 3 instances"
echo "  - Scale up when CPU > 75%"
echo "  - Scale down when CPU < 25%"


