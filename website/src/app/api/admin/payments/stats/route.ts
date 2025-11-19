import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdminAuth(request, 'view_payment_stats');
  if (error) return error;

  try {
    const [
      totalPayments,
      verifiedPayments,
      totalByCurrency,
      totalByServiceType,
      x402Registered
    ] = await Promise.all([
      // Total payments
      prisma.payment.count(),
      
      // Verified payments
      prisma.payment.count({
        where: { verified: true }
      }),
      
      // Total volume by currency
      prisma.payment.groupBy({
        by: ['currency'],
        _sum: {
          amount: true
        },
        _count: true
      }),
      
      // Breakdown by service type
      prisma.payment.groupBy({
        by: ['serviceType'],
        _count: true
      }),
      
      // x402 registered count
      prisma.payment.count({
        where: { x402Registered: true }
      })
    ]);

    return NextResponse.json({
      total: totalPayments,
      verified: verifiedPayments,
      verificationRate: totalPayments > 0 ? (verifiedPayments / totalPayments) * 100 : 0,
      x402: {
        registered: x402Registered,
        registrationRate: totalPayments > 0 ? (x402Registered / totalPayments) * 100 : 0
      },
      byCurrency: totalByCurrency.map(item => ({
        currency: item.currency,
        total: item._sum.amount?.toString() || '0',
        count: item._count
      })),
      byServiceType: totalByServiceType.map(item => ({
        serviceType: item.serviceType,
        count: item._count
      }))
    });
  } catch (error) {
    console.error('Payment stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment statistics' },
      { status: 500 }
    );
  }
}

