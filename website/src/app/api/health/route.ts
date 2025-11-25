import { NextResponse } from 'next/server';
import { getAllPools } from '@/lib/sessionPooling';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

/**
 * GET /api/health
 * 
 * Comprehensive health check endpoint for monitoring agent availability.
 * Returns detailed status of all critical components.
 * 
 * Status Codes:
 * - 200: All systems operational
 * - 503: Service degraded or unavailable
 */
export async function GET() {
  const startTime = Date.now();
  const health: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // Check 1: Database connectivity
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = {
      status: 'healthy',
      message: 'Database connection successful',
    };
  } catch (error: any) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'unhealthy',
      message: `Database error: ${error.message}`,
    };
  }

  // Check 2: Coral Server connectivity
  try {
    const response = await fetch(`${CORAL_SERVER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      health.checks.coralServer = {
        status: 'healthy',
        message: 'Coral Server responding',
        url: CORAL_SERVER_URL,
      };
    } else {
      health.status = 'degraded';
      health.checks.coralServer = {
        status: 'unhealthy',
        message: `Coral Server returned ${response.status}`,
        url: CORAL_SERVER_URL,
      };
    }
  } catch (error: any) {
    health.status = 'degraded';
    health.checks.coralServer = {
      status: 'unhealthy',
      message: `Cannot reach Coral Server: ${error.message}`,
      url: CORAL_SERVER_URL,
    };
  }

  // Check 3: Agent pool availability (CRITICAL)
  try {
    const expectedPools = getAllPools();
    const response = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const activeSessions: string[] = await response.json();
      const availablePools = activeSessions.filter(s => expectedPools.includes(s));
      
      const poolStatus = {
        expected: expectedPools.length,
        available: availablePools.length,
        pools: availablePools,
        percentage: Math.round((availablePools.length / expectedPools.length) * 100),
      };

      if (availablePools.length === expectedPools.length) {
        health.checks.agentPools = {
          status: 'healthy',
          message: 'All agent pools available',
          ...poolStatus,
        };
      } else if (availablePools.length > 0) {
        health.status = 'degraded';
        health.checks.agentPools = {
          status: 'degraded',
          message: `Only ${availablePools.length}/${expectedPools.length} pools available`,
          ...poolStatus,
        };
      } else {
        health.status = 'unhealthy';
        health.checks.agentPools = {
          status: 'unhealthy',
          message: 'No agent pools available - agents cannot respond to users',
          ...poolStatus,
          action: 'Check agent containers: aws logs tail /ecs/pardon-production --follow',
        };
      }
    } else {
      health.status = 'degraded';
      health.checks.agentPools = {
        status: 'unknown',
        message: `Cannot check pools: Coral Server returned ${response.status}`,
      };
    }
  } catch (error: any) {
    health.status = 'degraded';
    health.checks.agentPools = {
      status: 'unknown',
      message: `Cannot check pools: ${error.message}`,
    };
  }

  // Check 4: Environment configuration
  const configChecks = {
    coralServerUrl: !!CORAL_SERVER_URL,
    databaseUrl: !!process.env.DATABASE_URL,
    heliusApiKey: !!process.env.HELIUS_API_KEY,
  };

  const missingConfigs = Object.entries(configChecks)
    .filter(([_, exists]) => !exists)
    .map(([key]) => key);

  if (missingConfigs.length === 0) {
    health.checks.configuration = {
      status: 'healthy',
      message: 'All required environment variables configured',
    };
  } else {
    health.status = 'unhealthy';
    health.checks.configuration = {
      status: 'unhealthy',
      message: `Missing environment variables: ${missingConfigs.join(', ')}`,
    };
  }

  // Overall system assessment
  const responseTime = Date.now() - startTime;
  health.responseTime = `${responseTime}ms`;

  if (health.status === 'healthy') {
    health.message = '✓ All systems operational';
  } else if (health.status === 'degraded') {
    health.message = '⚠ Service degraded - some features may not work correctly';
  } else {
    health.message = '✗ Service unavailable - critical issues detected';
  }

  // Add helpful links for unhealthy status
  if (health.status !== 'healthy') {
    health.troubleshooting = {
      diagnosticScript: './scripts/diagnose-production.sh',
      fixScript: './scripts/fix-agent-availability.sh',
      documentation: 'AGENT_AVAILABILITY_ANALYSIS.md',
    };
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

/**
 * Simple health check for load balancers (minimal overhead)
 */
export async function HEAD() {
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}

