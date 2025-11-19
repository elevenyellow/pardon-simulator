'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, Column } from '@/components/admin/DataTable';
import { SearchInput } from '@/components/admin/SearchInput';
import { ExportButton } from '@/components/admin/ExportButton';
import { DateRangeFilter } from '@/components/admin/DateRangeFilter';

interface User {
  id: string;
  walletAddress: string;
  username: string;
  totalScore: number;
  createdAt: string;
  _count: {
    sessions: number;
    scores: number;
  };
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [search, page, fromDate, toDate]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(search && { search }),
        ...(fromDate && { fromDate }),
        ...(toDate && { toDate })
      });

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();

      setUsers(data.users);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'username',
      label: 'Username',
      render: (user) => (
        <div>
          <div className="font-medium">{user.username}</div>
          <div className="text-xs text-gray-500">{user.walletAddress.slice(0, 8)}...</div>
        </div>
      )
    },
    {
      key: 'totalScore',
      label: 'Total Score',
      render: (user) => user.totalScore.toFixed(2)
    },
    {
      key: 'sessions',
      label: 'Sessions',
      render: (user) => user._count.sessions
    },
    {
      key: 'scores',
      label: 'Score Events',
      render: (user) => user._count.scores
    },
    {
      key: 'createdAt',
      label: 'Joined',
      render: (user) => new Date(user.createdAt).toLocaleDateString()
    }
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Users</h1>
        <ExportButton endpoint="/api/admin/users/export" filename="users" />
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <SearchInput
          placeholder="Search by wallet address or username..."
          onSearch={setSearch}
        />
        <DateRangeFilter
          label="Registration Date"
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
          data={users}
          keyExtractor={(user) => user.id}
          onRowClick={(user) => router.push(`/admin/users/${user.id}`)}
          loading={loading}
          emptyMessage="No users found"
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-900">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

