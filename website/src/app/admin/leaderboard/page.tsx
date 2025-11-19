'use client';

import { useEffect, useState } from 'react';
import { DataTable, Column } from '@/components/admin/DataTable';
import { getCurrentWeekId } from '@/lib/utils/week';

interface LeaderboardEntry {
  id: string;
  userId: string;
  weekId: string;
  finalScore: number;
  rank: number;
  prizeAmount: string | null;
  user: {
    username: string;
    walletAddress: string;
  };
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekId, setWeekId] = useState(getCurrentWeekId());

  useEffect(() => {
    fetchLeaderboard();
  }, [weekId]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard/current?weekId=${weekId}`);
      const data = await res.json();
      setEntries(data.leaderboard || []);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<LeaderboardEntry>[] = [
    {
      key: 'rank',
      label: 'Rank',
      render: (entry) => (
        <div className="text-xl font-bold">#{entry.rank}</div>
      )
    },
    {
      key: 'user',
      label: 'User',
      render: (entry) => (
        <div>
          <div className="font-medium">{entry.user.username}</div>
          <div className="text-xs text-gray-500 font-mono">
            {entry.user.walletAddress.slice(0, 8)}...
          </div>
        </div>
      )
    },
    {
      key: 'finalScore',
      label: 'Score',
      render: (entry) => (
        <div className="text-lg font-bold">{entry.finalScore.toFixed(2)}</div>
      )
    },
    {
      key: 'prizeAmount',
      label: 'Prize',
      render: (entry) => (
        entry.prizeAmount ? (
          <div className="text-green-600 font-medium">
            {parseFloat(entry.prizeAmount).toFixed(4)} SOL
          </div>
        ) : (
          <div className="text-gray-400">-</div>
        )
      )
    }
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Leaderboard</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Week</label>
        <input
          type="text"
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
          placeholder="2024-W45"
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
        />
        <div className="text-sm text-gray-500 mt-1">
          Current week: {getCurrentWeekId()}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <DataTable
          columns={columns}
          data={entries}
          keyExtractor={(entry) => entry.id}
          loading={loading}
          emptyMessage="No leaderboard entries for this week"
        />
      </div>
    </div>
  );
}

