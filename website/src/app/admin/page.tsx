'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatCard } from '@/components/admin/StatCard';

interface Stats {
  users: {
    total: number;
    active24h: number;
    active7d: number;
  };
  messages: {
    total: number;
    last24h: number;
  };
  payments: {
    total: number;
    last24h: number;
  };
  sessions: {
    total: number;
    active24h: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats/overview')
      .then(res => res.json())
      .then(data => {
        setStats(data.stats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center">
        <div className="text-lg text-gray-900">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={stats.users.total}
          subtitle={`${stats.users.active24h} active (24h)`}
          icon="👥"
          link="/admin/users"
        />
        <StatCard
          title="Messages"
          value={stats.messages.total}
          subtitle={`${stats.messages.last24h} in last 24h`}
          icon="💬"
          link="/admin/messages"
        />
        <StatCard
          title="Payments"
          value={stats.payments.total}
          subtitle={`${stats.payments.last24h} in last 24h`}
          icon="💰"
          link="/admin/payments"
        />
        <StatCard
          title="Sessions"
          value={stats.sessions.total}
          subtitle={`${stats.sessions.active24h} active (24h)`}
          icon="🎮"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/admin/users?filter=active"
            className="p-4 border rounded-lg hover:bg-gray-50 transition"
          >
            <div className="text-2xl mb-2">🔥</div>
            <div className="font-medium text-gray-900">Active Users</div>
            <div className="text-sm text-gray-500">View recently active users</div>
          </Link>
          <Link
            href="/admin/messages?filter=recent"
            className="p-4 border rounded-lg hover:bg-gray-50 transition"
          >
            <div className="text-2xl mb-2">💭</div>
            <div className="font-medium text-gray-900">Recent Messages</div>
            <div className="text-sm text-gray-500">View latest conversations</div>
          </Link>
          <Link
            href="/admin/payments?verified=false"
            className="p-4 border rounded-lg hover:bg-gray-50 transition"
          >
            <div className="text-2xl mb-2">⏳</div>
            <div className="font-medium text-gray-900">Unverified Payments</div>
            <div className="text-sm text-gray-500">Check payment status</div>
          </Link>
          <Link
            href="/admin/audit"
            className="p-4 border rounded-lg hover:bg-gray-50 transition"
          >
            <div className="text-2xl mb-2">📝</div>
            <div className="font-medium text-gray-900">Audit Log</div>
            <div className="text-sm text-gray-500">Review admin actions</div>
          </Link>
        </div>
      </div>
    </div>
  );
}

