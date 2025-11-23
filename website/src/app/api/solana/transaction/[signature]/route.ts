/**
 * GET /api/solana/transaction/[signature]
 * Check Solana transaction status and confirmation
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, VersionedTransactionResponse } from '@solana/web3.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ signature: string }> }
) {
  try {
    // Next.js 15 requires awaiting params before accessing properties
    const { signature } = await params;

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing transaction signature' },
        { status: 400 }
      );
    }

    console.log(`[solana/transaction] Checking transaction: ${signature.substring(0, 16)}...`);

    // Connect to Solana
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Get transaction details
    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!transaction) {
      return NextResponse.json(
        {
          found: false,
          confirmed: false,
          message: 'Transaction not found on blockchain',
        },
        { status: 404 }
      );
    }

    // Check if transaction was successful
    const successful = !transaction.meta?.err;
    const confirmed = transaction.blockTime !== null;

    // Get confirmation status for more detail
    const statusResponse = await connection.getSignatureStatus(signature);
    const confirmationStatus = statusResponse?.value?.confirmationStatus;

    const response = {
      found: true,
      confirmed,
      successful,
      confirmationStatus,
      blockTime: transaction.blockTime,
      slot: transaction.slot,
      error: transaction.meta?.err || null,
      fee: transaction.meta?.fee || 0,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
    };

    console.log(`[solana/transaction] Transaction found: confirmed=${confirmed}, successful=${successful}`);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[solana/transaction] Error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to check transaction',
        found: false,
        confirmed: false,
      },
      { status: 500 }
    );
  }
}

