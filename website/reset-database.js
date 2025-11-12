#!/usr/bin/env node

/**
 * Database Reset Script
 * Clears all data from all tables for fresh testing
 * 
 * Usage: node reset-database.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('🗑️  Starting database reset...\n');

  try {
    // Delete in order to respect foreign key constraints
    // (child tables first, then parent tables)
    
    console.log('Deleting Scores...');
    const scoresDeleted = await prisma.score.deleteMany({});
    console.log(`✅ Deleted ${scoresDeleted.count} score records`);

    console.log('Deleting Messages...');
    const messagesDeleted = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${messagesDeleted.count} message records`);

    console.log('Deleting Payments...');
    const paymentsDeleted = await prisma.payment.deleteMany({});
    console.log(`✅ Deleted ${paymentsDeleted.count} payment records`);

    console.log('Deleting Threads...');
    const threadsDeleted = await prisma.thread.deleteMany({});
    console.log(`✅ Deleted ${threadsDeleted.count} thread records`);

    console.log('Deleting Sessions...');
    const sessionsDeleted = await prisma.session.deleteMany({});
    console.log(`✅ Deleted ${sessionsDeleted.count} session records`);

    console.log('Deleting Leaderboard Entries...');
    const leaderboardDeleted = await prisma.leaderboardEntry.deleteMany({});
    console.log(`✅ Deleted ${leaderboardDeleted.count} leaderboard records`);

    console.log('Deleting Users...');
    const usersDeleted = await prisma.user.deleteMany({});
    console.log(`✅ Deleted ${usersDeleted.count} user records`);

    console.log('\n🎉 Database reset complete! All tables are now empty.');
    console.log('✨ Ready for fresh testing!\n');

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Confirmation prompt
console.log('⚠️  WARNING: This will DELETE ALL DATA from the database!');
console.log('⚠️  This action cannot be undone.\n');

if (process.argv.includes('--force')) {
  resetDatabase();
} else {
  console.log('To proceed, run: node reset-database.js --force\n');
  process.exit(0);
}

