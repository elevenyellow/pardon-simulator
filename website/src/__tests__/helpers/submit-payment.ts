/**
 * Submit Payment Helper
 * Replicates the exact browser payment flow programmatically for tests
 */

import { Connection, Transaction, PublicKey, ComputeBudgetProgram } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { TestWallet } from '@/lib/testing/test-wallet';
import { PaymentRequest } from '@/lib/api-client';
import { TEST_CONFIG } from '../../../test.config';

export interface PaymentSubmissionResult {
  success: boolean;
  x402Payload?: any;
  error?: string;
}

/**
 * Create USDC transaction - EXACT REPLICA of browser createUSDCTransaction()
 * This creates the SAME transaction that would be sent to the browser wallet
 */
export async function createUSDCTransactionForTest(
  paymentId: string,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountUsdc: number,
  testWallet: TestWallet,
  baseUrl: string
): Promise<{ transaction_base64: string; payment_id: string; from: string; to: string }> {
  
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const USDC_DECIMALS = 6;

  // CDP facilitator address that will cosign (SAME as browser)
  const CDP_FACILITATOR = new PublicKey('L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg');

  // Convert USDC to micro-USDC (smallest unit)
  const microUsdc = Math.floor(amountUsdc * Math.pow(10, USDC_DECIMALS));

  // Get associated token accounts
  const fromAta = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
  const toAta = await getAssociatedTokenAddress(USDC_MINT, toPubkey);
  
  // Get recent blockhash from backend (SAME endpoint as browser)
  console.log('[TEST_PAYMENT] Getting blockhash from backend');
  const blockhashResponse = await fetch(`${baseUrl}/api/solana/blockhash`);
  if (!blockhashResponse.ok) {
    throw new Error('Failed to get blockhash from backend');
  }
  const { blockhash, lastValidBlockHeight } = await blockhashResponse.json();
  
  console.log('[TEST_PAYMENT] Creating transaction with CDP facilitator as fee payer');
  
  // Create transaction with CDP facilitator as fee payer (SAME as browser)
  const transaction = new Transaction({
    feePayer: CDP_FACILITATOR,  // ← CDP pays fees and will cosign
    blockhash,
    lastValidBlockHeight
  });
  
  // Add compute budget (SAME as browser)
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
  
  // Check if recipient ATA exists (SAME endpoint as browser)
  console.log('[TEST_PAYMENT] Checking if recipient token account exists');
  const checkResponse = await fetch(`${baseUrl}/api/solana/check-token-accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accounts: [{ 
        address: toAta.toString(), 
        owner: toPubkey.toString(), 
        name: 'recipient'
      }],
      mint: USDC_MINT.toString()
    })
  });
  
  if (!checkResponse.ok) {
    throw new Error('Failed to check token accounts');
  }
  
  const { accounts } = await checkResponse.json();
  const recipientExists = accounts[0]?.exists;
  
  // Create recipient ATA if needed (SAME as browser)
  if (!recipientExists) {
    console.log('[TEST_PAYMENT] Adding create ATA instruction (CDP pays)');
    transaction.add(
      createAssociatedTokenAccountInstruction(
        CDP_FACILITATOR, // payer (CDP pays for ATA creation)
        toAta,           // ata address
        toPubkey,        // owner
        USDC_MINT        // mint
      )
    );
  }
  
  // Add USDC transfer instruction (SAME as browser)
  console.log('[TEST_PAYMENT] Adding USDC transfer instruction');
  transaction.add(
    createTransferCheckedInstruction(
      fromAta,      // from token account
      USDC_MINT,    // mint
      toAta,        // to token account
      fromPubkey,   // owner (user signs as transfer authority)
      microUsdc,    // amount
      USDC_DECIMALS // decimals
    )
  );
  
  console.log('[TEST_PAYMENT] Signing transaction with test wallet (replaces browser wallet popup)');
  
  // Sign the transaction programmatically (THIS replaces browser wallet popup)
  const signedTransaction = await testWallet.signTransaction(transaction);
  
  // Serialize with PARTIAL signatures (user signed, CDP will cosign) - SAME as browser
  const serialized = signedTransaction.serialize({ 
    requireAllSignatures: false,
    verifySignatures: false
  });
  const transaction_base64 = Buffer.from(serialized).toString('base64');
  
  // Return SAME format as browser createUSDCTransaction()
  return {
    transaction_base64,
    payment_id: paymentId,
    from: fromPubkey.toString(),
    to: toPubkey.toString()
  };
}

/**
 * Submit payment using EXACT browser flow
 * This replicates what ChatInterface.tsx does when handling payments
 */
export async function submitPayment(
  paymentRequest: PaymentRequest,
  testWallet: TestWallet,
  baseUrl: string = TEST_CONFIG.endpoints.backend
): Promise<PaymentSubmissionResult> {
  try {
    console.log('[TEST_PAYMENT] Creating USDC transaction (browser flow)');
    console.log('[TEST_PAYMENT] Amount:', paymentRequest.amount_usdc, 'USDC');
    console.log('[TEST_PAYMENT] Recipient:', paymentRequest.recipient_address);
    console.log('[TEST_PAYMENT] Payment ID:', paymentRequest.payment_id);

    const fromPubkey = testWallet.publicKey;
    const toPubkey = new PublicKey(paymentRequest.recipient_address);
    
    // Step 1: Create and sign transaction (SAME as browser createUSDCTransaction)
    const signedTx = await createUSDCTransactionForTest(
      paymentRequest.payment_id,
      fromPubkey,
      toPubkey,
      paymentRequest.amount_usdc,
      testWallet,
      baseUrl
    );
    
    console.log('[TEST_PAYMENT] Transaction signed successfully');
    
    // Step 2: Build x402 payload (EXACT SAME as browser)
    const x402Payload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'solana',
      payload: {
        transaction: signedTx.transaction_base64
      },
      paymentId: signedTx.payment_id,
      from: signedTx.from,
      to: signedTx.to,
      amount_usdc: paymentRequest.amount_usdc
    };
    
    console.log('[TEST_PAYMENT] ✅ Payment payload created (browser flow)');
    console.log('[TEST_PAYMENT] Ready to retry /api/chat/send with X-PAYMENT header');
    
    return {
      success: true,
      x402Payload
    };
    
  } catch (error) {
    console.error('[TEST_PAYMENT] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Wait for payment confirmation on-chain
 */
export async function waitForPaymentConfirmation(
  signature: string,
  timeout: number = 30000
): Promise<boolean> {
  console.log('[TEST_PAYMENT] Waiting for payment confirmation');
  console.log('[TEST_PAYMENT] Signature:', signature);
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Check payment status via backend
      const response = await fetch(`${TEST_CONFIG.endpoints.backend}/api/solana/transaction/${signature}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.confirmed) {
          console.log('[TEST_PAYMENT] ✅ Payment confirmed on-chain');
          return true;
        }
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('[TEST_PAYMENT] Error checking confirmation:', error);
    }
  }
  
  console.warn('[TEST_PAYMENT] ⚠️ Payment confirmation timeout');
  return false;
}
