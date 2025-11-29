/**
 * SSE Connection Protection
 * 
 * Protects backend from misbehaving frontend clients by:
 * 1. Limiting concurrent SSE connections per session/thread
 * 2. Rate limiting SSE connection attempts
 * 3. Detecting and blocking connection spam
 * 4. Tracking connection metrics
 */

import { NextRequest, NextResponse } from 'next/server';

interface ConnectionInfo {
  threadId: string;
  sessionId: string;
  connectedAt: number;
  requestCount: number;
  lastRequest: number;
}

// Track active SSE connections
const activeConnections = new Map<string, ConnectionInfo[]>();

// Track connection attempts for rate limiting
interface ConnectionAttempt {
  timestamps: number[];
}
const connectionAttempts = new Map<string, ConnectionAttempt>();

// Configuration
const CONFIG = {
  MAX_CONCURRENT_PER_THREAD: 2,        // Max concurrent connections per thread
  MAX_CONCURRENT_PER_SESSION: 5,       // Max concurrent connections per session
  CONNECTION_RATE_WINDOW: 60 * 1000,   // 1 minute window
  MAX_CONNECTION_ATTEMPTS: 10,          // Max connection attempts per minute
  SUSPICIOUS_CONNECTION_THRESHOLD: 20,  // Flag as suspicious after this many attempts
  CONNECTION_TIMEOUT: 5 * 60 * 1000,   // Force close after 5 minutes idle
  CLEANUP_INTERVAL: 2 * 60 * 1000,     // Cleanup every 2 minutes
};

let lastCleanup = Date.now();

/**
 * Check if SSE connection should be allowed
 */
export function checkSSEConnection(
  sessionId: string,
  threadId: string,
  clientIP: string
): { allowed: boolean; reason?: string; retryAfter?: number } {
  const now = Date.now();
  
  // 1. Check connection rate limiting
  const rateCheckKey = `${clientIP}:${sessionId}`;
  const rateLimitResult = checkConnectionRate(rateCheckKey, now);
  
  if (!rateLimitResult.allowed) {
    console.warn(`🚫 [SSE Protection] Connection rate limit exceeded for ${rateCheckKey}`);
    return rateLimitResult;
  }
  
  // 2. Check concurrent connections per thread
  const threadKey = `thread:${threadId}`;
  const threadConnections = activeConnections.get(threadKey) || [];
  const activeThreadConnections = threadConnections.filter(
    conn => now - conn.lastRequest < CONFIG.CONNECTION_TIMEOUT
  );
  
  if (activeThreadConnections.length >= CONFIG.MAX_CONCURRENT_PER_THREAD) {
    console.warn(`🚫 [SSE Protection] Too many concurrent connections for thread ${threadId}: ${activeThreadConnections.length}`);
    return {
      allowed: false,
      reason: 'Too many concurrent connections for this conversation. Please refresh the page.',
      retryAfter: 5
    };
  }
  
  // 3. Check concurrent connections per session
  const sessionKey = `session:${sessionId}`;
  const sessionConnections = activeConnections.get(sessionKey) || [];
  const activeSessionConnections = sessionConnections.filter(
    conn => now - conn.lastRequest < CONFIG.CONNECTION_TIMEOUT
  );
  
  if (activeSessionConnections.length >= CONFIG.MAX_CONCURRENT_PER_SESSION) {
    console.warn(`🚫 [SSE Protection] Too many concurrent connections for session ${sessionId}: ${activeSessionConnections.length}`);
    return {
      allowed: false,
      reason: 'Too many active connections. Please close other tabs or wait a moment.',
      retryAfter: 10
    };
  }
  
  // 4. Check for suspicious behavior
  const attempts = connectionAttempts.get(rateCheckKey);
  if (attempts && attempts.timestamps.length > CONFIG.SUSPICIOUS_CONNECTION_THRESHOLD) {
    console.error(`🚨 [SSE Protection] SUSPICIOUS: ${rateCheckKey} made ${attempts.timestamps.length} connection attempts`);
    // Don't block completely, but log for monitoring
  }
  
  return { allowed: true };
}

/**
 * Register new SSE connection
 */
export function registerSSEConnection(
  sessionId: string,
  threadId: string,
  clientIP: string
): string {
  const now = Date.now();
  const connectionId = `${threadId}:${now}:${Math.random().toString(36).slice(2, 9)}`;
  
  const connectionInfo: ConnectionInfo = {
    threadId,
    sessionId,
    connectedAt: now,
    requestCount: 0,
    lastRequest: now
  };
  
  // Register by thread
  const threadKey = `thread:${threadId}`;
  const threadConnections = activeConnections.get(threadKey) || [];
  threadConnections.push(connectionInfo);
  activeConnections.set(threadKey, threadConnections);
  
  // Register by session
  const sessionKey = `session:${sessionId}`;
  const sessionConnections = activeConnections.get(sessionKey) || [];
  sessionConnections.push(connectionInfo);
  activeConnections.set(sessionKey, sessionConnections);
  
  console.log(`✅ [SSE Protection] Registered connection ${connectionId} (thread: ${threadKey}, session: ${sessionKey})`);
  
  // Record connection attempt for rate limiting
  const rateCheckKey = `${clientIP}:${sessionId}`;
  recordConnectionAttempt(rateCheckKey, now);
  
  // Periodic cleanup
  if (now - lastCleanup > CONFIG.CLEANUP_INTERVAL) {
    cleanupStaleConnections();
    lastCleanup = now;
  }
  
  return connectionId;
}

/**
 * Unregister SSE connection when it closes
 */
export function unregisterSSEConnection(
  sessionId: string,
  threadId: string
): void {
  const threadKey = `thread:${threadId}`;
  const sessionKey = `session:${sessionId}`;
  
  // Remove from thread connections
  const threadConnections = activeConnections.get(threadKey) || [];
  const filteredThread = threadConnections.filter(conn => 
    conn.threadId !== threadId || conn.sessionId !== sessionId
  );
  
  if (filteredThread.length > 0) {
    activeConnections.set(threadKey, filteredThread);
  } else {
    activeConnections.delete(threadKey);
  }
  
  // Remove from session connections
  const sessionConnections = activeConnections.get(sessionKey) || [];
  const filteredSession = sessionConnections.filter(conn => 
    conn.threadId !== threadId || conn.sessionId !== sessionId
  );
  
  if (filteredSession.length > 0) {
    activeConnections.set(sessionKey, filteredSession);
  } else {
    activeConnections.delete(sessionKey);
  }
  
  console.log(`🔌 [SSE Protection] Unregistered connection for thread ${threadId}`);
}

/**
 * Update last activity timestamp for a connection
 */
export function updateConnectionActivity(
  sessionId: string,
  threadId: string
): void {
  const now = Date.now();
  const threadKey = `thread:${threadId}`;
  
  const connections = activeConnections.get(threadKey) || [];
  const connection = connections.find(c => c.threadId === threadId && c.sessionId === sessionId);
  
  if (connection) {
    connection.lastRequest = now;
    connection.requestCount++;
  }
}

/**
 * Check connection rate limiting
 */
function checkConnectionRate(
  key: string,
  now: number
): { allowed: boolean; reason?: string; retryAfter?: number } {
  const attempt = connectionAttempts.get(key);
  
  if (!attempt) {
    return { allowed: true };
  }
  
  // Filter to recent attempts within window
  const windowStart = now - CONFIG.CONNECTION_RATE_WINDOW;
  attempt.timestamps = attempt.timestamps.filter(ts => ts > windowStart);
  
  if (attempt.timestamps.length >= CONFIG.MAX_CONNECTION_ATTEMPTS) {
    const oldestAttempt = attempt.timestamps[0];
    const retryAfter = Math.ceil((oldestAttempt + CONFIG.CONNECTION_RATE_WINDOW - now) / 1000);
    
    return {
      allowed: false,
      reason: `Too many connection attempts. You're creating ${attempt.timestamps.length} connections per minute. Please wait ${retryAfter} seconds.`,
      retryAfter
    };
  }
  
  return { allowed: true };
}

/**
 * Record a connection attempt
 */
function recordConnectionAttempt(key: string, now: number): void {
  const attempt = connectionAttempts.get(key) || { timestamps: [] };
  attempt.timestamps.push(now);
  connectionAttempts.set(key, attempt);
}

/**
 * Cleanup stale connections and rate limit data
 */
function cleanupStaleConnections(): void {
  const now = Date.now();
  let cleanedConnections = 0;
  let cleanedAttempts = 0;
  
  // Clean up stale connections
  for (const [key, connections] of activeConnections.entries()) {
    const active = connections.filter(
      conn => now - conn.lastRequest < CONFIG.CONNECTION_TIMEOUT
    );
    
    if (active.length === 0) {
      activeConnections.delete(key);
      cleanedConnections++;
    } else if (active.length < connections.length) {
      activeConnections.set(key, active);
      cleanedConnections += connections.length - active.length;
    }
  }
  
  // Clean up old connection attempts
  const windowStart = now - CONFIG.CONNECTION_RATE_WINDOW;
  for (const [key, attempt] of connectionAttempts.entries()) {
    attempt.timestamps = attempt.timestamps.filter(ts => ts > windowStart);
    
    if (attempt.timestamps.length === 0) {
      connectionAttempts.delete(key);
      cleanedAttempts++;
    }
  }
  
  if (cleanedConnections > 0 || cleanedAttempts > 0) {
    console.log(`🧹 [SSE Protection] Cleanup: ${cleanedConnections} stale connections, ${cleanedAttempts} old attempts`);
  }
}

/**
 * Get connection statistics (for monitoring)
 */
export function getSSEConnectionStats() {
  const now = Date.now();
  
  let totalActiveConnections = 0;
  let totalStaleConnections = 0;
  
  for (const connections of activeConnections.values()) {
    for (const conn of connections) {
      if (now - conn.lastRequest < CONFIG.CONNECTION_TIMEOUT) {
        totalActiveConnections++;
      } else {
        totalStaleConnections++;
      }
    }
  }
  
  return {
    activeConnections: totalActiveConnections,
    staleConnections: totalStaleConnections,
    trackedSessions: activeConnections.size,
    pendingAttempts: connectionAttempts.size
  };
}

