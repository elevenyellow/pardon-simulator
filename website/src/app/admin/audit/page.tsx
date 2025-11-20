'use client';

import { useEffect, useState } from 'react';
import { DataTable, Column } from '@/components/admin/DataTable';
import { DateRangeFilter } from '@/components/admin/DateRangeFilter';

interface AuditLog {
  id: string;
  adminUserId: string;
  action: string;
  resource: string | null;
  details: any;
  ipAddress: string | null;
  timestamp: string;
  admin: {
    username: string;
  };
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [page, actionFilter, fromDate, toDate]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(actionFilter && { action: actionFilter }),
        ...(fromDate && { fromDate }),
        ...(toDate && { toDate })
      });

      const res = await fetch(`/api/admin/audit?${params}`);
      const data = await res.json();

      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/audit/cleanup');
      const data = await res.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch audit stats:', error);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Delete audit logs older than 90 days? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch('/api/admin/audit/cleanup?retentionDays=90', {
        method: 'DELETE',
        headers: { 'X-Admin-Action': 'admin-request' }
      });
      const data = await res.json();
      
      if (data.success) {
        alert(`Successfully deleted ${data.deletedCount} old audit log(s)`);
        fetchLogs();
        fetchStats();
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
      alert('Failed to cleanup logs');
    }
  };

  const columns: Column<AuditLog>[] = [
    {
      key: 'timestamp',
      label: 'Time',
      render: (log) => new Date(log.timestamp).toLocaleString()
    },
    {
      key: 'admin',
      label: 'Admin',
      render: (log) => log.admin.username
    },
    {
      key: 'action',
      label: 'Action',
      render: (log) => (
        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
          {log.action}
        </span>
      )
    },
    {
      key: 'resource',
      label: 'Resource',
      render: (log) => log.resource || '-'
    },
    {
      key: 'ipAddress',
      label: 'IP Address',
      render: (log) => (
        <span className="font-mono text-sm">{log.ipAddress || 'unknown'}</span>
      )
    }
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Admin Audit Log</h1>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Critical Operations Only</h3>
            <p className="text-sm text-blue-700">
              This log tracks <strong>critical admin actions</strong> like data exports and password changes. 
              Read-only operations (viewing pages, searches) are not logged to keep the database lean.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Action:</label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
              >
                <option value="">All Actions</option>
                <option value="export_payments">Export Payments</option>
                <option value="export_users">Export Users</option>
                <option value="change_password">Change Password</option>
                <option value="create_admin">Create Admin</option>
                <option value="delete_admin">Delete Admin</option>
              </select>
            </div>
            <DateRangeFilter
              label="Log Date"
              onFilterChange={(from, to) => {
                setFromDate(from);
                setToDate(to);
                setPage(1);
              }}
            />
          </div>
          
          {stats && (
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{stats.totalLogs}</span> total logs
              </div>
              <button
                onClick={handleCleanup}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Cleanup Old Logs (90+ days)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <DataTable
          columns={columns}
          data={logs}
          keyExtractor={(log) => log.id}
          onRowClick={setSelectedLog}
          loading={loading}
          emptyMessage="No audit logs found"
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-900">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4">Audit Log Details</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Admin</div>
                <div className="font-medium text-gray-900">{selectedLog.admin.username}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Action</div>
                <div className="font-medium text-gray-900">{selectedLog.action}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Resource</div>
                <div className="font-medium text-gray-900">{selectedLog.resource || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">IP Address</div>
                <div className="font-medium font-mono text-gray-900">{selectedLog.ipAddress || 'unknown'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Timestamp</div>
                <div className="font-medium text-gray-900">{new Date(selectedLog.timestamp).toLocaleString()}</div>
              </div>
              {selectedLog.details && (
                <div>
                  <div className="text-sm text-gray-500 mb-2">Details</div>
                  <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs text-gray-900">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedLog(null)}
              className="mt-4 w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

