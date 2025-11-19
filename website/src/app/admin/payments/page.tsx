'use client';

import { useEffect, useState } from 'react';
import { DataTable, Column } from '@/components/admin/DataTable';
import { ExportButton } from '@/components/admin/ExportButton';
import { DateRangeFilter } from '@/components/admin/DateRangeFilter';

interface Payment {
  id: string;
  fromWallet: string;
  toAgent: string;
  amount: string;
  currency: string;
  verified: boolean;
  signature: string;
  serviceType: string;
  createdAt: string;
  x402ScanUrl: string | null;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [verifiedFilter, setVerifiedFilter] = useState<string>('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    fetchPayments();
  }, [page, verifiedFilter, serviceTypeFilter, fromDate, toDate]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(verifiedFilter && { verified: verifiedFilter }),
        ...(serviceTypeFilter && { serviceType: serviceTypeFilter }),
        ...(fromDate && { fromDate }),
        ...(toDate && { toDate })
      });

      const res = await fetch(`/api/admin/payments?${params}`);
      const data = await res.json();

      setPayments(data.payments);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<Payment>[] = [
    {
      key: 'createdAt',
      label: 'Date',
      render: (p) => new Date(p.createdAt).toLocaleString()
    },
    {
      key: 'fromWallet',
      label: 'From',
      render: (p) => (
        <div className="font-mono text-sm">
          {p.fromWallet.slice(0, 8)}...
        </div>
      )
    },
    {
      key: 'toAgent',
      label: 'To Agent',
      render: (p) => p.toAgent
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (p) => `${parseFloat(p.amount).toFixed(4)} ${p.currency}`
    },
    {
      key: 'serviceType',
      label: 'Service',
      render: (p) => p.serviceType
    },
    {
      key: 'verified',
      label: 'Status',
      render: (p) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          p.verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {p.verified ? 'Verified' : 'Pending'}
        </span>
      )
    },
    {
      key: 'signature',
      label: 'Signature',
      render: (p) => (
        <a
          href={`https://solscan.io/tx/${p.signature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline font-mono text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {p.signature.slice(0, 8)}...
        </a>
      )
    }
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
        <ExportButton endpoint="/api/admin/payments/export" filename="payments" />
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={verifiedFilter}
              onChange={(e) => {
                setVerifiedFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
            >
              <option value="">All</option>
              <option value="true">Verified</option>
              <option value="false">Pending</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Service:</label>
            <select
              value={serviceTypeFilter}
              onChange={(e) => {
                setServiceTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
            >
              <option value="">All Services</option>
              <option value="trump-premium">Trump Premium</option>
              <option value="eric-premium">Eric Premium</option>
              <option value="sbf-premium">SBF Premium</option>
            </select>
          </div>
        </div>
        <DateRangeFilter
          label="Payment Date"
          onFilterChange={(from, to) => {
            setFromDate(from);
            setToDate(to);
            setPage(1);
          }}
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <DataTable
          columns={columns}
          data={payments}
          keyExtractor={(p) => p.id}
          loading={loading}
          emptyMessage="No payments found"
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
    </div>
  );
}

