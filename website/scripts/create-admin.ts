/**
 * Create Admin User Script
 * 
 * Creates an initial admin user in the database with a one-time setup token.
 * The admin user will be created with no password, requiring them to set
 * a password on first login using the provided setup token.
 * 
 * Usage:
 *   npx ts-node scripts/create-admin.ts
 * 
 * Or with custom username:
 *   ADMIN_USERNAME=myadmin npx ts-node scripts/create-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  
  console.log(`Creating admin user: ${username}`);
  
  try {
    // Check if admin user already exists
    const existingAdmin = await prisma.adminUser.findUnique({
      where: { username }
    });
    
    if (existingAdmin) {
      console.log(`❌ Admin user "${username}" already exists!`);
      console.log('   Use a different ADMIN_USERNAME or delete the existing user first.');
      process.exit(1);
    }
    
    // Generate one-time setup token
    const setupToken = randomBytes(32).toString('hex');
    
    // Create the admin user
    const admin = await prisma.adminUser.create({
      data: {
        username,
        setupToken,
        // Password will be set on first login
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log(`   Username: ${admin.username}`);
    console.log(`   ID: ${admin.id}`);
    console.log('');
    console.log('🔐 SETUP TOKEN (save this securely!):');
    console.log(`   ${setupToken}`);
    console.log('');
    console.log('⚠️  This token can only be used ONCE to set the initial password.');
    console.log('   Keep it secure and do not share it.');
    console.log('');
    console.log('🔑 Next steps:');
    console.log('   1. Go to /admin/login');
    console.log('   2. Enter your username');
    console.log('   3. Enter the setup token shown above');
    console.log('   4. Set your password (minimum 12 characters)');
    console.log('   5. You will be automatically logged in');
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

