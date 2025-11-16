/**
 * POST /api/x402/settle
 * Settle x402 payment via CDP facilitator
 * 
 * Submits the verified payment to Solana blockchain
 * Returns transaction signature and x402scan URL
 */

import { NextRequest, NextResponse } from'next/server';
import { getFacilitator, X402PaymentPayload, X402PaymentRequirements } from'@/lib/x402-facilitator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payload, requirements } = body;

    if (!payload || !requirements) {
      return NextResponse.json(
        { error:'Missing payload or requirements'},
        { status: 400 }
      );
    }

    const facilitator = getFacilitator();
    const result = await facilitator.settle(payload as X402PaymentPayload, requirements as X402PaymentRequirements);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      transaction: result.transaction,
      network: result.network,
      payer: result.payer,
      x402ScanUrl: result.x402ScanUrl,
      solanaExplorer: result.solanaExplorer,
    });

  } catch (error: any) {
    console.error('[x402/settle] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message ||'Settlement failed'},
      { status: 500 }
    );
  }
}

