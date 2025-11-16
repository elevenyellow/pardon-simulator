import { NextRequest, NextResponse } from'next/server';
import { getCDPClient } from'@/lib/x402-cdp-client';

/**
 * Register transaction with x402 ecosystem via CDP facilitator
 * POST /api/x402/register
 */
export async function POST(request: NextRequest) {
  try {
    const { signature, from, to, amount, metadata } = await request.json();
    
    // Validation
    if (!signature || !from || !to || !amount) {
      return NextResponse.json(
        { error:'Missing required fields: signature, from, to, amount'},
        { status: 400 }
      );
    }
    
    const cdpClient = getCDPClient();
    const result = await cdpClient.registerTransaction({
      signature,
      chain:'solana',
      network:'mainnet-beta',
      from,
      to,
      amount,
      currency:'SOL',
      metadata
    });
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('x402 registration error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

