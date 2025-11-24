/**
 * Thread Cleanup Cron
 * 
 * Runs every 30 minutes to:
 * 1. Find orphaned Coral threads (not in database)
 * 2. Close orphaned threads to free resources
 * 3. Log cleanup statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { closeOrphanedThreads } from '@/lib/session-lifecycle';
import { getAllPools } from '@/lib/sessionPooling';

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request (Vercel cron or authorized client)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    console.log('[Thread Cleanup Cron] Starting cleanup...');
    
    const pools = getAllPools();
    let totalOrphaned = 0;
    const results: Record<string, number> = {};
    
    for (const poolId of pools) {
      try {
        const count = await closeOrphanedThreads(poolId);
        results[poolId] = count;
        totalOrphaned += count;
        
        if (count > 0) {
          console.log(`[Thread Cleanup] Closed ${count} orphaned threads in ${poolId}`);
        }
      } catch (error: any) {
        console.error(`[Thread Cleanup] Error cleaning ${poolId}:`, error.message);
        results[poolId] = -1; // Error indicator
      }
    }
    
    console.log(`[Thread Cleanup] Total orphaned threads closed: ${totalOrphaned}`);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalOrphaned,
      byPool: results
    });
    
  } catch (error: any) {
    console.error('[Thread Cleanup Cron] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}




