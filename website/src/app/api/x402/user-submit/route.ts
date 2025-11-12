import { NextRequest, NextResponse } from 'next/server';
import { settle, verify } from 'x402/facilitator';
import { createSigner } from 'x402/types';
import type { PaymentPayload, PaymentRequirements } from 'x402/types';
import { Connection, PublicKey } from '@solana/web3.js';
import base58 from 'bs58';

/**
 * USER PAYMENT SUBMISSION ENDPOINT
 * 
 * This endpoint allows users (frontend) to submit signed payment payloads
 * through the CDP facilitator. This is the proper x402 flow where:
 * 
 * 1. User signs payment authorization in their wallet
 * 2. Frontend sends signed payload to this endpoint
 * 3. Backend verifies signature and creates proper x402 payload
 * 4. Backend submits through CDP facilitator (verify + settle)
 * 5. Returns transaction hash to user
 * 6. User sends transaction hash to agent for verification
 * 
 * This keeps API keys secure on the backend while allowing users to
 * properly submit payments through the x402 facilitator.
 */

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_SOLANA_PRIVATE_KEY;

if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required');
}

if (!FACILITATOR_PRIVATE_KEY) {
  console.warn('⚠️ FACILITATOR_SOLANA_PRIVATE_KEY not configured');
}

interface SignedTransaction {
  payment_id: string;
  transaction_base64: string;
  from: string;
  to: string;
  amount_usdc: number;
}

interface X402PaymentRequest {
  payment_id: string;
  recipient_address: string;
  amount_usdc: number;
  service_type: string;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const { signedTransaction, paymentRequest } = await request.json();

    if (!signedTransaction || !paymentRequest) {
      return NextResponse.json(
        { error: 'Missing signedTransaction or paymentRequest' },
        { status: 400 }
      );
    }

    console.log('\n' + '='.repeat(80));
    console.log('💰 USER PAYMENT SUBMISSION (x402 Facilitator)');
    console.log('='.repeat(80));
    console.log('Payment ID:', signedTransaction.payment_id);
    console.log('From:', signedTransaction.from.substring(0, 8) + '...' + signedTransaction.from.substring(signedTransaction.from.length - 8));
    console.log('To:', signedTransaction.to.substring(0, 8) + '...' + signedTransaction.to.substring(signedTransaction.to.length - 8));
    console.log('Amount:', paymentRequest.amount_usdc, 'USDC');
    console.log('Service:', paymentRequest.service_type);

    // Verify basic transaction structure
    const required = ['payment_id', 'transaction_base64', 'from', 'to', 'amount_usdc'];
    const missing = required.filter(field => !signedTransaction[field]);
    
    if (missing.length > 0) {
      console.error('❌ Missing required fields:', missing.join(', '));
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    // Build x402 payment payload with signed transaction
    console.log('\n🔨 Step 1: Building x402 payment payload...');
    const x402Payload = buildX402PayloadFromTransaction(signedTransaction);
    console.log('✅ x402 payload built');

    // Build payment requirements
    console.log('\n📋 Step 2: Building payment requirements...');
    const x402Requirements = buildX402Requirements(paymentRequest);
    console.log('✅ Payment requirements built');

    // Create facilitator signer
    console.log('\n🔐 Step 3: Creating facilitator signer...');
    
    if (!FACILITATOR_PRIVATE_KEY) {
      console.error('❌ Facilitator private key not configured');
      return NextResponse.json(
        { error: 'Facilitator not configured' },
        { status: 500 }
      );
    }

    const facilitatorSigner = await createSigner(
      'solana',
      FACILITATOR_PRIVATE_KEY
    );
    console.log('✅ Facilitator signer created');

    // Verify via facilitator
    console.log('\n📋 Step 4: Verifying payment via facilitator...');
    const verifyResult = await verify(
      facilitatorSigner,
      x402Payload as PaymentPayload,
      x402Requirements as PaymentRequirements
    );

    if (!verifyResult.isValid) {
      console.error('❌ Facilitator verification failed:', verifyResult.invalidReason);
      return NextResponse.json(
        {
          error: 'Payment verification failed',
          reason: verifyResult.invalidReason,
        },
        { status: 400 }
      );
    }

    console.log('✅ Payment verified by facilitator');
    console.log('   Payer:', verifyResult.payer);

    // Settle via facilitator
    console.log('\n📤 Step 5: Settling payment via facilitator...');
    const settleResult = await settle(
      facilitatorSigner,
      x402Payload as PaymentPayload,
      x402Requirements as PaymentRequirements
    );

    if (!settleResult.success) {
      console.error('❌ Facilitator settlement failed:', settleResult.errorReason);
      return NextResponse.json(
        {
          error: 'Payment settlement failed',
          reason: settleResult.errorReason,
        },
        { status: 400 }
      );
    }

    console.log('='.repeat(80));
    console.log('✅ PAYMENT SUBMITTED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('Transaction:', settleResult.transaction);
    console.log('Network:', settleResult.network);
    console.log('Payer:', settleResult.payer);
    console.log('');
    console.log('🎉 x402 COMPLIANT:');
    console.log('   ✅ Submitted via CDP facilitator');
    console.log('   ✅ Automatically registered with x402scan');
    console.log('='.repeat(80));
    console.log('');

    const x402ScanUrl = `https://www.x402scan.com/tx/${settleResult.transaction}?chain=solana`;
    const solanaExplorer = `https://explorer.solana.com/tx/${settleResult.transaction}`;

    return NextResponse.json({
      success: true,
      transaction: settleResult.transaction,
      network: settleResult.network,
      payer: settleResult.payer,
      x402Compliant: true,
      submittedViaFacilitator: true,
      facilitator: 'CDP',
      x402ScanUrl,
      solanaExplorer,
      paymentId: signedTransaction.payment_id,
      amount: paymentRequest.amount_usdc,
      currency: 'USDC',
    });

  } catch (error: any) {
    console.error('❌ User payment submission error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Payment submission failed',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}

/**
 * Build x402 payment payload from signed transaction
 * 
 * The x402 "exact" scheme for Solana requires a base64-encoded signed transaction
 */
function buildX402PayloadFromTransaction(signedTx: SignedTransaction): object {
  return {
    x402Version: 1,
    scheme: 'exact',
    network: 'solana',
    payload: {
      transaction: signedTx.transaction_base64
    }
  };
}

/**
 * Build x402 payment requirements
 */
function buildX402Requirements(paymentRequest: X402PaymentRequest): object {
  // Convert USDC to micro-USDC (USDC has 6 decimals)
  const microUsdc = Math.floor(paymentRequest.amount_usdc * 1_000_000);
  const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  
  return {
    network: 'solana',
    scheme: 'exact',
    payTo: paymentRequest.recipient_address,
    maxAmountRequired: microUsdc.toString(),
    asset: usdcMint,  // USDC mint address (REQUIRED for x402!)
    resource: `pardon-simulator://${paymentRequest.service_type}`,
  };
}

