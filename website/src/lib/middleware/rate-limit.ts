/**
 * Rate Limiting Middleware
 * 
 * Implements in-memory rate limiting using sliding window algorithm.
 * For production with multiple servers, consider Redis-backed solution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logRateLimitExceeded, getClientIP as getIP } from '@/lib/security/monitoring';

interface RateLimitEntry {
  requests: number[];
  lastCleanup: number;
}

// In-memory store for rate limiting
// Key format: "ip:endpoint" or "wallet:endpoint"
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastGlobalCleanup = Date.now();

interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string | null; // Custom key generator
  skipSuccessfulRequests?: boolean;
  message?: string;
}

/**
 * Create rate limiter middleware
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator,
    skipSuccessfulRequests = false,
    message = 'Too many requests, please try again later'
  } = config;

  return async (
    req: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    // Generate rate limit key
    const key = keyGenerator ? keyGenerator(req) : getDefaultKey(req);
    
    if (!key) {
      // If no key can be generated (e.g., no IP or wallet), allow the request
      // but log a warning
      console.warn('⚠️ Rate limiting: Could not generate key for request');
      return handler(req);
    }

    // Check and update rate limit
    const now = Date.now();
    const isAllowed = checkRateLimit(key, now, windowMs, maxRequests);

    if (!isAllowed) {
      console.warn(`🚫 Rate limit exceeded for key: ${key.substring(0, 20)}...`);
      
      // Log security event
      const ip = getIP(req.headers);
      const url = new URL(req.url);
      const entry = rateLimitStore.get(key);
      logRateLimitExceeded(ip, url.pathname, entry?.requests.length || 0);
      
      // Get retry-after header value
      const oldestRequest = entry?.requests[0] || now;
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);

      return NextResponse.json(
        { 
          error: 'rate_limit_exceeded',
          message,
          retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(oldestRequest + windowMs).toISOString()
          }
        }
      );
    }

    // Execute the handler
    const response = await handler(req);

    // Only count successful requests if configured
    if (!skipSuccessfulRequests || response.status < 400) {
      incrementRateLimit(key, now);
    }

    // Add rate limit headers to response
    const entry = rateLimitStore.get(key);
    const requestsInWindow = entry?.requests.length || 0;
    const remaining = Math.max(0, maxRequests - requestsInWindow);

    response.headers.set('X-RateLimit-Limit', maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());

    // Global cleanup check
    if (now - lastGlobalCleanup > CLEANUP_INTERVAL) {
      cleanupOldEntries(windowMs);
      lastGlobalCleanup = now;
    }

    return response;
  };
}

/**
 * Check if request is within rate limit
 */
function checkRateLimit(
  key: string,
  now: number,
  windowMs: number,
  maxRequests: number
): boolean {
  const entry = rateLimitStore.get(key);
  
  if (!entry) {
    return true;
  }

  // Remove requests outside the window
  const windowStart = now - windowMs;
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);

  return entry.requests.length < maxRequests;
}

/**
 * Increment rate limit counter
 */
function incrementRateLimit(key: string, now: number): void {
  const entry = rateLimitStore.get(key) || { requests: [], lastCleanup: now };
  entry.requests.push(now);
  rateLimitStore.set(key, entry);
}

/**
 * Get default key from request (IP address + path)
 */
function getDefaultKey(req: NextRequest): string | null {
  const ip = getClientIP(req);
  const path = new URL(req.url).pathname;
  
  if (!ip) {
    return null;
  }
  
  return `ip:${ip}:${path}`;
}

/**
 * Extract client IP from request
 */
function getClientIP(req: NextRequest): string | null {
  // Check common headers for client IP
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Note: req.ip is not available in Edge runtime
  // For production, ensure your proxy/CDN sets x-forwarded-for
  return 'unknown';
}

/**
 * Cleanup old entries from the store
 */
function cleanupOldEntries(windowMs: number): void {
  const now = Date.now();
  const windowStart = now - windowMs;
  let cleaned = 0;

  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove old requests
    entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);
    
    // If no requests left, remove the entry
    if (entry.requests.length === 0) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Rate limit cleanup: removed ${cleaned} expired entries`);
  }
}

/**
 * Get rate limit key from wallet address
 */
export function getWalletKey(req: NextRequest): string | null {
  // Try to extract wallet from request body
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // For now, we'll use IP-based rate limiting
    // Wallet-based rate limiting requires request body parsing
    // which is handled in individual endpoints
    return getDefaultKey(req);
  } catch {
    return getDefaultKey(req);
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */

// Strict rate limit for authentication/scoring endpoints
export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 10,           // 10 requests per minute
  message: 'Too many requests to this endpoint. Please wait a moment.'
});

// Standard rate limit for general API endpoints
export const standardRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 30,           // 30 requests per minute
  message: 'Too many requests. Please slow down.'
});

// Relaxed rate limit for read-only endpoints
export const relaxedRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 60,           // 60 requests per minute
  message: 'Too many requests. Please try again shortly.'
});

// Very strict rate limit for payment/transaction endpoints
export const paymentRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  maxRequests: 5,            // 5 requests per 5 minutes
  message: 'Payment rate limit exceeded. Please wait before submitting another transaction.',
  skipSuccessfulRequests: false
});

/**
 * Helper to apply rate limiter to route handler
 */
export function withRateLimit(
  rateLimiter: ReturnType<typeof createRateLimiter>,
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any) => {
    return rateLimiter(req, handler);
  };
}

