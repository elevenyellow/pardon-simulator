import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';

export async function POST(request: NextRequest) {
  try {
    // Get RPC URL from environment (check multiple possible env var names)
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 
                          process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
                          'https://api.mainnet-beta.solana.com';
    
    const { accounts, mint } = await request.json();

    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json(
        { error:'accounts array is required'},
        { status: 400 }
      );
    }

    console.log(`Checking ${accounts.length} token accounts...`);

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const mintPubkey = new PublicKey(mint);

    const accountsStatus = await Promise.all(
      accounts.map(async (account: any) => {
        try {
          const accountPubkey = new PublicKey(account.address);
          
          // Try to get account info
          const accountInfo = await connection.getAccountInfo(accountPubkey);
          
          if (!accountInfo) {
            console.log(`${account.name} account does not exist: ${account.address}`);
            return {
              name: account.name,
              address: account.address,
              owner: account.owner,
              exists: false,
              hasBalance: false,
              balance: 0
            };
          }

          // Account exists, get token account data
          try {
            const tokenAccount = await getAccount(connection, accountPubkey);
            const balance = Number(tokenAccount.amount);
            const hasBalance = balance > 0;

            console.log(`${account.name} account exists with balance: ${balance} micro-USDC`);

            return {
              name: account.name,
              address: account.address,
              owner: account.owner,
              exists: true,
              hasBalance,
              balance
            };
          } catch (tokenError) {
            console.log(`${account.name} account exists but is not a valid token account`);
            return {
              name: account.name,
              address: account.address,
              owner: account.owner,
              exists: false,
              hasBalance: false,
              balance: 0,
              error:'Not a valid token account'            };
          }
        } catch (error: any) {
          console.error(`Error checking ${account.name}:`, error.message);
          return {
            name: account.name,
            address: account.address,
            owner: account.owner,
            exists: false,
            hasBalance: false,
            balance: 0,
            error: error.message
          };
        }
      })
    );

    console.log('[solana] Token account check complete');

    return NextResponse.json({
      success: true,
      accounts: accountsStatus
    });

  } catch (error: any) {
    console.error('Check token accounts error:', error);
    return NextResponse.json(
      { error:'Failed to check token accounts', details: error.message },
      { status: 500 }
    );
  }
}

