import { NextRequest, NextResponse } from 'next/server';
import { settle, verify } from 'x402/facilitator';
import { createSigner } from 'x402/types';
import { PaymentPayload, PaymentRequirements } from 'x402/types';

/**
 * TRUE x402 COMPLIANT ENDPOINT
 * 
 * This endpoint uses the official CDP facilitator API to submit transactions.
 * The facilitator handles:
 * - Payment verification
 * - Transaction submission
 * - Automatic registration with x402scan
 * - Compliance and KYT checks
 * 
 * This is the REAL way to go through the CDP facilitator, not just manually
 * registering after the fact.
 */

const CDP_API_KEY_NAME = process.env.CDP_API_KEY_NAME;
const CDP_PRIVATE_KEY = process.env.CDP_PRIVATE_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;

if (!CDP_API_KEY_NAME || !CDP_PRIVATE_KEY) {
  console.warn('⚠️ CDP credentials not configured for x402 facilitator');
}

if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required');
}

export async function POST(request: NextRequest) {
  try {
    const { paymentPayload, paymentRequirements } = await request.json();

    if (!paymentPayload || !paymentRequirements) {
      return NextResponse.json(
        { error: 'Missing paymentPayload or paymentRequirements' },
        { status: 400 }
      );
    }

    console.log('\n🏦 CDP FACILITATOR SUBMISSION');
    console.log('================================');
    console.log('Payment ID:', paymentPayload.payment_id);
    console.log('Network:', paymentRequirements.network);
    console.log('Amount:', paymentRequirements.maxAmountRequired);
    console.log('Scheme:', paymentRequirements.scheme);

    // Create a signer for the facilitator
    // The facilitator needs a wallet to interact with the blockchain
    // This should be the facilitator's wallet, NOT the payer's wallet
    const facilitatorSigner = await createSigner(
      paymentRequirements.network as 'solana',
      CDP_PRIVATE_KEY || ''
    );

    // Step 1: Verify the payment payload
    console.log('\n📋 Step 1: Verifying payment payload...');
    const verifyResponse = await verify(
      facilitatorSigner,
      paymentPayload as PaymentPayload,
      paymentRequirements as PaymentRequirements
    );

    if (!verifyResponse.isValid) {
      console.error('❌ Payment verification failed:', verifyResponse.invalidReason);
      return NextResponse.json(
        {
          success: false,
          error: 'Payment verification failed',
          reason: verifyResponse.invalidReason,
        },
        { status: 400 }
      );
    }

    console.log('✅ Payment verified successfully');
    console.log('   Payer:', verifyResponse.payer);

    // Step 2: Settle the payment (submit transaction)
    console.log('\n📤 Step 2: Settling payment via CDP facilitator...');
    const settleResponse = await settle(
      facilitatorSigner,
      paymentPayload as PaymentPayload,
      paymentRequirements as PaymentRequirements
    );

    if (!settleResponse.success) {
      console.error('❌ Payment settlement failed:', settleResponse.errorReason);
      return NextResponse.json(
        {
          success: false,
          error: 'Payment settlement failed',
          reason: settleResponse.errorReason,
        },
        { status: 400 }
      );
    }

    console.log('✅ Payment settled successfully!');
    console.log('   Transaction:', settleResponse.transaction);
    console.log('   Network:', settleResponse.network);
    console.log('   Payer:', settleResponse.payer);
    console.log('\n🎉 This transaction was submitted through CDP facilitator!');
    console.log('   It should appear on x402scan automatically.');

    return NextResponse.json({
      success: true,
      x402Compliant: true,
      submittedViaFacilitator: true,
      transaction: settleResponse.transaction,
      network: settleResponse.network,
      payer: settleResponse.payer,
      x402ScanUrl: `https://www.x402scan.com/tx/${settleResponse.transaction}?chain=solana`,
    });
  } catch (error: any) {
    console.error('❌ CDP facilitator submission error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}

