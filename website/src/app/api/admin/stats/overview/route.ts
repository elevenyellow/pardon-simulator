import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuth(request);
  if (error) return error;

  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      totalMessages,
      messages24h,
      totalPayments,
      payments24h,
      totalSessions,
      activeSessions24h,
      recentPayments,
      recentUsers
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      
      // Active users in last 24h (users who have recent session activity)
      prisma.user.count({
        where: {
          sessions: {
            some: {
              lastActivityAt: { gte: last24h }
            }
          }
        }
      }),
      
      // Active users in last 7 days
      prisma.user.count({
        where: {
          sessions: {
            some: {
              lastActivityAt: { gte: last7d }
            }
          }
        }
      }),
      
      // Total messages
      prisma.message.count(),
      
      // Messages in last 24h
      prisma.message.count({
        where: { timestamp: { gte: last24h } }
      }),
      
      // Total payments
      prisma.payment.count(),
      
      // Payments in last 24h
      prisma.payment.count({
        where: { createdAt: { gte: last24h } }
      }),
      
      // Total sessions
      prisma.session.count(),
      
      // Active sessions in last 24h
      prisma.session.count({
        where: { lastActivityAt: { gte: last24h } }
      }),
      
      // Recent payments (last 10)
      prisma.payment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fromWallet: true,
          toAgent: true,
          amount: true,
          currency: true,
          verified: true,
          createdAt: true,
          signature: true
        }
      }),
      
      // Recent users (last 10)
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletAddress: true,
          username: true,
          totalScore: true,
          createdAt: true
        }
      })
    ]);

    return NextResponse.json({
      stats: {
        users: {
          total: totalUsers,
          active24h: activeUsers24h,
          active7d: activeUsers7d
        },
        messages: {
          total: totalMessages,
          last24h: messages24h
        },
        payments: {
          total: totalPayments,
          last24h: payments24h
        },
        sessions: {
          total: totalSessions,
          active24h: activeSessions24h
        }
      },
      recentPayments,
      recentUsers
    });
  } catch (error) {
    console.error('Stats overview error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

