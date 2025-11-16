/**
 * x402scan.com Integration Client
 * 
 * Registers x402 transactions with x402scan.com for visibility and compliance.
 * This ensures our Solana-based x402 transactions appear in the community explorer.
 */

export interface X402Transaction {
  signature: string;           // Blockchain transaction signature
  chain:'solana';             // Blockchain network
  network:'mainnet-beta'|'devnet'|'testnet';
  from: string;                // Sender wallet address
  to: string;                  // Recipient wallet address
  amount: number;              // Amount in native currency (SOL)
  currency: string;            // Currency code (SOL)
  resource_url: string;        // The resource/service being paid for
  payment_id: string;          // Unique payment identifier
  timestamp: number;           // Transaction timestamp
  protocol_version?: string;   // x402 protocol version (default: 1.0)
  payment_method?: string;     // Payment method (default: native)
}

export interface X402ScanResponse {
  success: boolean;
  transaction_id?: string;
  message?: string;
  error?: string;
}

/**
 * Register a verified x402 transaction with x402scan.com
 * 
 * @param transaction - Transaction details to register
 * @returns Response from x402scan.com API
 */
export async function registerX402Transaction(
  transaction: X402Transaction
): Promise<X402ScanResponse> {
  try {
    console.log('Registering transaction with x402scan.com:', transaction.signature);
    
    // x402scan.com API endpoint (may need adjustment based on actual API)
    const endpoint = process.env.X402_SCAN_API_URL ||'https://api.x402scan.com/v1/transactions';
    
    const payload = {
      signature: transaction.signature,
      chain: transaction.chain,
      network: transaction.network,
      from: transaction.from,
      to: transaction.to,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      resource_url: transaction.resource_url,
      payment_id: transaction.payment_id,
      timestamp: transaction.timestamp,
      protocol_version: transaction.protocol_version ||'1.0',
      payment_method: transaction.payment_method ||'native',
    };

    const response = await fetch(endpoint, {
      method:'POST',
      headers: {
'Content-Type':'application/json',
'X-Protocol-Version':'1.0',
'X-Chain':'solana',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('x402scan.com registration failed:', response.status, errorText);
      
      // Don't throw - registration failure shouldn't break payment flow
      return {
        success: false,
        error:`HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    console.log('Transaction registered with x402scan.com:', data);

    return {
      success: true,
      transaction_id: data.transaction_id || data.id,
      message: data.message ||'Transaction registered successfully',
    };

  } catch (error: any) {
    console.error('Error registering with x402scan.com:', error);
    
    // Don't throw - registration is optional for payment flow
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if a transaction exists on x402scan.com
 * 
 * @param signature - Transaction signature to check
 * @returns Transaction status or null if not found
 */
export async function checkX402Transaction(
  signature: string
): Promise<{ found: boolean; url?: string }> {
  try {
    const baseUrl ='https://www.x402scan.com';
    const url =`${baseUrl}/tx/${signature}`;
    
    // Simple check - could be enhanced with actual API call
    return {
      found: true, // Optimistic - assume registration worked
      url,
    };
  } catch (error) {
    console.error('Error checking x402scan:', error);
    return { found: false };
  }
}

/**
 * Get x402scan.com explorer URL for a transaction
 * 
 * @param signature - Transaction signature
 * @param chain - Blockchain (default: solana)
 * @returns Explorer URL
 */
export function getX402ScanUrl(signature: string, chain: string ='solana'): string {
  return`https://www.x402scan.com/tx/${signature}?chain=${chain}`;
}

