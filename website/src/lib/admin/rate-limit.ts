/**
 * Admin-specific rate limiting
 * Provides rate limiters for different admin operations
 */

import { NextRequest } from 'next/server';
import { createRateLimiter } from '@/lib/middleware/rate-limit';

/**
 * Get IP address from admin request
 */
function getAdminIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for') || 
         req.headers.get('x-real-ip') || 
         'unknown';
}

/**
 * Strict rate limiter for authentication operations
 * 5 requests per 15 minutes
 */
export const adminAuthRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => `admin-auth:${getAdminIP(req)}`
});

/**
 * Standard rate limiter for general admin API operations
 * 60 requests per minute
 */
export const adminApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: 'Too many requests. Please slow down.',
  keyGenerator: (req) => `admin-api:${getAdminIP(req)}`
});

/**
 * Relaxed rate limiter for read-only operations
 * 100 requests per minute
 */
export const adminReadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Too many requests. Please slow down.',
  keyGenerator: (req) => `admin-read:${getAdminIP(req)}`
});

