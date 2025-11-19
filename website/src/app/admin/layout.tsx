'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminPost } from '@/lib/admin/client';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check authentication
    fetch('/api/admin/auth/verify')
      .then(res => {
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          if (!pathname.includes('/admin/login')) {
            router.push('/admin/login');
          }
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        if (!pathname.includes('/admin/login')) {
          router.push('/admin/login');
        }
      });
  }, [router, pathname]);

  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-900">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated && !pathname.includes('/admin/login')) {
    return null;
  }

  if (pathname.includes('/admin/login')) {
    return <>{children}</>;
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: '📊' },
    { name: 'Users', href: '/admin/users', icon: '👥' },
    { name: 'Messages', href: '/admin/messages', icon: '💬' },
    { name: 'Payments', href: '/admin/payments', icon: '💰' },
    { name: 'Premium Services', href: '/admin/services', icon: '⭐' },
    { name: 'Leaderboard', href: '/admin/leaderboard', icon: '🏆' },
    { name: 'Audit Log', href: '/admin/audit', icon: '📝' },
  ];

  const handleLogout = async () => {
    try {
      await adminPost('/api/admin/auth/logout');
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white">
        <div className="p-4">
          <h1 className="text-2xl font-bold">Pardon Admin</h1>
          <p className="text-sm text-gray-400">Control Panel</p>
        </div>
        
        <nav className="mt-8">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-3 text-sm hover:bg-gray-800 transition ${
                pathname === item.href ? 'bg-gray-800 border-l-4 border-blue-500' : ''
              }`}
            >
              <span className="mr-3 text-xl">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64 p-8">
        {children}
      </div>
    </div>
  );
}

