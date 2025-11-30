import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuthWithLogging } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

// Agent wallet addresses to filter out from user export
// These are system agents, not real users
const AGENT_WALLETS: string[] = [
  process.env.WALLET_DONALD_TRUMP,
  process.env.WALLET_MELANIA_TRUMP,
  process.env.WALLET_ERIC_TRUMP,
  process.env.WALLET_DONJR_TRUMP,
  process.env.WALLET_BARRON_TRUMP,
  process.env.WALLET_CZ,
  process.env.WALLET_WHITE_HOUSE,
  'sbf', // SBF is a proxy agent, not a real user
].filter((addr): addr is string => Boolean(addr)); // Remove any undefined values

export async function GET(request: NextRequest) {
  // CRITICAL: Export operations are audited
  const { admin, error } = await requireAdminAuthWithLogging(request, 'export_users');
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const users = await prisma.user.findMany({
      where: {
        // Filter out agent wallets - they're not real users
        walletAddress: {
          notIn: AGENT_WALLETS
        }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        totalScore: true,
        createdAt: true,
        lastActiveAt: true,
        _count: {
          select: {
            sessions: true,
            scores: true,
          }
        }
      }
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['ID', 'Wallet Address', 'Username', 'Total Score', 'Created At', 'Last Active', 'Sessions', 'Scores'];
      const rows = users.map(user => [
        user.id,
        user.walletAddress,
        user.username,
        user.totalScore.toString(),
        user.createdAt.toISOString(),
        user.lastActiveAt?.toISOString() || 'N/A',
        user._count.sessions.toString(),
        user._count.scores.toString()
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="users-${new Date().toISOString()}.csv"`
        }
      });
    }

    // Return JSON
    return NextResponse.json(users, {
      headers: {
        'Content-Disposition': `attachment; filename="users-${new Date().toISOString()}.json"`
      }
    });
  } catch (error) {
    console.error('Export users error:', error);
    return NextResponse.json(
      { error: 'Failed to export users' },
      { status: 500 }
    );
  }
}

