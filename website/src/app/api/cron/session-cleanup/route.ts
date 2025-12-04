/**
 * Session Cleanup Cron
 * 
 * Runs every 15 minutes to:
 * 1. Expire inactive sessions (>60 minutes)
 * 2. Close Coral threads for expired sessions
 * 3. Update session end times in database
 */

import { NextRequest, NextResponse } from 'next/server';
import { expireInactiveSessions } from '@/lib/session-lifecycle';

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request (Vercel cron or authorized client)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    console.log('[Session Cleanup Cron] Starting cleanup...');
    
    // Expire sessions inactive for 60 minutes
    const expiredCount = await expireInactiveSessions(60);
    
    console.log(`[Session Cleanup] Expired ${expiredCount} inactive sessions`);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      expiredSessions: expiredCount
    });
    
  } catch (error: any) {
    console.error('[Session Cleanup Cron] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}







