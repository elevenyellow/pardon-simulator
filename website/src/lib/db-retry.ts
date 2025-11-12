/**
 * Database retry utility for handling transient connection failures
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
};

/**
 * Execute a database operation with exponential backoff retry logic
 * Handles transient errors like connection timeouts and closed connections
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt === opts.maxRetries;

      if (!isRetryable || isLastAttempt) {
        throw error;
      }

      // Log retry attempt
      console.warn(
        `⚠️ Database operation failed (attempt ${attempt + 1}/${opts.maxRetries + 1}):`,
        error.message || error
      );
      console.warn(`   Retrying in ${delay}ms...`);

      // Wait before retrying
      await sleep(delay);

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Check if a database error is retryable
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;

  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code;

  // Prisma error codes that are retryable
  const retryablePrismaCodes = [
    'P1001', // Can't reach database server
    'P1008', // Operations timed out
    'P1017', // Server has closed the connection
    'P2024', // Timed out fetching a new connection
  ];

  if (retryablePrismaCodes.includes(errorCode)) {
    return true;
  }

  // Network-related errors
  const retryableMessages = [
    'econnrefused',
    'econnreset',
    'etimedout',
    'connection timeout',
    'connection closed',
    'server has closed',
    "can't reach database",
    'connection terminated',
    'connection lost',
  ];

  return retryableMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(prisma: any): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
}

