#!/bin/bash
# Deploy to Elastic Beanstalk
set -e

echo "🚀 Deploying to Elastic Beanstalk"
echo "================================="

# Deploy to EB
echo "📦 Deploying to pardon-production..."
eb deploy pardon-production --message "Production deployment $(date +%Y-%m-%d_%H:%M:%S)"

# Wait a moment for deployment to process
echo ""
echo "⏳ Waiting for deployment to complete..."
sleep 10

# Check health
echo ""
echo "🏥 Checking health..."
eb health

# Get URL
echo ""
echo "🌐 Your production URL:"
CNAME=$(eb status | grep CNAME | awk '{print $2}')
echo "  http://${CNAME}:5555"

echo ""
echo "📝 Next steps:"
echo "  1. Verify health: curl http://${CNAME}:5555/health"
echo "  2. Check containers: eb ssh (then: docker-compose ps)"
echo "  3. View logs: eb logs --stream"
echo "  4. Update Vercel: CORAL_SERVER_URL=http://${CNAME}:5555"

