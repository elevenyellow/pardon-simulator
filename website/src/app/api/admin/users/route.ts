import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';
import { validatePagination, validateDateRange, validateSearchQuery, validateSort } from '@/lib/admin/validation';

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuth(request);
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
    const searchValidation = validateSearchQuery(searchParams.get('search'));
    if (!searchValidation.valid) {
      return NextResponse.json({ error: searchValidation.error }, { status: 400 });
    }
    const search = searchValidation.sanitized;

    // Validate sort parameters
    const sortValidation = validateSort(
      searchParams.get('sortBy'),
      searchParams.get('order'),
      ['createdAt', 'username', 'totalScore', 'lastActiveAt']
    );
    if (!sortValidation.valid) {
      return NextResponse.json({ error: sortValidation.error }, { status: 400 });
    }
    const { sortBy, order } = sortValidation;

    // Validate date range
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const dateValidation = validateDateRange(fromDate, toDate);
    if (!dateValidation.valid) {
      return NextResponse.json({ error: dateValidation.error }, { status: 400 });
    }

    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { walletAddress: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include: {
          _count: {
            select: {
              sessions: true,
              scores: true,
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

