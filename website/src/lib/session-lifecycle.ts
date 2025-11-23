/**
 * Session Lifecycle Management
 * 
 * Handles automatic expiration of inactive sessions and cleanup of Coral threads.
 */

import { prisma } from './prisma';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

/**
 * Expire sessions that have been inactive for specified minutes
 * 
 * @param inactiveMinutes - Number of minutes of inactivity before expiration
 * @returns Number of sessions expired
 */
export async function expireInactiveSessions(inactiveMinutes: number = 60): Promise<number> {
  const cutoffTime = new Date(Date.now() - inactiveMinutes * 60 * 1000);
  
  console.log(`[SessionLifecycle] Expiring sessions inactive since ${cutoffTime.toISOString()}`);
  
  // Find active sessions that are inactive
  const inactiveSessions = await prisma.session.findMany({
    where: {
      endTime: null,
      lastActivityAt: {
        lt: cutoffTime
      }
    },
    include: {
      threads: true
    }
  });
  
  console.log(`[SessionLifecycle] Found ${inactiveSessions.length} inactive sessions`);
  
  // Close Coral threads and expire sessions
  let expiredCount = 0;
  
  for (const session of inactiveSessions) {
    try {
      // Close all Coral threads for this session
      await closeCoralThreads(session.coralSessionId, session.threads.map(t => t.coralThreadId));
      
      // Mark session as ended
      await prisma.session.update({
        where: { id: session.id },
        data: {
          endTime: new Date()
        }
      });
      
      expiredCount++;
      console.log(`[SessionLifecycle] Expired session ${session.id} (Coral: ${session.coralSessionId})`);
      
    } catch (error: any) {
      console.error(`[SessionLifecycle] Error expiring session ${session.id}:`, error.message);
    }
  }
  
  return expiredCount;
}

/**
 * Close Coral threads
 * 
 * @param coralSessionId - Coral session ID
 * @param threadIds - Array of Coral thread IDs to close
 */
export async function closeCoralThreads(coralSessionId: string, threadIds: string[]): Promise<void> {
  if (threadIds.length === 0) {
    return;
  }
  
  console.log(`[SessionLifecycle] Closing ${threadIds.length} threads in Coral session ${coralSessionId}`);
  
  for (const threadId of threadIds) {
    try {
      const response = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions/${coralSessionId}/threads/${threadId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log(`[SessionLifecycle] Closed thread ${threadId}`);
      } else {
        console.warn(`[SessionLifecycle] Failed to close thread ${threadId}: ${response.status}`);
      }
      
    } catch (error: any) {
      console.error(`[SessionLifecycle] Error closing thread ${threadId}:`, error.message);
    }
  }
}

/**
 * Close orphaned Coral threads (threads without corresponding database entries)
 * 
 * @param coralSessionId - Coral session ID to check
 * @returns Number of orphaned threads closed
 */
export async function closeOrphanedThreads(coralSessionId: string): Promise<number> {
  try {
    // Get all threads from Coral Server
    const response = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions/${coralSessionId}/threads`);
    
    if (!response.ok) {
      console.warn(`[SessionLifecycle] Failed to get threads for session ${coralSessionId}`);
      return 0;
    }
    
    const coralThreads = await response.json() as string[];
    
    // Get all thread IDs from database for this session
    const dbThreads = await prisma.thread.findMany({
      where: {
        session: {
          coralSessionId
        }
      },
      select: {
        coralThreadId: true
      }
    });
    
    const dbThreadIds = new Set(dbThreads.map(t => t.coralThreadId));
    
    // Find orphaned threads (in Coral but not in database)
    const orphanedThreads = coralThreads.filter(threadId => !dbThreadIds.has(threadId));
    
    console.log(`[SessionLifecycle] Found ${orphanedThreads.length} orphaned threads in ${coralSessionId}`);
    
    if (orphanedThreads.length > 0) {
      await closeCoralThreads(coralSessionId, orphanedThreads);
    }
    
    return orphanedThreads.length;
    
  } catch (error: any) {
    console.error(`[SessionLifecycle] Error checking orphaned threads:`, error.message);
    return 0;
  }
}

/**
 * Clean up expired sessions and their threads
 * 
 * @returns Summary of cleanup operations
 */
export async function cleanupExpiredSessions() {
  console.log('[SessionLifecycle] Starting cleanup...');
  
  const startTime = Date.now();
  
  // Expire inactive sessions (60 minutes)
  const expiredCount = await expireInactiveSessions(60);
  
  // Check for orphaned threads in all active pools
  const pools = ['pool-0', 'pool-1', 'pool-2', 'pool-3', 'pool-4'];
  let orphanedCount = 0;
  
  for (const pool of pools) {
    const count = await closeOrphanedThreads(pool);
    orphanedCount += count;
  }
  
  const duration = Date.now() - startTime;
  
  console.log(`[SessionLifecycle] Cleanup completed in ${duration}ms`);
  
  return {
    expiredSessions: expiredCount,
    orphanedThreads: orphanedCount,
    durationMs: duration
  };
}

/**
 * Update session activity timestamp
 * 
 * @param sessionId - Database session ID
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date()
      }
    });
  } catch (error: any) {
    console.error(`[SessionLifecycle] Error updating session activity:`, error.message);
  }
}

/**
 * Resurrect recently expired session (if expired within last 5 minutes)
 * 
 * @param sessionId - Database session ID
 * @returns true if session was resurrected, false if too old or not found
 */
export async function resurrectSession(sessionId: string): Promise<boolean> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });
    
    if (!session || !session.endTime) {
      return false;
    }
    
    const minutesSinceExpiry = (Date.now() - session.endTime.getTime()) / 60000;
    
    if (minutesSinceExpiry <= 5) {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          endTime: null,
          lastActivityAt: new Date()
        }
      });
      
      console.log(`[SessionLifecycle] Resurrected session ${sessionId}`);
      return true;
    }
    
    return false;
    
  } catch (error: any) {
    console.error(`[SessionLifecycle] Error resurrecting session:`, error.message);
    return false;
  }
}

