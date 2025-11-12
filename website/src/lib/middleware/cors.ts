/**
 * CORS Middleware for API Routes
 * 
 * Configures Cross-Origin Resource Sharing (CORS) policy for API endpoints.
 * This helps prevent CSRF attacks and unauthorized access from other origins.
 */

import { NextRequest, NextResponse } from 'next/server';

interface CORSConfig {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const defaultConfig: CORSConfig = {
  // In production, replace with your actual frontend domain(s)
  allowedOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Apply CORS headers to response
 */
export function applyCORSHeaders(
  request: NextRequest,
  response: NextResponse,
  config: CORSConfig = defaultConfig
): NextResponse {
  const origin = request.headers.get('origin');
  const mergedConfig = { ...defaultConfig, ...config };

  // Check if origin is allowed
  if (origin && isOriginAllowed(origin, mergedConfig.allowedOrigins || [])) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }

  // Set other CORS headers
  if (mergedConfig.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  if (mergedConfig.allowedMethods) {
    response.headers.set(
      'Access-Control-Allow-Methods',
      mergedConfig.allowedMethods.join(', ')
    );
  }

  if (mergedConfig.allowedHeaders) {
    response.headers.set(
      'Access-Control-Allow-Headers',
      mergedConfig.allowedHeaders.join(', ')
    );
  }

  if (mergedConfig.exposedHeaders && mergedConfig.exposedHeaders.length > 0) {
    response.headers.set(
      'Access-Control-Expose-Headers',
      mergedConfig.exposedHeaders.join(', ')
    );
  }

  if (mergedConfig.maxAge) {
    response.headers.set('Access-Control-Max-Age', mergedConfig.maxAge.toString());
  }

  return response;
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  // If no origins specified, allow all (not recommended for production)
  if (allowedOrigins.length === 0) {
    return false;
  }

  // Check exact match
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check wildcard patterns (e.g., *.example.com)
  return allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(origin);
    }
    return false;
  });
}

/**
 * Handle preflight OPTIONS requests
 */
export function handleCORSPreflight(request: NextRequest, config: CORSConfig = defaultConfig): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return applyCORSHeaders(request, response, config);
}

/**
 * Create CORS middleware wrapper
 */
export function withCORS(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: CORSConfig = defaultConfig
) {
  return async (req: NextRequest) => {
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return handleCORSPreflight(req, config);
    }

    // Execute handler and apply CORS headers to response
    const response = await handler(req);
    return applyCORSHeaders(req, response, config);
  };
}

/**
 * Production CORS config (to be used when deploying)
 */
export const productionCORSConfig: CORSConfig = {
  // Replace with your actual production domain(s)
  allowedOrigins: [
    'https://your-production-domain.com',
    'https://www.your-production-domain.com',
    // Add staging domains if needed
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  credentials: true,
  maxAge: 86400,
};

/**
 * Get CORS config based on environment
 */
export function getCORSConfig(): CORSConfig {
  const nodeEnv = process.env.NODE_ENV;
  
  if (nodeEnv === 'production') {
    // In production, use environment variable for allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    return {
      ...productionCORSConfig,
      allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : productionCORSConfig.allowedOrigins,
    };
  }
  
  // Development/test environment
  return defaultConfig;
}

