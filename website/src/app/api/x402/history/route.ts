import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Get payment history for a wallet
 * GET /api/x402/history?wallet=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    const limitParam = searchParams.get('limit');
    
    if (!wallet) {
      return NextResponse.json(
        { error: 'Missing wallet parameter' },
        { status: 400 }
      );
    }
    
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    
    const payments = await prisma.payment.findMany({
      where: {
        OR: [
          { fromWallet: wallet },
          { toWallet: wallet }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        signature: true,
        fromWallet: true,
        toWallet: true,
        toAgent: true,
        amount: true,
        currency: true,
        serviceType: true,
        verified: true,
        createdAt: true,
        // x402 fields
        x402Registered: true,
        x402ScanUrl: true,
        x402ScanId: true,
        isAgentToAgent: true
      }
    });
    
    return NextResponse.json({
      success: true,
      wallet,
      count: payments.length,
      payments
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching payment history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history', message: error.message },
      { status: 500 }
    );
  }
}

