import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Get status of an x402 payment
 * GET /api/x402/status?paymentId=xxx or GET /api/x402/status?signature=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');
    const signature = searchParams.get('signature');
    
    if (!paymentId && !signature) {
      return NextResponse.json(
        { error: 'Missing paymentId or signature parameter' },
        { status: 400 }
      );
    }
    
    const payment = await prisma.payment.findFirst({
      where: paymentId ? { paymentId } : { signature: signature! },
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
        verifiedAt: true,
        createdAt: true,
        x402Registered: true,
        x402ScanUrl: true,
        x402ScanId: true,
        isAgentToAgent: true
      }
    });
    
    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      payment
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching payment status:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

