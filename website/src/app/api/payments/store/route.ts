import { NextRequest, NextResponse } from'next/server';
import { prisma } from'@/lib/prisma';

/**
 * Store payment in database
 * POST /api/payments/store
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Use upsert to handle duplicate payment storage gracefully
    // If payment with this signature already exists, just return it
    const payment = await prisma.payment.upsert({
      where: {
        signature: data.signature
      },
      update: {
        // If it exists, optionally update verification status if new data is more complete
        verified: data.verified || undefined,
        verifiedAt: data.verifiedAt ? new Date(data.verifiedAt * 1000) : undefined,
      },
      create: {
        fromWallet: data.fromWallet,
        toWallet: data.toWallet,
        toAgent: data.toAgent ||'unknown',
        amount: data.amount,
        currency: data.currency ||'SOL',
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

