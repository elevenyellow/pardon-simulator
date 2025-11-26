'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminPost } from '@/lib/admin/client';
import { Menu, X } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => {
    // Check if mobile on mount and window resize
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 bg-gray-900 text-white transition-all duration-300 z-50 ${
          sidebarOpen ? 'w-64' : 'w-0'
        } ${isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}`}
      >
        <div className={`${sidebarOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 overflow-hidden`}>
          <div className="p-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold whitespace-nowrap">Pardon Admin</h1>
              <p className="text-sm text-gray-400 whitespace-nowrap">Control Panel</p>
            </div>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-gray-800 rounded"
              >
                <X size={24} />
              </button>
            )}
          </div>
          
          <nav className="mt-8">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => isMobile && setSidebarOpen(false)}
                className={`flex items-center px-4 py-3 text-sm hover:bg-gray-800 transition whitespace-nowrap ${
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
              className="w-full px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded transition whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Top bar with toggle button */}
      <div 
        className={`fixed top-0 right-0 left-0 h-16 bg-white shadow-sm z-30 transition-all duration-300 ${
          sidebarOpen ? 'md:left-64' : 'left-0'
        }`}
      >
        <div className="h-full px-4 flex items-center">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={24} className="text-gray-700" /> : <Menu size={24} className="text-gray-700" />}
          </button>
          <div className="ml-4 text-lg font-semibold text-gray-800">
            {pathname === '/admin' && 'Dashboard'}
            {pathname.includes('/users') && !pathname.includes('/admin/users/') && 'Users'}
            {pathname.match(/\/admin\/users\/[^/]+$/) && 'User Details'}
            {pathname.includes('/messages') && 'Messages'}
            {pathname.includes('/payments') && 'Payments'}
            {pathname.includes('/services') && 'Premium Services'}
            {pathname.includes('/leaderboard') && 'Leaderboard'}
            {pathname.includes('/audit') && 'Audit Log'}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div 
        className={`transition-all duration-300 pt-16 min-h-screen ${
          sidebarOpen ? 'md:ml-64' : 'ml-0'
        }`}
      >
        <div className="p-4 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

