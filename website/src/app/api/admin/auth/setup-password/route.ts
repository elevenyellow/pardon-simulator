import { NextRequest, NextResponse } from 'next/server';
import { setAdminPassword } from '@/lib/admin/auth';
import { createRateLimiter } from '@/lib/middleware/rate-limit';

// Strict rate limit for password setup: 5 attempts per 15 minutes
const setupRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many password setup attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => {
    const ip = req.headers.get('x-forwarded-for') || 
               req.headers.get('x-real-ip') || 
               'unknown';
    return `admin-setup:${ip}`;
  }
});

async function handlePOST(request: NextRequest) {
  try {
    const { username, password, setupToken } = await request.json();

    if (!username || !password || !setupToken) {
      return NextResponse.json(
        { error: 'Username, password, and setup token are required' },
        { status: 400 }
      );
    }

    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 12 characters' },
        { status: 400 }
      );
    }

    const result = await setAdminPassword(username, password, setupToken);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error }, 
        { status: 400 }
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
    console.error('Password setup error:', error);
    return NextResponse.json(
      { error: 'Password setup failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return setupRateLimiter(request, handlePOST);
}

