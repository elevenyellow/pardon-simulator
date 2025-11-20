/**
 * Admin Authentication Library
 * 
 * Handles admin user authentication, password management, session tokens,
 * and audit logging for the admin panel.
 */

import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

export interface AdminAuthResult {
  success: boolean;
  token?: string;
  requiresPasswordSetup?: boolean;
  error?: string;
}

/**
 * Authenticate admin user
 * On first login with no password set, returns requiresPasswordSetup=true
 * Implements account lockout after 5 failed attempts for 30 minutes
 */
export async function authenticateAdmin(
  username: string,
  password?: string
): Promise<AdminAuthResult> {
  const admin = await prisma.adminUser.findUnique({
    where: { username, isActive: true }
  });

  if (!admin) {
    return { success: false, error: 'Invalid credentials' };
  }

  // Check if account is locked
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60000);
    return { 
      success: false, 
      error: `Account is locked. Please try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.` 
    };
  }

  // If lockout period has passed, reset the lock
  if (admin.lockedUntil && admin.lockedUntil <= new Date()) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        lockedUntil: null,
        failedLoginAttempts: 0
      }
    });
  }

  // First time login - no password set yet
  if (!admin.passwordHash) {
    return { 
      success: false, 
      requiresPasswordSetup: true,
      error: 'Please set your password'
    };
  }

  // Verify password
  if (!password || !(await bcrypt.compare(password, admin.passwordHash))) {
    // Increment failed attempts
    const newFailedAttempts = admin.failedLoginAttempts + 1;
    const maxAttempts = 5;
    const lockoutMinutes = 30;

    // Lock account if max attempts reached
    if (newFailedAttempts >= maxAttempts) {
      const lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          lockedUntil
        }
      });
      return { 
        success: false, 
        error: `Too many failed attempts. Account locked for ${lockoutMinutes} minutes.` 
      };
    }

    // Update failed attempts count
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLoginAttempts: newFailedAttempts }
    });

    const attemptsLeft = maxAttempts - newFailedAttempts;
    return { 
      success: false, 
      error: `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining.` 
    };
  }

  // Successful login - reset failed attempts and lock
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { 
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date()
    }
  });

  // Create session token
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.adminSession.create({
    data: {
      adminUserId: admin.id,
      token,
      expiresAt,
    }
  });

  return { success: true, token };
}

/**
 * Set password for first-time admin user
 * Requires valid setup token for security
 */
export async function setAdminPassword(
  username: string,
  newPassword: string,
  setupToken: string
): Promise<AdminAuthResult> {
  const admin = await prisma.adminUser.findUnique({
    where: { username, isActive: true }
  });

  if (!admin) {
    return { success: false, error: 'Admin user not found' };
  }

  if (admin.passwordHash) {
    return { success: false, error: 'Password already set' };
  }

  // Verify setup token
  if (!admin.setupToken || admin.setupToken !== setupToken) {
    return { success: false, error: 'Invalid or missing setup token' };
  }

  // Hash and save password, clear setup token
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { 
      passwordHash,
      setupToken: null // Clear token after use
    }
  });

  // Auto-login after password setup
  return authenticateAdmin(username, newPassword);
}

/**
 * Verify admin session token
 */
export async function verifyAdminToken(token: string) {
  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: { admin: true }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.admin;
}

/**
 * Verify admin authentication from NextRequest
 * Extracts token from Authorization header and validates it
 */
export async function verifyAdminAuth(request: Request): Promise<{
  authenticated: boolean;
  admin?: any;
}> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const admin = await verifyAdminToken(token);

  if (!admin) {
    return { authenticated: false };
  }

  return { authenticated: true, admin };
}

/**
 * Invalidate admin session (logout)
 */
export async function invalidateAdminSession(token: string): Promise<boolean> {
  try {
    await prisma.adminSession.delete({
      where: { token }
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Log admin action for audit trail
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  resource?: string,
  details?: any,
  ipAddress?: string
) {
  await prisma.adminAuditLog.create({
    data: {
      adminUserId,
      action,
      resource,
      details,
      ipAddress,
    }
  });
}

/**
 * Clean up expired admin sessions
 * Should be called periodically (e.g., via cron job)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.adminSession.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });
  
  return result.count;
}

