/**
 * Pool Health Monitoring Cron
 * 
 * Runs every 5 minutes to:
 * 1. Check health of all session pools
 * 2. Publish metrics to CloudWatch (when configured)
 * 3. Log pool statistics for monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPoolStatistics } from '@/lib/sessionPooling';

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request (Vercel cron or authorized client)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    console.log('[Pool Health Cron] Starting health check...');
    
    // Get pool statistics
    const stats = await getPoolStatistics();
    
    // Log statistics
    console.log('[Pool Health] Summary:', {
      totalThreads: stats.summary.totalThreads,
      totalSessions: stats.summary.totalSessions,
      healthyPools: stats.summary.healthyPools,
      averageLoad: stats.summary.averageLoad.toFixed(1),
      capacityUsed: `${((stats.summary.totalThreads / stats.summary.maxCapacity) * 100).toFixed(1)}%`
    });
    
    // Log per-pool details
    stats.pools.forEach(pool => {
      const status = pool.healthy ? '✅' : '⚠️';
      console.log(`[Pool Health] ${status} ${pool.poolId}: ${pool.activeThreads} threads, ${pool.activeSessions} sessions (${pool.loadPercentage.toFixed(1)}% load)`);
    });
    
    // TODO: Publish to CloudWatch when AWS SDK is configured
    // await publishPoolMetricsToCloudWatch(stats);
    
    // Check for critical alerts
    const unhealthyPools = stats.pools.filter(p => !p.healthy);
    if (unhealthyPools.length > 0) {
      console.warn(`[Pool Health] WARNING: ${unhealthyPools.length} unhealthy pools detected`);
    }
    
    if (stats.summary.healthyPools === 0) {
      console.error('[Pool Health] CRITICAL: All pools are unhealthy!');
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      statistics: stats
    });
    
  } catch (error: any) {
    console.error('[Pool Health Cron] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * Publish pool metrics to CloudWatch
 * (To be implemented in Phase 5)
 */
async function publishPoolMetricsToCloudWatch(stats: any) {
  // Will implement with AWS SDK in monitoring phase
  // CloudWatch metrics: ActiveThreads, ActiveSessions, PoolHealth per pool
}




