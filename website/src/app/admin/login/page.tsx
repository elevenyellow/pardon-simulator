'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminPost } from '@/lib/admin/client';

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await adminPost('/api/admin/auth/login', { username, password });
      const data = await res.json();

      if (data.requiresPasswordSetup) {
        setRequiresSetup(true);
        setPassword('');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      router.push('/admin');
    } catch (err) {
      setError('Network error');
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!setupToken) {
      setError('Setup token is required');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await adminPost('/api/admin/auth/setup-password', { 
        username, 
        password, 
        setupToken 
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Setup failed');
        setLoading(false);
        return;
      }

      router.push('/admin');
    } catch (err) {
      setError('Network error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-8">
          {requiresSetup ? 'Set Your Password' : 'Admin Login'}
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={requiresSetup ? handleSetupPassword : handleLogin}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={requiresSetup}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              required
            />
          </div>

          {requiresSetup && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Setup Token
              </label>
              <input
                type="text"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                placeholder="Enter the token from admin creation"
              />
              <p className="text-xs text-gray-500 mt-1">
                This was provided when the admin account was created
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {requiresSetup ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              minLength={requiresSetup ? 12 : undefined}
            />
            {requiresSetup && (
              <p className="text-xs text-gray-500 mt-1">
                Minimum 12 characters
              </p>
            )}
          </div>

          {requiresSetup && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                minLength={12}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium disabled:opacity-50"
          >
            {loading ? 'Processing...' : requiresSetup ? 'Set Password & Login' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

