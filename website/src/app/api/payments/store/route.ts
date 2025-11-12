import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Store payment in database
 * POST /api/payments/store
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const payment = await prisma.payment.create({
      data: {
        fromWallet: data.fromWallet,
        toWallet: data.toWallet,
        toAgent: data.toAgent || 'unknown',
        amount: data.amount,
        currency: data.currency || 'SOL',
        signature: data.signature,
        serviceType: data.serviceType,
        verified: data.verified || false,
        verifiedAt: data.verifiedAt ? new Date(data.verifiedAt * 1000) : null,
        isAgentToAgent: data.isAgentToAgent || false,
        initiatedBy: data.initiatedBy
      }
    });
    
    return NextResponse.json({ success: true, payment });
    
  } catch (error: any) {
    console.error('Payment storage error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

