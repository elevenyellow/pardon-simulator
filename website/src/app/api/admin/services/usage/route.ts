import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuth(request, 'view_service_usage');
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId');
    const serviceType = searchParams.get('serviceType');
    const agentId = searchParams.get('agentId');

    const where: any = {};

    if (weekId) {
      where.weekId = weekId;
    }

    if (serviceType) {
      where.serviceType = serviceType;
    }

    if (agentId) {
      where.agentId = agentId;
    }

    const [
      usageRecords,
      byServiceType,
      byAgent,
      totalUsage
    ] = await Promise.all([
      // Get usage records with details
      prisma.serviceUsage.findMany({
        where,
        orderBy: { lastUsedAt: 'desc' },
        take: 100
      }),
      
      // Group by service type
      prisma.serviceUsage.groupBy({
        by: ['serviceType'],
        where,
        _sum: {
          usageCount: true
        },
        _count: true
      }),
      
      // Group by agent
      prisma.serviceUsage.groupBy({
        by: ['agentId'],
        where,
        _sum: {
          usageCount: true
        },
        _count: true
      }),
      
      // Total usage count
      prisma.serviceUsage.aggregate({
        where,
        _sum: {
          usageCount: true
        }
      })
    ]);

    return NextResponse.json({
      usageRecords,
      stats: {
        totalUsages: totalUsage._sum.usageCount || 0,
        byServiceType: byServiceType.map(item => ({
          serviceType: item.serviceType,
          totalUsages: item._sum.usageCount || 0,
          uniqueUsers: item._count
        })),
        byAgent: byAgent.map(item => ({
          agentId: item.agentId,
          totalUsages: item._sum.usageCount || 0,
          uniqueUsers: item._count
        }))
      }
    });
  } catch (error) {
    console.error('Service usage error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service usage statistics' },
      { status: 500 }
    );
  }
}

