import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';

/**
 * GET /api/solana/blockhash
 * Get the latest blockhash for transaction building
 * Proxies to Helius to avoid rate limits
 */
export async function GET() {
  try {
    // Get RPC URL from environment (check multiple possible env var names)
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 
                          process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
                          'https://api.mainnet-beta.solana.com';
    
    console.log('📦 Getting latest blockhash via backend proxy...');
    console.log('Using RPC:', SOLANA_RPC_URL.substring(0, 30) + '...');
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    console.log('✅ Blockhash retrieved:', blockhash.substring(0, 10) + '...');
    
    return NextResponse.json({
      blockhash,
      lastValidBlockHeight,
    });
    
  } catch (error: any) {
    console.error('❌ Blockhash error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get blockhash' },
      { status: 500 }
    );
  }
}

