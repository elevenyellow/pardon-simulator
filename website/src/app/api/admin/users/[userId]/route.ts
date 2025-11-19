import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuthWithResource } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';
import { validateId } from '@/lib/admin/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  // Validate user ID
  const idValidation = validateId(params.userId);
  if (!idValidation.valid) {
    return NextResponse.json({ error: idValidation.error }, { status: 400 });
  }

  const { admin, error } = await requireAdminAuthWithResource(
    request, 
    'view_user',
    params.userId
  );
  if (error) return error;

  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      include: {
        sessions: {
          orderBy: { startTime: 'desc' },
          include: {
            threads: {
              include: {
                _count: {
                  select: { messages: true }
                }
              }
            },
            _count: {
              select: {
                scores: true
              }
            }
          }
        },
        scores: {
          orderBy: { timestamp: 'desc' },
          take: 100,
          include: {
            thread: {
              select: {
                agentId: true
              }
            }
          }
        },
        leaderboardEntries: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

