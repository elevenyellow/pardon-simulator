import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuth(request, 'export_users');
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const users = await prisma.user.findMany({
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

