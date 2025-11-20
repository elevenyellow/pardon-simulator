import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuthWithLogging } from '@/lib/admin/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  // CRITICAL: Export operations are audited
  const { admin, error } = await requireAdminAuthWithLogging(request, 'export_payments');
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fromWallet: true,
        toAgent: true,
        toWallet: true,
        amount: true,
        currency: true,
        signature: true,
        serviceType: true,
        verified: true,
        verifiedAt: true,
        createdAt: true,
        x402Registered: true,
        x402ScanUrl: true
      }
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'ID', 'From Wallet', 'To Agent', 'To Wallet', 'Amount', 'Currency',
        'Signature', 'Service Type', 'Verified', 'Verified At', 'Created At',
        'x402 Registered', 'x402 Scan URL'
      ];
      
      const rows = payments.map(p => [
        p.id,
        p.fromWallet,
        p.toAgent,
        p.toWallet,
        p.amount.toString(),
        p.currency,
        p.signature,
        p.serviceType,
        p.verified.toString(),
        p.verifiedAt?.toISOString() || 'N/A',
        p.createdAt.toISOString(),
        p.x402Registered.toString(),
        p.x402ScanUrl || 'N/A'
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="payments-${new Date().toISOString()}.csv"`
        }
      });
    }

    // Return JSON
    return NextResponse.json(payments, {
      headers: {
        'Content-Disposition': `attachment; filename="payments-${new Date().toISOString()}.json"`
      }
    });
  } catch (error) {
    console.error('Export payments error:', error);
    return NextResponse.json(
      { error: 'Failed to export payments' },
      { status: 500 }
    );
  }
}

