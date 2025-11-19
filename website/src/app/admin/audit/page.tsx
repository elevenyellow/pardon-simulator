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

  useEffect(() => {
    fetchLogs();
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
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Audit Log</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
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
              <option value="view_user">View User</option>
              <option value="list_users">List Users</option>
              <option value="search_messages">Search Messages</option>
              <option value="list_payments">List Payments</option>
              <option value="export_data">Export Data</option>
              <option value="view_audit_log">View Audit Log</option>
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

