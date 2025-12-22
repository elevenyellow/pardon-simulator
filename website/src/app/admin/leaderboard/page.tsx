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
  const [stats, setStats] = useState({ totalPlayers: 0, prizeEligible: 0 });
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    fetchLeaderboard();
  }, [weekId]);

  // Countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const currentDay = now.getUTCDay();
      const currentHour = now.getUTCHours();
      
      let daysUntilMonday: number;
      
      if (currentDay === 1) {
        if (currentHour < 14) {
          daysUntilMonday = 0;
        } else {
          daysUntilMonday = 7;
        }
      } else if (currentDay === 0) {
        daysUntilMonday = 1;
      } else {
        daysUntilMonday = (8 - currentDay) % 7;
      }
      
      const nextReset = new Date(now);
      nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday);
      nextReset.setUTCHours(14, 0, 0, 0);
      
      const totalMs = nextReset.getTime() - now.getTime();
      
      const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
      
      setCountdown({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/leaderboard?weekId=${weekId}`);
      const data = await res.json();
      setEntries(data.leaderboard || []);
      setStats({
        totalPlayers: data.totalPlayers || 0,
        prizeEligible: data.prizeEligible || 0
      });
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
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold">{entry.finalScore.toFixed(2)}</div>
          {entry.finalScore >= 90 ? (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
              Prize Eligible
            </span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              Below Threshold
            </span>
          )}
        </div>
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
        
        {/* Countdown Timer */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg shadow-lg">
          <div className="text-xs font-medium mb-1 text-center">Week Resets In</div>
          <div className="flex gap-2 text-center">
            <div>
              <div className="text-2xl font-bold">{countdown.days.toString().padStart(2, '0')}</div>
              <div className="text-[10px] opacity-80">DAYS</div>
            </div>
            <div className="text-2xl font-bold">:</div>
            <div>
              <div className="text-2xl font-bold">{countdown.hours.toString().padStart(2, '0')}</div>
              <div className="text-[10px] opacity-80">HRS</div>
            </div>
            <div className="text-2xl font-bold">:</div>
            <div>
              <div className="text-2xl font-bold">{countdown.minutes.toString().padStart(2, '0')}</div>
              <div className="text-[10px] opacity-80">MIN</div>
            </div>
            <div className="text-2xl font-bold">:</div>
            <div>
              <div className="text-2xl font-bold">{countdown.seconds.toString().padStart(2, '0')}</div>
              <div className="text-[10px] opacity-80">SEC</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Week</label>
          <input
            type="text"
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
            placeholder="2024-W45"
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 w-full"
          />
          <div className="text-sm text-gray-500 mt-1">
            Current week: {getCurrentWeekId()}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-700 mb-2">Total Players</div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalPlayers}</div>
          <div className="text-sm text-gray-500 mt-1">All participants this week</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-700 mb-2">Prize Eligible</div>
          <div className="text-3xl font-bold text-green-600">{stats.prizeEligible}</div>
          <div className="text-sm text-gray-500 mt-1">Players with 90+ score</div>
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

