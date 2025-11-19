'use client';

import { useEffect, useState } from 'react';
import { DataTable, Column } from '@/components/admin/DataTable';
import { SearchInput } from '@/components/admin/SearchInput';
import { DateRangeFilter } from '@/components/admin/DateRangeFilter';

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  thread: {
    agentId: string;
    session: {
      user: {
        username: string;
        walletAddress: string;
      };
    };
  };
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  useEffect(() => {
    fetchMessages();
  }, [search, page, fromDate, toDate, agentFilter]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(search && { q: search }),
        ...(fromDate && { fromDate }),
        ...(toDate && { toDate }),
        ...(agentFilter && { agentId: agentFilter })
      });

      const res = await fetch(`/api/admin/messages/search?${params}`);
      const data = await res.json();

      setMessages(data.messages);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<Message>[] = [
    {
      key: 'timestamp',
      label: 'Time',
      render: (msg) => new Date(msg.timestamp).toLocaleString()
    },
    {
      key: 'senderId',
      label: 'Sender',
      render: (msg) => (
        <div>
          <div className="font-medium">{msg.senderId}</div>
          <div className="text-xs text-gray-500">to {msg.thread.agentId}</div>
        </div>
      )
    },
    {
      key: 'user',
      label: 'User',
      render: (msg) => (
        <div className="text-sm">
          {msg.thread.session.user.username}
        </div>
      )
    },
    {
      key: 'content',
      label: 'Preview',
      render: (msg) => (
        <div className="max-w-md truncate">{msg.content}</div>
      )
    }
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Messages</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <SearchInput
          placeholder="Search messages by content..."
          onSearch={setSearch}
        />
        <div className="flex flex-wrap items-center gap-4">
          <DateRangeFilter
            label="Message Date"
            onFilterChange={(from, to) => {
              setFromDate(from);
              setToDate(to);
              setPage(1);
            }}
          />
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Agent:</label>
            <select
              value={agentFilter}
              onChange={(e) => {
                setAgentFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Agents</option>
              <option value="trump-eric">Trump (to Eric)</option>
              <option value="eric-trump">Eric (to Trump)</option>
              <option value="sbf">SBF</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <DataTable
          columns={columns}
          data={messages}
          keyExtractor={(msg) => msg.id}
          onRowClick={setSelectedMessage}
          loading={loading}
          emptyMessage="No messages found"
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

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedMessage(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4">Message Details</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Sender</div>
                <div className="font-medium text-gray-900">{selectedMessage.senderId}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Agent</div>
                <div className="font-medium text-gray-900">{selectedMessage.thread.agentId}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">User</div>
                <div className="font-medium text-gray-900">{selectedMessage.thread.session.user.username}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Timestamp</div>
                <div className="font-medium text-gray-900">{new Date(selectedMessage.timestamp).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-2">Content</div>
                <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-900">
                  {selectedMessage.content}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedMessage(null)}
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

