import { NextRequest, NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';

// NOTE: This endpoint is for LEGACY flow (direct transaction submission).
// x402-compliant payments are processed server-side by agents via CDP facilitator.
// This endpoint remains for backward compatibility only.

// ✅ Backend-only RPC URL (API key stays private, never exposed to browser)
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || '';
if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/');
}

console.log('🔐 Payment verification using PRIVATE Solana RPC (API key hidden)');

/**
 * POST /api/payments/verify
 * Verify a Solana transaction matches payment requirements
 * 
 * NOTE: LEGACY ENDPOINT - x402-compliant payments use process_payment_payload on server side
 */
export async function POST(request: NextRequest) {
  try {
    const { signature, expectedRecipient, expectedAmount } = await request.json();

    if (!signature || !expectedRecipient || !expectedAmount) {
      return NextResponse.json(
        { error: 'Missing required fields: signature, expectedRecipient, expectedAmount' },
        { status: 400 }
      );
    }

    console.log('🔍 Verifying payment:');
    console.log('  Signature:', signature);
    console.log('  Expected recipient:', expectedRecipient);
    console.log('  Expected amount:', expectedAmount, 'SOL');

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Wait for transaction confirmation (with retries)
    console.log('⏳ Waiting for transaction confirmation...');
    let tx = null;
    const maxAttempts = 30; // 30 attempts
    const delayMs = 1000; // 1 second between attempts
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        tx = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });
        
        if (tx) {
          console.log(`✅ Transaction found after ${attempt} attempt(s)`);
          break;
        }
        
        if (attempt < maxAttempts) {
          console.log(`⏳ Attempt ${attempt}/${maxAttempts}: Transaction not yet confirmed, waiting ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`❌ Error fetching transaction (attempt ${attempt}):`, error);
        if (attempt === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    if (!tx) {
      return NextResponse.json(
        { 
          valid: false, 
          error: `Transaction not found after ${maxAttempts} seconds. Please check the signature and try again.`,
          hint: 'The transaction may have failed or the signature may be incorrect.'
        },
        { status: 404 }
      );
    }

    // Check if transaction succeeded
    if (tx.meta?.err) {
      return NextResponse.json(
        { 
          valid: false, 
          error: 'Transaction failed on-chain',
          details: tx.meta.err,
        },
        { status: 400 }
      );
    }

    // Parse transaction to find the transfer
    const { preBalances, postBalances } = tx.meta!;
    const accountKeys = tx.transaction.message.getAccountKeys();

    let transferAmount = 0;
    let fromAddress = '';
    let toAddress = '';
    let recipientFound = false;

    // Find balance changes
    for (let i = 0; i < preBalances.length; i++) {
      const balanceChange = postBalances[i] - preBalances[i];
      const address = accountKeys.get(i)?.toString() || '';
      
      if (balanceChange > 0) {
        // This account received SOL
        if (address === expectedRecipient) {
          recipientFound = true;
          toAddress = address;
          transferAmount = balanceChange / 1e9; // Convert lamports to SOL
        }
      } else if (balanceChange < 0 && i === 0) {
        // Sender (first account with negative balance)
        fromAddress = address;
      }
    }

    if (!recipientFound) {
      return NextResponse.json(
        { 
          valid: false, 
          error: `Payment not sent to expected recipient ${expectedRecipient}` 
        },
        { status: 400 }
      );
    }

    // Verify amount (allow 0.1% variance for rounding)
    const amountDiff = Math.abs(transferAmount - expectedAmount);
    const allowedVariance = expectedAmount * 0.001; // 0.1%
    
    if (amountDiff > allowedVariance) {
      return NextResponse.json(
        { 
          valid: false, 
          error: `Wrong amount. Expected ${expectedAmount} SOL, got ${transferAmount} SOL` 
        },
        { status: 400 }
      );
    }

    console.log('✅ Payment verified successfully!');
    console.log('  From:', fromAddress);
    console.log('  To:', toAddress);
    console.log('  Amount:', transferAmount, 'SOL');

    return NextResponse.json({
      valid: true,
      signature,
      from: fromAddress,
      to: toAddress,
      amount: transferAmount,
      timestamp: tx.blockTime,
      slot: tx.slot,
    });

  } catch (error: any) {
    console.error('❌ Payment verification error:', error);
    // Security: Don't expose detailed error messages to clients
    return NextResponse.json(
      { 
        valid: false, 
        error: 'Verification failed',
        message: 'An error occurred during payment verification. Please try again.'
      },
      { status: 500 }
    );
  }
}

