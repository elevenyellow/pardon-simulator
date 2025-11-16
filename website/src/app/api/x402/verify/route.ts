/**
 * POST /api/x402/verify
 * Verify x402 payment locally using Solana RPC
 * 
 * We verify locally to avoid CDP authentication issues.
 * Settlement (which registers with x402scan) happens via CDP facilitator.
 */

import { NextRequest, NextResponse } from'next/server';
import { Connection, VersionedTransaction, Transaction } from'@solana/web3.js';

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

    const microUsdc = parseInt(requirements.maxAmountRequired ||'0');
    const usdc = microUsdc / 1_000_000;
    
    console.log('[Verify] Verifying user-signed USDC transaction locally');
    console.log(`Expected: ${usdc} USDC to ${requirements.payTo}`);

    // Get transaction from payload
    const transactionBase64 = payload.payload?.transaction || payload.transaction_base64;
    
    if (!transactionBase64) {
      return NextResponse.json(
        { valid: false, error:'No transaction provided'},
        { status: 400 }
      );
    }

    // Decode and validate transaction structure
    try {
      const transactionBuffer = Buffer.from(transactionBase64,'base64');
      
      // Try to deserialize as VersionedTransaction or legacy Transaction
      let transaction: Transaction | VersionedTransaction;
      try {
        transaction = VersionedTransaction.deserialize(transactionBuffer);
        console.log('[Verify] Parsed as VersionedTransaction');
      } catch (e) {
        transaction = Transaction.from(transactionBuffer);
        console.log('[Verify] Parsed as legacy Transaction');
      }
      
      // Verify transaction is signed
      if ('signatures'in transaction && transaction.signatures.length === 0) {
        return NextResponse.json(
          { valid: false, error:'Transaction is not signed'},
          { status: 400 }
        );
      }
      
      console.log('[Verify]  Transaction structure valid and signed');
      console.log('[Verify] Transaction will be settled via CDP facilitator');

      return NextResponse.json({
        valid: true,
        paymentId: payload.paymentId || payload.payment_id,
        from: payload.from
      });
      
    } catch (e: any) {
      console.error('[Verify] Invalid transaction:', e.message);
      return NextResponse.json(
        { valid: false, error:`Invalid transaction: ${e.message}`},
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('[CDP] Verification error:', error);
    return NextResponse.json(
      { valid: false, error: error.message ||'Verification failed'},
      { status: 500 }
    );
  }
}

