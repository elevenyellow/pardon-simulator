/**
 * Session Pooling for Coral Server Load Distribution
 * 
 * ARCHITECTURE:
 * - Production: Single session (production-main) for stability
 * - Development: Multi-pool (pool-0 through pool-4) for testing
 * 
 * Single-session provides rock-solid conversation stability by eliminating
 * pool routing issues. Can handle ~50-100 concurrent users per ECS task.
 */

import { prisma } from './prisma';
import crypto from 'crypto';

// Configuration
const POOL_COUNT = 5;
const POOL_PREFIX = 'pool';
const MAX_THREADS_PER_POOL = 40; // Soft limit before considering pool unhealthy
const PRODUCTION_SESSION_ID = 'production-main';

export interface PoolHealth {
  poolId: string;
  activeThreads: number;
  activeSessions: number;
  healthy: boolean;
  loadPercentage: number;
}

/**
 * Check if we're using single-session architecture (production)
 */
export function isSingleSessionMode(): boolean {
  // In production, we use single session for stability
  // Can override with CORAL_USE_POOLS=true for testing
  const usePools = process.env.CORAL_USE_POOLS === 'true';
  return !usePools;
}

/**
 * Get session pool ID for a user based on wallet hash
 * Uses consistent hashing to ensure same user always gets same pool
 * 
 * In single-session mode, always returns production-main
 */
export function getUserSessionPool(walletAddress: string): string {
  if (isSingleSessionMode()) {
    return PRODUCTION_SESSION_ID;
  }
  
  // Legacy multi-pool mode
  // Hash the wallet address
  const hash = crypto.createHash('sha256').update(walletAddress).digest();
  
  // Use first byte to determine pool (0-255 % 5 = 0-4)
  const poolIndex = hash[0] % POOL_COUNT;
  
  return `${POOL_PREFIX}-${poolIndex}`;
}

/**
 * Get all available pool/session IDs
 * Returns production-main for single-session mode, or pool-0...pool-4 for multi-pool
 */
export function getAllPools(): string[] {
  if (isSingleSessionMode()) {
    return [PRODUCTION_SESSION_ID];
  }
  
  // Legacy multi-pool mode
  return Array.from({ length: POOL_COUNT }, (_, i) => `${POOL_PREFIX}-${i}`);
}

/**
 * Get health status for all pools
 * Checks active threads and sessions in database
 */
export async function getPoolHealthStatus(): Promise<PoolHealth[]> {
  const pools = getAllPools();
  const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // Active in last hour
  
  const healthPromises = pools.map(async (poolId) => {
    // Count active threads in this pool
    const activeThreads = await prisma.thread.count({
      where: {
        session: {
          coralSessionId: poolId,
          endTime: null,
          lastActivityAt: {
            gte: cutoffTime
          }
        }
      }
    });
    
    // Count active sessions in this pool
    const activeSessions = await prisma.session.count({
      where: {
        coralSessionId: poolId,
        endTime: null,
        lastActivityAt: {
          gte: cutoffTime
        }
      }
    });
    
    const loadPercentage = (activeThreads / MAX_THREADS_PER_POOL) * 100;
    const healthy = activeThreads < MAX_THREADS_PER_POOL * 0.9; // Unhealthy at 90% capacity
    
    return {
      poolId,
      activeThreads,
      activeSessions,
      healthy,
      loadPercentage
    };
  });
  
  return Promise.all(healthPromises);
}

/**
 * Select the healthiest pool for load balancing
 * Falls back to hash-based assignment if all pools are equally loaded
 */
export async function selectHealthiestPool(fallbackWallet?: string): Promise<string> {
  const poolHealth = await getPoolHealthStatus();
  
  // Filter to healthy pools
  const healthyPools = poolHealth.filter(p => p.healthy);
  
  // If no healthy pools, use least loaded
  if (healthyPools.length === 0) {
    console.warn('[SessionPooling] No healthy pools available, using least loaded');
    const leastLoaded = poolHealth.sort((a, b) => a.activeThreads - b.activeThreads)[0];
    return leastLoaded.poolId;
  }
  
  // If all healthy, select least loaded healthy pool
  const leastLoadedHealthy = healthyPools.sort((a, b) => a.activeThreads - b.activeThreads)[0];
  
  // If there's a clear winner (at least 10% less loaded), use it
  const secondLeast = healthyPools[1];
  if (secondLeast && (leastLoadedHealthy.loadPercentage + 10 < secondLeast.loadPercentage)) {
    return leastLoadedHealthy.poolId;
  }
  
  // Otherwise, use consistent hashing if provided
  if (fallbackWallet) {
    return getUserSessionPool(fallbackWallet);
  }
  
  return leastLoadedHealthy.poolId;
}

/**
 * Get pool statistics for monitoring
 */
export async function getPoolStatistics() {
  const poolHealth = await getPoolHealthStatus();
  
  const totalThreads = poolHealth.reduce((sum, p) => sum + p.activeThreads, 0);
  const totalSessions = poolHealth.reduce((sum, p) => sum + p.activeSessions, 0);
  const healthyPools = poolHealth.filter(p => p.healthy).length;
  
  return {
    pools: poolHealth,
    summary: {
      totalThreads,
      totalSessions,
      healthyPools,
      totalPools: POOL_COUNT,
      averageLoad: totalThreads / POOL_COUNT,
      maxCapacity: MAX_THREADS_PER_POOL * POOL_COUNT
    }
  };
}

/**
 * Validate pool ID format
 */
export function isValidPoolId(poolId: string): boolean {
  const pattern = new RegExp(`^${POOL_PREFIX}-[0-${POOL_COUNT - 1}]$`);
  return pattern.test(poolId);
}





