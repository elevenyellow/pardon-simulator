/**
 * Admin Middleware
 * 
 * Protects admin routes and logs all admin actions for audit trail
 * Also provides CSRF protection for state-changing operations
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
 * Require admin authentication for API routes
 * Verifies session token, CSRF protection, and logs the action
 * 
 * @param request - Next.js request object
 * @param action - Action being performed (for audit log)
 * @returns Admin user object or error response
 */
export async function requireAdminAuth(
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

  // Log action
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
 * Enhanced version that also logs the resource being accessed
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

  // Log action with resource
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

