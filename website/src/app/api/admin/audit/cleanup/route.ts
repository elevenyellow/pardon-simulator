import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuthWithLogging } from '@/lib/admin/middleware';
import { cleanupOldAuditLogs, getAuditLogStats } from '@/lib/admin/audit-cleanup';

/**
 * GET /api/admin/audit/cleanup
 * Get audit log statistics (for admin to see before cleanup)
 */
export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuthWithLogging(request, 'view_audit_stats');
  if (error) return error;

  try {
    const stats = await getAuditLogStats();
    
    return NextResponse.json({
      success: true,
      stats
    });
    
  } catch (error: any) {
    console.error('Audit stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit statistics' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/audit/cleanup
 * Clean up old audit logs
 */
export async function DELETE(request: NextRequest) {
  const { admin, error } = await requireAdminAuthWithLogging(request, 'cleanup_audit_logs');
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const retentionDays = parseInt(searchParams.get('retentionDays') || '90');
    
    // Validate retention days (must be at least 30 days)
    if (retentionDays < 30) {
      return NextResponse.json(
        { error: 'Retention period must be at least 30 days' },
        { status: 400 }
      );
    }
    
    const deletedCount = await cleanupOldAuditLogs(retentionDays);
    
    return NextResponse.json({
      success: true,
      deletedCount,
      retentionDays,
      message: `Deleted ${deletedCount} audit log(s) older than ${retentionDays} days`
    });
    
  } catch (error: any) {
    console.error('Audit cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup audit logs' },
      { status: 500 }
    );
  }
}

