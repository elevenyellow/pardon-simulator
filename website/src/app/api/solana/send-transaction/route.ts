import { NextRequest, NextResponse } from 'next/server';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';

// ✅ This API key is PRIVATE (no NEXT_PUBLIC_ prefix)
// It stays on the server and is never exposed to the browser
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || '';
if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/');
}

/**
 * POST /api/solana/send-transaction
 * Proxy for sending Solana transactions
 * Keeps RPC API key private on the backend
 */
export async function POST(request: NextRequest) {
  try {
    const { serializedTransaction } = await request.json();

    if (!serializedTransaction) {
      return NextResponse.json(
        { error: 'Missing serializedTransaction' },
        { status: 400 }
      );
    }

    console.log('📤 Proxying transaction to Solana...');

    // Create connection on backend (API key stays private)
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Deserialize transaction
    const transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));

    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('✅ Transaction sent:', signature);

    return NextResponse.json({
      signature,
    });

  } catch (error: any) {
    console.error('❌ Transaction send error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send transaction' },
      { status: 500 }
    );
  }
}

