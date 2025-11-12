/**
 * Solana RPC retry utility for handling network failures
 */

import { Connection, PublicKey, ConnectionConfig } from '@solana/web3.js';

export interface SolanaRetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<SolanaRetryOptions> = {
  maxRetries: 2,
  initialDelay: 500,
  timeout: 8000, // 8 seconds
};

/**
 * Create a Connection with improved error handling
 */
export function createRobustConnection(rpcUrl: string, commitment: ConnectionConfig['commitment'] = 'confirmed'): Connection {
  return new Connection(rpcUrl, {
    commitment,
    confirmTransactionInitialTimeout: 60000,
    disableRetryOnRateLimit: false,
    httpHeaders: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Execute a Solana RPC call with timeout and retry logic
 */
export async function withSolanaRetry<T>(
  operation: () => Promise<T>,
  options: SolanaRetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging requests
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), opts.timeout)
        ),
      ]);
      return result;
    } catch (error: any) {
      lastError = error;

      const isRetryable = isRetryableSolanaError(error);
      const isLastAttempt = attempt === opts.maxRetries;

      if (!isRetryable || isLastAttempt) {
        throw error;
      }

      console.warn(
        `⚠️ Solana RPC call failed (attempt ${attempt + 1}/${opts.maxRetries + 1}):`,
        error.message || error
      );
      console.warn(`   Retrying in ${delay}ms...`);

      await sleep(delay);
      delay = Math.min(delay * 2, 5000);
    }
  }

  throw lastError;
}

/**
 * Check if a Solana error is retryable
 */
function isRetryableSolanaError(error: any): boolean {
  if (!error) return false;

  const errorMessage = error.message?.toLowerCase() || '';

  // Network-related errors that are retryable
  const retryableMessages = [
    'timeout',
    'fetch failed',
    'network',
    'econnrefused',
    'econnreset',
    'etimedout',
    'socket hang up',
    'rate limit',
    'too many requests',
    '429',
    '503',
    '504',
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
 * Get balance with retry and timeout
 */
export async function getBalanceWithRetry(
  connection: Connection,
  publicKey: PublicKey,
  options?: SolanaRetryOptions
): Promise<number> {
  return withSolanaRetry(
    () => connection.getBalance(publicKey),
    options
  );
}

/**
 * Check Solana RPC health
 */
export async function checkSolanaHealth(connection: Connection): Promise<boolean> {
  try {
    await withSolanaRetry(
      () => connection.getSlot(),
      { maxRetries: 1, timeout: 3000 }
    );
    return true;
  } catch (error) {
    console.error('❌ Solana RPC health check failed:', error);
    return false;
  }
}

