#!/bin/bash

# Database Reset Script
# Clears all data from database tables for fresh testing

cd "$(dirname "$0")/website"

echo "🗑️  Database Reset Tool"
echo "====================="
echo ""
echo "⚠️  WARNING: This will DELETE ALL DATA from the database!"
echo "⚠️  All users, sessions, messages, scores, and payments will be removed."
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirmation

if [ "$confirmation" = "yes" ]; then
    echo ""
    node reset-database.js --force
else
    echo ""
    echo "❌ Database reset cancelled."
    exit 0
fi

