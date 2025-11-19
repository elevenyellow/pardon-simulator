/**
 * Admin Client Utilities
 * Helper functions for making authenticated admin API requests with CSRF protection
 */

/**
 * Make an authenticated admin API request with CSRF protection
 * Automatically adds the X-Admin-Action header for state-changing operations
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  
  // Add CSRF protection header for state-changing operations
  const method = options.method?.toUpperCase() || 'GET';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers.set('X-Admin-Action', 'admin-request');
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Helper for POST requests
 */
export async function adminPost(url: string, data?: any): Promise<Response> {
  return adminFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Helper for PUT requests
 */
export async function adminPut(url: string, data?: any): Promise<Response> {
  return adminFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Helper for DELETE requests
 */
export async function adminDelete(url: string): Promise<Response> {
  return adminFetch(url, {
    method: 'DELETE',
  });
}

