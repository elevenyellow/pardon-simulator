import { NextRequest, NextResponse } from 'next/server';
import { invalidateAdminSession } from '@/lib/admin/auth';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('admin_token')?.value;

    if (token) {
      await invalidateAdminSession(token);
    }

    // Clear cookie
    const response = NextResponse.json({ success: true });
    response.cookies.delete('admin_token');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear the cookie even if database deletion fails
    const response = NextResponse.json({ success: true });
    response.cookies.delete('admin_token');
    return response;
  }
}

