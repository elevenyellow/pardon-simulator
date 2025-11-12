import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { standardRateLimiter } from '@/lib/middleware/rate-limit';

/**
 * AGENT PAYMENT VERIFICATION ENDPOINT
 * 
 * This endpoint allows agents to verify that a payment transaction:
 * 1. Exists on-chain and is confirmed
 * 2. Matches the expected parameters (from, to, amount, currency)
 * 3. Was successfully completed
 * 
 * This is the verification step in the x402 flow:
 * 1. User submits payment via /api/x402/user-submit
 * 2. User receives transaction hash
 * 3. User sends transaction hash to agent
 * 4. Agent calls this endpoint to verify payment
 * 5. Agent delivers service after verification
 * 
 * This keeps verification logic on the backend where it can access
 * the blockchain RPC without exposing credentials.
 */

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || '';

if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required');
}

// USDC mint address on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

interface VerificationRequest {
  transaction: string;
  expectedFrom: string;
  expectedTo: string;
  expectedAmount: number;
  expectedCurrency: string;
}

interface TransactionDetails {
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp: number;
  confirmed: boolean;
}

async function handlePOST(request: NextRequest) {
  try {
    const body: VerificationRequest = await request.json();
    const { transaction, expectedFrom, expectedTo, expectedAmount, expectedCurrency } = body;

    if (!transaction || !expectedFrom || !expectedTo || !expectedAmount || !expectedCurrency) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('\n' + '='.repeat(80));
    console.log('🔍 PAYMENT VERIFICATION (Agent Request)');
    console.log('='.repeat(80));
    console.log('Transaction:', transaction.substring(0, 16) + '...' + transaction.substring(transaction.length - 16));
    console.log('Expected From:', expectedFrom.substring(0, 8) + '...' + expectedFrom.substring(expectedFrom.length - 8));
    console.log('Expected To:', expectedTo.substring(0, 8) + '...' + expectedTo.substring(expectedTo.length - 8));
    console.log('Expected Amount:', expectedAmount, expectedCurrency);

    // Connect to Solana
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Fetch transaction from blockchain
    console.log('\n📡 Step 1: Fetching transaction from blockchain...');
    const tx = await connection.getTransaction(transaction, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      console.error('❌ Transaction not found on blockchain');
      return NextResponse.json(
        {
          verified: false,
          error: 'Transaction not found on blockchain',
          transaction,
        },
        { status: 404 }
      );
    }

    console.log('✅ Transaction found on blockchain');
    console.log('   Block Time:', new Date((tx.blockTime || 0) * 1000).toISOString());
    console.log('   Slot:', tx.slot);

    // Check if transaction was successful
    if (tx.meta?.err) {
      console.error('❌ Transaction failed on-chain:', tx.meta.err);
      return NextResponse.json(
        {
          verified: false,
          error: 'Transaction failed on-chain',
          details: tx.meta.err,
        },
        { status: 400 }
      );
    }

    console.log('✅ Transaction was successful');

    // Extract transaction details
    console.log('\n🔍 Step 2: Extracting transaction details...');
    const details = await extractTransactionDetails(tx, connection, expectedCurrency);

    if (!details) {
      console.error('❌ Could not extract transaction details');
      return NextResponse.json(
        {
          verified: false,
          error: 'Could not extract transaction details',
        },
        { status: 400 }
      );
    }

    console.log('✅ Transaction details extracted');
    console.log('   From:', details.from.substring(0, 8) + '...' + details.from.substring(details.from.length - 8));
    console.log('   To:', details.to.substring(0, 8) + '...' + details.to.substring(details.to.length - 8));
    console.log('   Amount:', details.amount, details.currency);

    // Verify transaction matches expectations
    console.log('\n✅ Step 3: Verifying transaction matches expectations...');
    
    const fromMatches = details.from === expectedFrom;
    const toMatches = details.to === expectedTo;
    const amountMatches = Math.abs(details.amount - expectedAmount) < 0.000001; // Allow small floating point differences
    const currencyMatches = details.currency === expectedCurrency;

    console.log('   From matches:', fromMatches);
    console.log('   To matches:', toMatches);
    console.log('   Amount matches:', amountMatches, `(${details.amount} vs ${expectedAmount})`);
    console.log('   Currency matches:', currencyMatches);

    const verified = fromMatches && toMatches && amountMatches && currencyMatches;

    if (!verified) {
      const mismatches = [];
      if (!fromMatches) mismatches.push(`from (expected ${expectedFrom}, got ${details.from})`);
      if (!toMatches) mismatches.push(`to (expected ${expectedTo}, got ${details.to})`);
      if (!amountMatches) mismatches.push(`amount (expected ${expectedAmount}, got ${details.amount})`);
      if (!currencyMatches) mismatches.push(`currency (expected ${expectedCurrency}, got ${details.currency})`);

      console.error('❌ Transaction verification failed:', mismatches.join(', '));
      return NextResponse.json(
        {
          verified: false,
          error: 'Transaction details do not match expectations',
          mismatches,
          expected: { from: expectedFrom, to: expectedTo, amount: expectedAmount, currency: expectedCurrency },
          actual: details,
        },
        { status: 400 }
      );
    }

    console.log('='.repeat(80));
    console.log('✅ PAYMENT VERIFIED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('Transaction:', transaction);
    console.log('From:', details.from);
    console.log('To:', details.to);
    console.log('Amount:', details.amount, details.currency);
    console.log('Timestamp:', new Date(details.timestamp * 1000).toISOString());
    console.log('='.repeat(80));
    console.log('');

    return NextResponse.json({
      verified: true,
      transaction,
      details: {
        from: details.from,
        to: details.to,
        amount: details.amount,
        currency: details.currency,
        timestamp: details.timestamp,
        confirmed: details.confirmed,
      },
      solanaExplorer: `https://explorer.solana.com/tx/${transaction}`,
      x402ScanUrl: `https://www.x402scan.com/tx/${transaction}?chain=solana`,
    });

  } catch (error: any) {
    console.error('❌ Payment verification error:', error);
    // Security: Don't expose stack traces or detailed error messages to clients
    return NextResponse.json(
      {
        verified: false,
        error: 'Verification failed',
        message: 'An error occurred during transaction verification. Please try again.'
      },
      { status: 500 }
    );
  }
}

// Apply rate limiting to POST endpoint
export async function POST(request: NextRequest) {
  return standardRateLimiter(request, handlePOST);
}

/**
 * Extract transaction details from a Solana transaction
 */
async function extractTransactionDetails(
  tx: any,
  connection: Connection,
  expectedCurrency: string
): Promise<TransactionDetails | null> {
  try {
    const accountKeys = tx.transaction.message.accountKeys;
    
    // For USDC (SPL Token) transfers
    if (expectedCurrency === 'USDC') {
      return await extractUSDCTransferDetails(tx, connection, accountKeys);
    }
    
    // For native SOL transfers
    if (expectedCurrency === 'SOL') {
      return await extractSOLTransferDetails(tx, accountKeys);
    }

    return null;
  } catch (error) {
    console.error('Error extracting transaction details:', error);
    return null;
  }
}

/**
 * Extract USDC transfer details from SPL token transfer
 */
async function extractUSDCTransferDetails(
  tx: any,
  connection: Connection,
  accountKeys: any[]
): Promise<TransactionDetails | null> {
  try {
    // Look for token transfer in the transaction
    const preTokenBalances = tx.meta?.preTokenBalances || [];
    const postTokenBalances = tx.meta?.postTokenBalances || [];

    // Find the USDC transfers
    const usdcTransfers = [];
    
    for (let i = 0; i < preTokenBalances.length; i++) {
      const preBalance = preTokenBalances[i];
      const postBalance = postTokenBalances.find((p: any) => p.accountIndex === preBalance.accountIndex);
      
      if (!postBalance) continue;
      
      // Check if this is USDC
      if (preBalance.mint !== USDC_MINT) continue;
      
      const preAmount = parseFloat(preBalance.uiTokenAmount.uiAmount || '0');
      const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmount || '0');
      const diff = postAmount - preAmount;
      
      if (diff !== 0) {
        // Get the owner of this token account
        const tokenAccountPubkey = accountKeys[preBalance.accountIndex];
        const owner = preBalance.owner;
        
        usdcTransfers.push({
          accountIndex: preBalance.accountIndex,
          owner,
          diff,
          tokenAccount: tokenAccountPubkey.toString(),
        });
      }
    }

    // Find sender (negative diff) and receiver (positive diff)
    const sender = usdcTransfers.find(t => t.diff < 0);
    const receiver = usdcTransfers.find(t => t.diff > 0);

    if (!sender || !receiver) {
      console.error('Could not identify sender and receiver in USDC transfer');
      return null;
    }

    return {
      from: sender.owner,
      to: receiver.owner,
      amount: Math.abs(sender.diff),
      currency: 'USDC',
      timestamp: tx.blockTime || 0,
      confirmed: true,
    };

  } catch (error) {
    console.error('Error extracting USDC transfer details:', error);
    return null;
  }
}

/**
 * Extract SOL transfer details from native transfer
 */
async function extractSOLTransferDetails(
  tx: any,
  accountKeys: any[]
): Promise<TransactionDetails | null> {
  try {
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];

    // Find accounts with balance changes
    const transfers = [];
    
    for (let i = 0; i < preBalances.length; i++) {
      const diff = postBalances[i] - preBalances[i];
      if (diff !== 0) {
        transfers.push({
          accountIndex: i,
          address: accountKeys[i].toString(),
          diff: diff / 1e9, // Convert lamports to SOL
        });
      }
    }

    // Find sender (negative diff, not fee payer for fees) and receiver (positive diff)
    // Note: Account 0 is usually the fee payer and will have a negative balance for fees
    const receiver = transfers.find(t => t.diff > 0);
    const sender = transfers.find(t => t.diff < 0 && t.accountIndex !== 0);

    if (!sender || !receiver) {
      console.error('Could not identify sender and receiver in SOL transfer');
      return null;
    }

    return {
      from: sender.address,
      to: receiver.address,
      amount: Math.abs(sender.diff),
      currency: 'SOL',
      timestamp: tx.blockTime || 0,
      confirmed: true,
    };

  } catch (error) {
    console.error('Error extracting SOL transfer details:', error);
    return null;
  }
}

