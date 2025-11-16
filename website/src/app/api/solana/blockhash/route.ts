import { NextResponse } from'next/server';
import { Connection } from'@solana/web3.js';

//  Backend-only Solana RPC URL (never exposed to browser)
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ||'';
if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/');
}

/**
 * GET /api/solana/blockhash
 * Get the latest blockhash for transaction building
 * Proxies to Helius to avoid rate limits
 */
export async function GET() {
  try {
    console.log('📦 Getting latest blockhash via backend proxy...');
    
    const connection = new Connection(SOLANA_RPC_URL,'confirmed');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    console.log('Blockhash retrieved:', blockhash.substring(0, 10) +'...');
    
    return NextResponse.json({
      blockhash,
      lastValidBlockHeight,
    });
    
  } catch (error: any) {
    console.error('Blockhash error:', error);
    return NextResponse.json(
      { error: error.message ||'Failed to get blockhash'},
      { status: 500 }
    );
  }
}

