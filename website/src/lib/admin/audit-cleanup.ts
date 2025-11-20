/**
 * Audit Log Cleanup Utilities
 * 
 * Functions to manage audit log retention and prevent unbounded growth
 */

import { prisma } from '@/lib/prisma';

/**
 * Clean up old audit logs
 * 
 * @param retentionDays - Number of days to keep logs (default: 90)
 * @returns Number of deleted records
 */
export async function cleanupOldAuditLogs(retentionDays: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const result = await prisma.adminAuditLog.deleteMany({
    where: {
      timestamp: {
        lt: cutoffDate
      }
    }
  });
  
  return result.count;
}

/**
 * Get audit log statistics
 */
export async function getAuditLogStats() {
  const [totalLogs, oldestLog, newestLog, logsByAction] = await Promise.all([
    // Total count
    prisma.adminAuditLog.count(),
    
    // Oldest log
    prisma.adminAuditLog.findFirst({
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true }
    }),
    
    // Newest log
    prisma.adminAuditLog.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    }),
    
    // Count by action
    prisma.adminAuditLog.groupBy({
      by: ['action'],
      _count: true,
      orderBy: {
        _count: {
          action: 'desc'
        }
      }
    })
  ]);
  
  return {
    totalLogs,
    oldestLog: oldestLog?.timestamp,
    newestLog: newestLog?.timestamp,
    logsByAction: logsByAction.map(item => ({
      action: item.action,
      count: item._count
    }))
  };
}

