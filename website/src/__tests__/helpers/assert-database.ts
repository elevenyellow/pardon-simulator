/**
 * Database Assertion Helpers
 * Verify database state during tests
 */

import { PrismaClient } from '@prisma/client';

// Note: In tests, we'll use a test database or mock Prisma
const prisma = new PrismaClient();
const shouldLogCleanup =
  process.env.TEST_LOG_CLEANUP === 'true' || process.env.TEST_DEBUG === 'true';

const cleanupLog = (message: string, ...args: unknown[]): void => {
  if (shouldLogCleanup) {
    console.log(message, ...args);
  }
};

/**
 * Assert that a message exists in the database
 */
export async function assertMessageExists(
  sessionId: string,
  content: string
): Promise<boolean> {
  try {
    // Messages don't have direct sessionId, need to query through thread
    const messages = await prisma.message.findMany({
      where: {
        thread: {
          session: {
            id: sessionId
          }
        },
        content: {
          contains: content,
        },
      },
    });

    return messages.length > 0;
  } catch (error) {
    console.error('[TEST_HELPER] Error checking message:', error);
    return false;
  }
}

/**
 * Assert that a payment exists in the database
 */
export async function assertPaymentExists(
  signature: string
): Promise<boolean> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { signature },
    });

    return payment !== null;
  } catch (error) {
    console.error('[TEST_HELPER] Error checking payment:', error);
    return false;
  }
}

/**
 * Assert that user score is at least a certain value
 */
export async function assertMinimumScore(
  userWallet: string,
  minimumScore: number
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress: userWallet },
    });

    if (!user) {
      console.warn(`[TEST_HELPER] User not found: ${userWallet}`);
      return false;
    }

    return user.totalScore >= minimumScore;
  } catch (error) {
    console.error('[TEST_HELPER] Error checking score:', error);
    return false;
  }
}

/**
 * Get user's current score
 */
export async function getUserScore(userWallet: string): Promise<number> {
  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress: userWallet },
    });

    return user?.totalScore || 0;
  } catch (error) {
    console.error('[TEST_HELPER] Error getting score:', error);
    return 0;
  }
}

/**
 * Assert that a session exists
 */
export async function assertSessionExists(sessionId: string): Promise<boolean> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    return session !== null;
  } catch (error) {
    console.error('[TEST_HELPER] Error checking session:', error);
    return false;
  }
}

/**
 * Get message count for a session
 */
export async function getMessageCount(sessionId: string): Promise<number> {
  try {
    const count = await prisma.message.count({
      where: { sessionId },
    });

    return count;
  } catch (error) {
    console.error('[TEST_HELPER] Error counting messages:', error);
    return 0;
  }
}

/**
 * Get payment count for a user
 */
export async function getPaymentCount(userWallet: string): Promise<number> {
  try {
    const count = await prisma.payment.count({
      where: { fromWallet: userWallet },
    });

    return count;
  } catch (error) {
    console.error('[TEST_HELPER] Error counting payments:', error);
    return 0;
  }
}

/**
 * Clean up test data from database
 */
export async function cleanupTestData(sessionId: string): Promise<void> {
  try {
    cleanupLog('[TEST_HELPER] Cleaning up test data', { sessionId });

    // Delete messages (through thread relationship)
    await prisma.message.deleteMany({
      where: {
        thread: {
          session: {
            id: sessionId,
          },
        },
      },
    });

    // Delete session
    await prisma.session.deleteMany({
      where: { id: sessionId },
    });

    cleanupLog('[TEST_HELPER] Test data cleaned up');
  } catch (error) {
    console.error('[TEST_HELPER] Error cleaning up test data:', error);
  }
}

/**
 * Clean up test user
 */
export async function cleanupTestUser(userWallet: string): Promise<void> {
  try {
    cleanupLog('[TEST_HELPER] Cleaning up test user', { userWallet });

    // Find user first
    const user = await prisma.user.findUnique({
      where: { walletAddress: userWallet },
    });
    
    if (!user) {
      cleanupLog('[TEST_HELPER] User not found, nothing to clean up');
      return;
    }

    // Delete payments
    await prisma.payment.deleteMany({
      where: {
        OR: [
          { fromWallet: userWallet },
          { toWallet: userWallet },
        ],
      },
    });

    // Delete sessions (messages will cascade through thread deletion)
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    // Delete user
    await prisma.user.delete({
      where: { walletAddress: userWallet },
    });

    cleanupLog('[TEST_HELPER] Test user cleaned up');
  } catch (error) {
    console.error('[TEST_HELPER] Error cleaning up test user:', error);
  }
}

/**
 * Assert that premium service was recorded
 */
export async function assertPremiumServiceRecorded(
  userWallet: string,
  serviceType: string,
  agentId: string
): Promise<boolean> {
  try {
    // Find user first
    const user = await prisma.user.findUnique({
      where: { walletAddress: userWallet },
    });
    
    if (!user) {
      console.warn(`[TEST_HELPER] User not found: ${userWallet}`);
      return false;
    }
    
    // Model is ServiceUsage, not premiumServiceUsage
    const usage = await prisma.serviceUsage.findFirst({
      where: {
        userId: user.id,
        serviceType,
        agentId,
      },
    });

    return usage !== null;
  } catch (error) {
    console.error('[TEST_HELPER] Error checking premium service:', error);
    return false;
  }
}

/**
 * Close database connection (call in afterAll)
 */
export async function closeDatabaseConnection(): Promise<void> {
  await prisma.$disconnect();
}

