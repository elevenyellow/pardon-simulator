import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuth(request);
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const verified = searchParams.get('verified');
    const serviceType = searchParams.get('serviceType');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    const skip = (page - 1) * limit;

    const where: any = {};

    if (verified !== null && verified !== undefined && verified !== '') {
      where.verified = verified === 'true';
    }

    if (serviceType) {
      where.serviceType = serviceType;
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

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.payment.count({ where })
    ]);

    return NextResponse.json({
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('List payments error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}

