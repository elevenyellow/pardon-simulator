import { NextRequest, NextResponse } from 'next/server';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

/**
 * GET /api/health
 * Comprehensive health check endpoint
 * Returns status of Coral Server and all agent pools
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const healthStatus: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      coralServer: {
        url: CORAL_SERVER_URL,
        reachable: false,
        responseTime: 0
      },
      pools: [],
      summary: {
        totalPools: 0,
        healthyPools: 0,
        totalAgents: 0,
        expectedAgentsPerPool: 7
      }
    };

    // Check Coral Server health
    try {
      const coralStart = Date.now();
      const healthResponse = await fetch(`${CORAL_SERVER_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      healthStatus.coralServer.responseTime = Date.now() - coralStart;
      healthStatus.coralServer.reachable = healthResponse.ok;
    } catch (error: any) {
      healthStatus.coralServer.reachable = false;
      healthStatus.coralServer.error = error.message;
      healthStatus.status = 'degraded';
    }

    // Check all pools
    const expectedPools = ['pool-0', 'pool-1', 'pool-2', 'pool-3', 'pool-4'];
    const poolChecks = expectedPools.map(async (poolId) => {
      const poolStatus: any = {
        poolId,
        exists: false,
        agentCount: 0,
        agents: [],
        healthy: false,
        responseTime: 0
      };

      try {
        const poolStart = Date.now();
        const agentsResponse = await fetch(
          `${CORAL_SERVER_URL}/api/v1/sessions/${poolId}/agents`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000)
          }
        );

        poolStatus.responseTime = Date.now() - poolStart;
        poolStatus.exists = agentsResponse.ok;

        if (agentsResponse.ok) {
          const data = await agentsResponse.json();
          poolStatus.agentCount = data.agentCount || 0;
          poolStatus.agents = data.agents || [];
          poolStatus.healthy = poolStatus.agentCount >= 7; // Expected: donald, melania, eric, donjr, barron, cz, sbf
        }
      } catch (error: any) {
        poolStatus.error = error.message;
      }

      return poolStatus;
    });

    healthStatus.pools = await Promise.all(poolChecks);
    healthStatus.summary.totalPools = healthStatus.pools.filter((p: any) => p.exists).length;
    healthStatus.summary.healthyPools = healthStatus.pools.filter((p: any) => p.healthy).length;
    healthStatus.summary.totalAgents = healthStatus.pools.reduce((sum: number, p: any) => sum + p.agentCount, 0);

    // Overall status determination
    if (!healthStatus.coralServer.reachable) {
      healthStatus.status = 'critical';
    } else if (healthStatus.summary.healthyPools === 0) {
      healthStatus.status = 'critical';
    } else if (healthStatus.summary.healthyPools < expectedPools.length) {
      healthStatus.status = 'degraded';
    }

    healthStatus.totalResponseTime = Date.now() - startTime;

    // Return appropriate HTTP status
    const httpStatus = healthStatus.status === 'healthy' ? 200 : 
                       healthStatus.status === 'degraded' ? 200 : 503;

    return NextResponse.json(healthStatus, { status: httpStatus });

  } catch (error: any) {
    return NextResponse.json({
      status: 'critical',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
