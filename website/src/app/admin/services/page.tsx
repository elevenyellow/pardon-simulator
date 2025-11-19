'use client';

import { useEffect, useState } from 'react';

interface ServiceStats {
  totalUsages: number;
  byServiceType: Array<{
    serviceType: string;
    totalUsages: number;
    uniqueUsers: number;
  }>;
  byAgent: Array<{
    agentId: string;
    totalUsages: number;
    uniqueUsers: number;
  }>;
}

export default function ServicesPage() {
  const [stats, setStats] = useState<ServiceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/services/usage');
      const data = await res.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch service stats:', error);
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

  if (!stats) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">No service data available</h1>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Premium Services</h1>

      {/* Overview */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Overview</h2>
        <div className="text-3xl font-bold text-gray-900">{stats.totalUsages}</div>
        <div className="text-sm text-gray-500">Total Service Uses</div>
      </div>

      {/* By Service Type */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Usage by Service Type</h2>
        <div className="space-y-4">
          {stats.byServiceType.map((service) => (
            <div key={service.serviceType} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900">{service.serviceType}</div>
                <div className="text-2xl font-bold text-gray-900">{service.totalUsages}</div>
              </div>
              <div className="text-sm text-gray-500">
                {service.uniqueUsers} unique users
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* By Agent */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Usage by Agent</h2>
        <div className="space-y-4">
          {stats.byAgent.map((agent) => (
            <div key={agent.agentId} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900">{agent.agentId}</div>
                <div className="text-2xl font-bold text-gray-900">{agent.totalUsages}</div>
              </div>
              <div className="text-sm text-gray-500">
                {agent.uniqueUsers} unique users
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

