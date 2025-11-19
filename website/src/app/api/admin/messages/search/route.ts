import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';
import { validatePagination, validateDateRange, validateSearchQuery } from '@/lib/admin/validation';

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuth(request, 'search_messages');
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    
    // Validate pagination
    const pagination = validatePagination(
      searchParams.get('page') || '1',
      searchParams.get('limit') || '50'
    );
    if (!pagination.valid) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const { page, limit } = pagination;

    // Validate search query
    const queryValidation = validateSearchQuery(searchParams.get('q'));
    if (!queryValidation.valid) {
      return NextResponse.json({ error: queryValidation.error }, { status: 400 });
    }
    const query = queryValidation.sanitized;

    // Validate date range
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const dateValidation = validateDateRange(fromDate, toDate);
    if (!dateValidation.valid) {
      return NextResponse.json({ error: dateValidation.error }, { status: 400 });
    }

    const userId = searchParams.get('userId');
    const agentId = searchParams.get('agentId');

    const skip = (page - 1) * limit;

    const where: any = {};

    if (query) {
      where.content = { contains: query, mode: 'insensitive' };
    }

    if (fromDate || toDate) {
      where.timestamp = {};
      if (fromDate) {
        where.timestamp.gte = new Date(fromDate);
      }
      if (toDate) {
        where.timestamp.lte = new Date(toDate);
      }
    }

    if (userId || agentId) {
      where.thread = {};
      
      if (agentId) {
        where.thread.agentId = agentId;
      }
      
      if (userId) {
        where.thread.session = {
          userId: userId
        };
      }
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          thread: {
            include: {
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
              }
            }
          }
        }
      }),
      prisma.message.count({ where })
    ]);

    return NextResponse.json({
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Search messages error:', error);
    return NextResponse.json(
      { error: 'Failed to search messages' },
      { status: 500 }
    );
  }
}

