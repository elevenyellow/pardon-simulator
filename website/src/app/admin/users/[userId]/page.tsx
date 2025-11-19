'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserDetail {
  id: string;
  walletAddress: string;
  username: string;
  totalScore: number;
  createdAt: string;
  lastActiveAt: string | null;
  sessions: any[];
  scores: any[];
  leaderboardEntries: any[];
}

export default function UserDetailPage({ params }: { params: { userId: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, [params.userId]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.userId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch user');
      }
      const data = await res.json();
      setUser(data.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <div className="text-lg text-gray-900">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">User Not Found</h1>
        <Link href="/admin/users" className="text-blue-600 hover:underline">
          Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:underline mb-2"
        >
          ← Back to Users
        </button>
        <h1 className="text-3xl font-bold text-gray-900">User Details</h1>
      </div>

      {/* User Info Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">User Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Username</div>
            <div className="font-medium text-gray-900">{user.username}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Wallet Address</div>
            <div className="font-medium font-mono text-sm text-gray-900">{user.walletAddress}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Score</div>
            <div className="font-medium text-2xl text-gray-900">{user.totalScore.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Joined</div>
            <div className="font-medium text-gray-900">{new Date(user.createdAt).toLocaleString()}</div>
          </div>
          {user.lastActiveAt && (
            <div>
              <div className="text-sm text-gray-500">Last Active</div>
              <div className="font-medium text-gray-900">{new Date(user.lastActiveAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Sessions ({user.sessions.length})</h2>
        <div className="space-y-4">
          {user.sessions.map((session) => (
            <div key={session.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900">Week: {session.weekId}</div>
                <div className="text-sm text-gray-500">
                  Score: {session.currentScore.toFixed(2)}
                </div>
              </div>
              <div className="text-sm text-gray-500">
                Started: {new Date(session.startTime).toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">
                Threads: {session.threads.length} | Messages: {session.messageCount}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Score Changes */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Score Changes (Last 100)</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {user.scores.map((score) => (
            <div key={score.id} className="flex items-center justify-between border-b pb-2">
              <div>
                <div className="font-medium text-gray-900">{score.reason}</div>
                <div className="text-xs text-gray-500">
                  {score.category} | {new Date(score.timestamp).toLocaleString()}
                </div>
              </div>
              <div className={`font-bold ${score.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {score.delta >= 0 ? '+' : ''}{score.delta.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

