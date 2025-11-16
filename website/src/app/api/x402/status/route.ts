/**
 * GET /api/x402/status
 * Check x402 payment status on blockchain
 * 
 * Query parameters:
 * - signature: Transaction signature
 * - network: solana (default)
 */

import { NextRequest, NextResponse } from'next/server';
import { Connection } from'@solana/web3.js';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const signature = searchParams.get('signature');
    const network = searchParams.get('network') ||'solana';

    if (!signature) {
      return NextResponse.json(
        { error:'Missing signature parameter'},
        { status: 400 }
      );
    }

    // Connect to Solana
    const rpcUrl = process.env.SOLANA_RPC_URL ||'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl,'confirmed');

    // Check transaction status
    const status = await connection.getSignatureStatus(signature);

    if (!status || !status.value) {
      return NextResponse.json({
        found: false,
        status:'not_found',
        message:'Transaction not found on blockchain',
      });
    }

    const confirmed = status.value.confirmationStatus ==='confirmed'|| 
                     status.value.confirmationStatus ==='finalized';

    return NextResponse.json({
      found: true,
      confirmed,
      status: status.value.confirmationStatus,
      error: status.value.err,
      x402ScanUrl:`https://www.x402scan.com/tx/${signature}?chain=solana`,
      solanaExplorer:`https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
    });

  } catch (error: any) {
    console.error('[x402/status] Error:', error);
    return NextResponse.json(
      { error: error.message ||'Failed to check status'},
      { status: 500 }
    );
  }
}
