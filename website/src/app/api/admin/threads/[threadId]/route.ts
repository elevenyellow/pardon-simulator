import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuthWithResource } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const { admin, error } = await requireAdminAuthWithResource(
    request,
    'view_thread',
    params.threadId
  );
  if (error) return error;

  try {
    const thread = await prisma.thread.findUnique({
      where: { id: params.threadId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        },
        session: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
                username: true
              }
            }
          }
        },
        _count: {
          select: {
            messages: true,
            scores: true
          }
        }
      }
    });

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ thread });
  } catch (error) {
    console.error('Get thread error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch thread' },
      { status: 500 }
    );
  }
}

