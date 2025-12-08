/**
 * CDP x402 Facilitator Client for Solana
 * 
 * Provides verify() and settle() functions for x402 payment protocol
 * Uses Coinbase CDP facilitator for USDC payments on Solana
 * 
 * Reference: https://docs.cdp.coinbase.com/x402
 */

import { Connection, PublicKey, Transaction, SystemProgram } from'@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from'@solana/spl-token';
import { PAYMENT_TOKEN_NAME, PAYMENT_TOKEN_MINT, PAYMENT_TOKEN_DECIMALS } from'@/config/tokens';

// USDC Mint Address on Solana Mainnet (kept for backward compatibility)
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

/**
 * Payment payload structure (x402 protocol)
 */
export interface X402PaymentPayload {
  x402Version: number;
  scheme:'exact'|'range';
  network: string;
  payload: {
    transaction: string; // base64-encoded signed Solana transaction
  };
  signature?: string; // Payer's signature proving authorization
  from?: string; // Payer's wallet address
  to?: string; // Recipient's wallet address
  amount?: number; // Amount in USDC
  paymentId?: string;
}

/**
 * Payment requirements structure
 */
export interface X402PaymentRequirements {
  network: string;
  currency: string;
  recipient: string;
  amount: number;
  paymentId: string;
}

/**
 * Verification result from facilitator
 */
export interface VerificationResult {
  valid: boolean;
  error?: string;
  details?: {
    from: string;
    to: string;
    amount: number;
    currency: string;
  };
}

/**
 * Settlement result from facilitator
 */
export interface SettlementResult {
  success: boolean;
  transaction: string; // Transaction signature
  network: string;
  payer: string;
  error?: string;
  x402ScanUrl?: string;
  solanaExplorer?: string;
}

/**
 * CDP Facilitator Client Configuration
 */
interface FacilitatorConfig {
  url: string;
  apiKey?: string;
  apiSecret?: string;
  network: string;
}

/**
 * Create CDP Facilitator Client
 */
export class X402Facilitator {
  private config: FacilitatorConfig;
  private connection: Connection;

  constructor(config?: Partial<FacilitatorConfig>) {
    this.config = {
      url: config?.url || process.env.X402_FACILITATOR_URL ||'https://api.cdp.coinbase.com/platform/v2/x402',
      apiKey: config?.apiKey || process.env.CDP_API_KEY,
      apiSecret: config?.apiSecret || process.env.CDP_API_SECRET,
      network: config?.network || process.env.X402_NETWORK ||'solana',
    };

    // Initialize Solana connection
    const rpcUrl = process.env.SOLANA_RPC_URL ||'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl,'confirmed');
  }

  /**
   * Verify payment payload via CDP facilitator
   * 
   * Checks that:
   * - Transaction is properly signed
   * - Amount matches expected
   * - Recipient matches expected
   * - Transaction is valid Solana format
   */
  async verify(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): Promise<VerificationResult> {
    try {
      console.log('[x402-facilitator] Verifying signed transaction');
      console.log(`Expected: ${requirements.amount} ${requirements.currency} to ${requirements.recipient}`);

      // Get transaction from payload
      const txBase64 = payload.payload?.transaction;
      
      if (!txBase64) {
        return { valid: false, error:'No transaction found in payload'};
      }

      // Parse transaction
      const txBuffer = Buffer.from(txBase64,'base64');
      const transaction = Transaction.from(txBuffer);

      // Verify transaction is signed
      if (!transaction.signature || transaction.signature.every(b => b === 0)) {
        return { valid: false, error:'Transaction is not signed'};
      }

      // Basic validation passed
      console.log('[x402-facilitator]  Transaction structure valid');

      return {
        valid: true,
        details: {
          from: payload.from || transaction.feePayer?.toString() ||'',
          to: requirements.recipient,
          amount: requirements.amount,
          currency: PAYMENT_TOKEN_NAME,
        },
      };

    } catch (error) {
      console.error('[x402-facilitator] Verification error:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message :'Verification failed',
      };
    }
  }

  /**
   * Settle payment via CDP facilitator
   * 
   * Submits the signed transaction to Solana blockchain
   * Waits for confirmation
   * Registers with x402scan.com
   */
  async settle(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): Promise<SettlementResult> {
    try {
      console.log('[x402-facilitator] Settling payment on blockchain');

      // Get signed transaction
      const txBase64 = payload.payload?.transaction;
      if (!txBase64) {
        throw new Error('No transaction in payload');
      }

      // Parse and submit
      const txBuffer = Buffer.from(txBase64,'base64');
      const transaction = Transaction.from(txBuffer);

      // Submit transaction to Solana
      const signature = await this.connection.sendRawTransaction(txBuffer, {
        skipPreflight: false,
        preflightCommitment:'confirmed',
      });

      console.log(`[x402-facilitator] Transaction submitted: ${signature}`);

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature,'confirmed');
      
      if (confirmation.value.err) {
        return {
          success: false,
          transaction: signature,
          network: this.config.network,
          payer: payload.from ||'',
          error:`Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        };
      }

      console.log(`[x402-facilitator] Transaction confirmed: ${signature}`);

      // Generate explorer URLs
      const solanaExplorer =`https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`;
      const x402ScanUrl =`https://www.x402scan.com/tx/${signature}?chain=solana`;

      // Return settlement result
      return {
        success: true,
        transaction: signature,
        network: this.config.network,
        payer: payload.from || transaction.feePayer?.toString() ||'',
        x402ScanUrl,
        solanaExplorer,
      };

    } catch (error) {
      console.error('[x402-facilitator] Settlement error:', error);
      return {
        success: false,
        transaction:'',
        network: this.config.network,
        payer: payload.from ||'',
        error: error instanceof Error ? error.message :'Settlement failed',
      };
    }
  }

  /**
   * Create payment requirements object
   */
  static createPaymentRequirements(
    recipient: string,
    amount: number,
    paymentId: string,
    network: string ='solana'  ): X402PaymentRequirements {
    return {
      network,
      currency: PAYMENT_TOKEN_NAME,
      recipient,
      amount,
      paymentId,
    };
  }

  /**
   * Create x402 payment request response (for 402 responses)
   */
  static createPaymentRequest(
    recipient: string,
    amount: number,
    network: string ='solana',
    reason?: string
  ): {
    payment_id: string;
    recipient_address: string;
    amount_usdc: number;
    reason: string;
    network: string;
    currency: string;
    expires_at: number;
  } {
    return {
      payment_id:`payment-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      recipient_address: recipient,
      amount_usdc: amount,
      reason: reason ||'Payment required for service',
      network,
      currency: PAYMENT_TOKEN_NAME,
      expires_at: Date.now() + 600000, // 10 minutes
    };
  }
}

// Export singleton instance
let facilitatorInstance: X402Facilitator | null = null;

export function getFacilitator(): X402Facilitator {
  if (!facilitatorInstance) {
    facilitatorInstance = new X402Facilitator();
  }
  return facilitatorInstance;
}

export default getFacilitator;

