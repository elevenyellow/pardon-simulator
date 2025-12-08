#!/usr/bin/env node

/**
 * Database Reset Script
 * Clears all game data tables for fresh testing
 * Preserves AdminUser and AdminSession tables
 * 
 * Usage: node reset-database.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('🗑️  Starting database reset...\n');
  console.log('ℹ️  Admin tables will be preserved.\n');

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

    console.log('Deleting Service Usage...');
    const serviceUsageDeleted = await prisma.serviceUsage.deleteMany({});
    console.log(`✅ Deleted ${serviceUsageDeleted.count} service usage records`);

    console.log('Deleting Intermediary States...');
    const intermediaryDeleted = await prisma.intermediaryState.deleteMany({});
    console.log(`✅ Deleted ${intermediaryDeleted.count} intermediary state records`);

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

    console.log('Deleting Admin Audit Logs...');
    const auditLogsDeleted = await prisma.adminAuditLog.deleteMany({});
    console.log(`✅ Deleted ${auditLogsDeleted.count} admin audit log records`);

    console.log('\n🎉 Database reset complete! All game tables are now empty.');
    console.log('🔐 Admin accounts preserved.');
    console.log('✨ Ready for fresh testing!\n');

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Confirmation prompt
console.log('⚠️  WARNING: This will DELETE ALL GAME DATA from the database!');
console.log('⚠️  This action cannot be undone.');
console.log('🔐 Admin accounts will be preserved.\n');

if (process.argv.includes('--force')) {
  resetDatabase();
} else {
  console.log('To proceed, run: node reset-database.js --force\n');
  process.exit(0);
}

