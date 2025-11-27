/**
 * Intermediary State Cleanup Cron
 * 
 * Runs every 30 minutes to remove expired intermediary states from database
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    console.log('[Intermediary Cleanup Cron] Starting cleanup...');
    
    const result = await prisma.intermediaryState.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    
    console.log(`[Intermediary Cleanup] Removed ${result.count} expired state(s)`);
    
    return NextResponse.json({
      success: true,
      cleaned: result.count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Intermediary Cleanup Cron] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

