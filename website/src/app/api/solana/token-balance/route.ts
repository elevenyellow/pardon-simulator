import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;

if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required');
}

/**
 * POST /api/solana/token-balance
 * 
 * Check SPL token balance for a wallet using backend RPC (Helius)
 * Never expose RPC endpoints to frontend!
 */
export async function POST(request: NextRequest) {
  try {
    const { walletAddress, tokenMint, decimals = 6 } = await request.json();
    
    if (!walletAddress || !tokenMint) {
      return NextResponse.json(
        { error: 'Missing walletAddress or tokenMint' },
        { status: 400 }
      );
    }
    
    // Use backend Helius RPC (secure, not exposed to frontend)
    const connection = new Connection(SOLANA_RPC_URL!, 'confirmed');
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(tokenMint);
    
    console.log(`[Token Balance] Checking balance for wallet: ${walletAddress.substring(0, 8)}... token: ${tokenMint.substring(0, 8)}...`);
    
    // Get associated token account
    const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
    
    try {
      const tokenAccount = await getAccount(connection, ata);
      const balance = Number(tokenAccount.amount) / Math.pow(10, decimals);
      
      console.log(`[Token Balance] Found balance: ${balance}`);
      
      return NextResponse.json({ 
        balance,
        exists: true,
        ata: ata.toString()
      });
    } catch (error: any) {
      // Token account doesn't exist = 0 balance
      if (error.name === 'TokenAccountNotFoundError' || error.message?.includes('could not find account')) {
        console.log('[Token Balance] Token account not found (balance: 0)');
        return NextResponse.json({ 
          balance: 0,
          exists: false,
          ata: ata.toString()
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[Token Balance] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch token balance', details: error.message },
      { status: 500 }
    );
  }
}
