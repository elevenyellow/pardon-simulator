import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Update payment with x402scan data
 * PATCH /api/payments/[signature]/x402
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { signature: string } }
) {
  try {
    const data = await request.json();
    
    const payment = await prisma.payment.update({
      where: { signature: params.signature },
      data: {
        x402Registered: data.x402Registered || true,
        x402ScanUrl: data.x402ScanUrl,
        x402ScanId: data.x402ScanId,
        x402RegisteredAt: data.x402RegisteredAt ? new Date(data.x402RegisteredAt * 1000) : new Date()
      }
    });
    
    return NextResponse.json({ success: true, payment });
    
  } catch (error: any) {
    console.error('x402 data update error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

