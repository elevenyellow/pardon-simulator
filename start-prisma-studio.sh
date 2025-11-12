#!/bin/bash
# Start Prisma Studio for database management

# Navigate to website directory
cd website

echo "🗄️  Starting Prisma Studio for Website Database..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local file not found in website/"
  echo "Please run: ./setup-local-env.sh"
  exit 1
fi

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL" .env.local; then
  echo "❌ Error: DATABASE_URL not found in .env.local"
  echo "Please add your database connection string to website/.env.local"
  echo ""
  echo "Example:"
  echo "  DATABASE_URL=\"postgresql://user:password@localhost:5432/pardon_game\""
  exit 1
fi

# Check if Prisma schema exists
if [ ! -f prisma/schema.prisma ]; then
  echo "❌ Error: prisma/schema.prisma not found"
  echo "Make sure you're in the correct directory"
  exit 1
fi

echo "✅ Configuration found"
echo "📊 Database: $(grep DATABASE_URL .env.local | cut -d'=' -f2 | cut -d'@' -f2 | cut -d'/' -f1)"
echo "📁 Schema: website/prisma/schema.prisma"
echo "🌐 Opening Prisma Studio at http://localhost:5556"
echo ""
echo "💡 Tip: If you haven't set up the database yet, run:"
echo "   cd website && npx prisma db push"
echo ""

npx prisma studio --port 5556

