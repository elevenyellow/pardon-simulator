/**
 * Payment Verification Helper
 * Check that payments were processed correctly
 */

import { Connection, PublicKey } from '@solana/web3.js';

export interface PaymentVerification {
  verified: boolean;
  signature: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp?: number;
  error?: string;
}

/**
 * Verify payment on Solana blockchain
 */
export async function verifyPaymentOnChain(
  signature: string,
  expectedFrom: string,
  expectedTo: string,
  expectedAmount: number,
  connection?: Connection
): Promise<PaymentVerification> {
  console.log('[TEST_HELPER] Verifying payment on-chain', {
    signature: signature.slice(0, 16) + '...',
    expectedFrom: expectedFrom.slice(0, 8) + '...',
    expectedTo: expectedTo.slice(0, 8) + '...',
    expectedAmount,
  });

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const conn = connection || new Connection(rpcUrl, 'confirmed');

  try {
    // Fetch transaction details
    const tx = await conn.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return {
        verified: false,
        signature,
        from: '',
        to: '',
        amount: 0,
        currency: 'SOL',
        error: 'Transaction not found on blockchain',
      };
    }

    // Check if transaction succeeded
    if (tx.meta?.err) {
      return {
        verified: false,
        signature,
        from: '',
        to: '',
        amount: 0,
        currency: 'SOL',
        error: `Transaction failed: ${JSON.stringify(tx.meta.err)}`,
      };
    }

    // Extract account keys and balances
    const accountKeys = tx.transaction.message.getAccountKeys();
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];

    // Find sender and recipient
    let from = '';
    let to = '';
    let actualAmount = 0;

    for (let i = 0; i < accountKeys.length; i++) {
      const account = accountKeys.get(i);
      if (!account) continue;

      const accountStr = account.toString();
      const balanceChange = postBalances[i] - preBalances[i];
      const balanceChangeSol = balanceChange / 1e9;

      if (balanceChange < 0 && !from) {
        from = accountStr;
      }

      if (balanceChange > 0 && accountStr === expectedTo) {
        to = accountStr;
        actualAmount = balanceChangeSol;
      }
    }

    // Verify expected values
    const amountMatches = Math.abs(actualAmount - expectedAmount) < 0.000001;
    const fromMatches = from === expectedFrom;
    const toMatches = to === expectedTo;

    const verified = amountMatches && fromMatches && toMatches;

    if (!verified) {
      console.warn('[TEST_HELPER] Payment verification failed', {
        expectedFrom,
        actualFrom: from,
        expectedTo,
        actualTo: to,
        expectedAmount,
        actualAmount,
        fromMatches,
        toMatches,
        amountMatches,
      });
    }

    return {
      verified,
      signature,
      from,
      to,
      amount: actualAmount,
      currency: 'SOL',
      timestamp: tx.blockTime || undefined,
      error: verified ? undefined : 'Payment details do not match expected values',
    };
  } catch (error) {
    return {
      verified: false,
      signature,
      from: '',
      to: '',
      amount: 0,
      currency: 'SOL',
      error: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verify payment via backend API
 */
export async function verifyPaymentViaBackend(
  signature: string,
  expectedFrom: string,
  expectedTo: string,
  expectedAmount: number,
  currency: string = 'USDC'
): Promise<PaymentVerification> {
  console.log('[TEST_HELPER] Verifying payment via backend', {
    signature: signature.slice(0, 16) + '...',
    expectedFrom: expectedFrom.slice(0, 8) + '...',
    expectedTo: expectedTo.slice(0, 8) + '...',
    expectedAmount,
    currency,
  });

  try {
    const response = await fetch('/api/x402/verify-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction: signature,
        expectedFrom,
        expectedTo,
        expectedAmount,
        expectedCurrency: currency,
      }),
    });

    const data = await response.json();

    if (response.status === 404) {
      return {
        verified: false,
        signature,
        from: '',
        to: '',
        amount: 0,
        currency,
        error: 'Transaction not found',
      };
    }

    if (!response.ok) {
      return {
        verified: false,
        signature,
        from: '',
        to: '',
        amount: 0,
        currency,
        error: data.error || 'Backend verification failed',
      };
    }

    if (!data.verified) {
      return {
        verified: false,
        signature,
        from: data.actual?.from || '',
        to: data.actual?.to || '',
        amount: data.actual?.amount || 0,
        currency: data.actual?.currency || currency,
        error: data.error || 'Verification failed',
      };
    }

    return {
      verified: true,
      signature,
      from: data.details.from,
      to: data.details.to,
      amount: data.details.amount,
      currency: data.details.currency,
      timestamp: data.details.timestamp,
    };
  } catch (error) {
    return {
      verified: false,
      signature,
      from: '',
      to: '',
      amount: 0,
      currency,
      error: `Backend request error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if payment is stored in database
 */
export async function isPaymentInDatabase(signature: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/payments/verify?signature=${signature}`);
    const data = await response.json();
    return data.verified === true;
  } catch (error) {
    console.error('[TEST_HELPER] Error checking payment in database:', error);
    return false;
  }
}

/**
 * Wait for payment to be confirmed on-chain
 */
export async function waitForPaymentConfirmation(
  signature: string,
  timeout: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  console.log('[TEST_HELPER] Waiting for payment confirmation', {
    signature: signature.slice(0, 16) + '...',
    timeout,
  });

  while (Date.now() - startTime < timeout) {
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        'confirmed'
      );

      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (tx && !tx.meta?.err) {
        console.log('[TEST_HELPER] Payment confirmed', {
          signature: signature.slice(0, 16) + '...',
          elapsed: Date.now() - startTime,
        });
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      // Continue polling on error
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  console.warn('[TEST_HELPER] Payment confirmation timeout', {
    signature: signature.slice(0, 16) + '...',
    timeout,
  });

  return false;
}

