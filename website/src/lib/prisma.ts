import { PrismaClient } from'@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Prisma Client with optimized connection pooling for high performance
 * 
 * Connection Pool Settings:
 * - Max connections: 20 (increased from default 10 for concurrent users)
 * - Timeout: 10s per query
 * - Connection URL should include ?connection_limit=20&pool_timeout=10
 * 
 * Performance Optimizations:
 * - Connection pooling configured for concurrent requests
 * - Query logging disabled in production
 * - Indexes defined in schema for common query patterns
 */
export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV ==='development'? ['error','warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Connection pool configuration
  // Note: Pool size is controlled via DATABASE_URL query params
  // Example: ?connection_limit=20&pool_timeout=10
});

if (process.env.NODE_ENV !=='production') globalForPrisma.prisma = prisma;

// Graceful shutdown
if (process.env.NODE_ENV !=='production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

