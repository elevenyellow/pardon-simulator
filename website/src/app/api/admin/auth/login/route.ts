import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/admin/auth';
import { createRateLimiter } from '@/lib/middleware/rate-limit';

// Strict rate limit for login attempts: 5 attempts per 15 minutes
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => {
    // Rate limit by IP address
    const ip = req.headers.get('x-forwarded-for') || 
               req.headers.get('x-real-ip') || 
               'unknown';
    return `admin-login:${ip}`;
  }
});

async function handlePOST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const result = await authenticateAdmin(username, password);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error, 
          requiresPasswordSetup: result.requiresPasswordSetup 
        },
        { status: result.requiresPasswordSetup ? 200 : 401 }
      );
    }

    // Set HTTP-only cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('admin_token', result.token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/'
    });

    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return loginRateLimiter(request, handlePOST);
}

