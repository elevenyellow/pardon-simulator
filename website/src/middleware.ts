/**
 * Next.js Middleware
 * 
 * Runs on every request before reaching the API routes.
 * Applies CORS, security headers, and other cross-cutting concerns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyCORSHeaders, handleCORSPreflight, getCORSConfig } from '@/lib/middleware/cors';

export function middleware(request: NextRequest) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCORSPreflight(request, getCORSConfig());
  }

  // Continue to the route handler
  const response = NextResponse.next();

  // Apply CORS headers to the response
  return applyCORSHeaders(request, response, getCORSConfig());
}

// Apply middleware to API routes only
export const config = {
  matcher: '/api/:path*',
};

