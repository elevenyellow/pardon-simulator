/**
 * Admin Middleware
 * 
 * Protects admin routes with optional audit logging for critical operations
 * Also provides CSRF protection for state-changing operations
 * 
 * Audit Logging Strategy:
 * - Read operations (view pages, list data) = NO logging
 * - Critical operations (exports, password changes) = YES logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, logAdminAction } from './auth';

export interface AdminAuthContext {
  admin: any;
  error?: NextResponse;
}

/**
 * Verify CSRF token for state-changing operations
 * Uses custom header approach: X-Admin-Action must be present
 * This prevents simple CSRF attacks as browsers won't send custom headers cross-origin
 */
function verifyCSRFProtection(request: NextRequest): boolean {
  const method = request.method;
  
  // Only check CSRF for state-changing methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  // Check for custom header (browsers won't send this on cross-origin requests)
  const adminAction = request.headers.get('X-Admin-Action');
  return adminAction === 'admin-request';
}

/**
 * Require admin authentication for API routes (NO audit logging)
 * Use this for read-only operations (viewing pages, listing data)
 * 
 * @param request - Next.js request object
 * @returns Admin user object or error response
 */
export async function requireAdminAuth(
  request: NextRequest
): Promise<AdminAuthContext> {
  // Verify CSRF protection for state-changing operations
  if (!verifyCSRFProtection(request)) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'CSRF validation failed' },
        { status: 403 }
      )
    };
  }

  const token = request.cookies.get('admin_token')?.value;

  if (!token) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    };
  }

  const admin = await verifyAdminToken(token);

  if (!admin) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      )
    };
  }

  // NO audit logging for read operations
  return { admin };
}

/**
 * Require admin authentication WITH audit logging
 * Use this for critical operations (exports, password changes, deletions)
 * 
 * @param request - Next.js request object
 * @param action - Action being performed (for audit log)
 * @returns Admin user object or error response
 */
export async function requireAdminAuthWithLogging(
  request: NextRequest,
  action: string
): Promise<AdminAuthContext> {
  // Verify CSRF protection for state-changing operations
  if (!verifyCSRFProtection(request)) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'CSRF validation failed' },
        { status: 403 }
      )
    };
  }

  const token = request.cookies.get('admin_token')?.value;

  if (!token) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    };
  }

  const admin = await verifyAdminToken(token);

  if (!admin) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      )
    };
  }

  // Log critical action
  const ipAddress = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
  
  await logAdminAction(
    admin.id,
    action,
    undefined,
    undefined,
    ipAddress
  );

  return { admin };
}

/**
 * Require admin authentication WITH audit logging and resource details
 * Use this for critical operations that access specific resources
 * 
 * @param request - Next.js request object
 * @param action - Action being performed (for audit log)
 * @param resource - Resource identifier (e.g., userId, filename)
 * @param details - Additional context
 * @returns Admin user object or error response
 */
export async function requireAdminAuthWithResource(
  request: NextRequest,
  action: string,
  resource?: string,
  details?: any
): Promise<AdminAuthContext> {
  // Verify CSRF protection for state-changing operations
  if (!verifyCSRFProtection(request)) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'CSRF validation failed' },
        { status: 403 }
      )
    };
  }

  const token = request.cookies.get('admin_token')?.value;

  if (!token) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    };
  }

  const admin = await verifyAdminToken(token);

  if (!admin) {
    return {
      admin: null,
      error: NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      )
    };
  }

  // Log critical action with resource
  const ipAddress = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
  
  await logAdminAction(
    admin.id,
    action,
    resource,
    details,
    ipAddress
  );

  return { admin };
}

