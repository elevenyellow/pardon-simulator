import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  Connection,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import base58 from 'bs58';

export interface X402PaymentPayload {
  payment_id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  chain: string;
  network: string;
  protocol: string;
  version: string;
  signature: string;
}

export interface X402SolanaTransactionPayload {
  payment_id: string;
  transaction_base64: string;
  from: string;
  to: string;
  amount_usdc: number;
}

/**
 * Create x402 payment payload (NOT a blockchain transaction!)
 * 
 * This is the TRUE x402 protocol way:
 * - Client signs AUTHORIZATION (payload)
 * - Server submits TRANSACTION via CDP facilitator
 */
export async function createPaymentPayload(
  paymentId: string,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountSol: number,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<X402PaymentPayload> {
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Create payload data
  const payload = {
    payment_id: paymentId,
    from: fromPubkey.toString(),
    to: toPubkey.toString(),
    amount: amountSol,
    timestamp,
    chain: "solana",
    network: "mainnet-beta",
    protocol: "x402",
    version: "1.0"
  };
  
  // Create message to sign
  const message = JSON.stringify({
    payment_id: payload.payment_id,
    from: payload.from,
    to: payload.to,
    amount: payload.amount,
    timestamp: payload.timestamp
  });
  
  // Sign the message (NOT a transaction!)
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await signMessage(messageBytes);
  const signature = base58.encode(signatureBytes);
  
  return {
    ...payload,
    signature
  };
}

/**
 * Create x402 Solana USDC payment transaction
 * 
 * This creates an ACTUAL Solana transaction that the user signs,
 * matching the x402 "exact" scheme requirements.
 * 
 * @param paymentId - Unique payment identifier
 * @param connection - Solana connection for getting blockhash
 * @param fromPubkey - Payer's public key
 * @param toPubkey - Recipient's public key
 * @param amountUsdc - Amount in USDC (e.g., 0.002)
 * @param signTransaction - Wallet's transaction signing function
 * @returns Base64-encoded signed transaction
 */
export async function createUSDCTransaction(
  paymentId: string,
  connection: Connection,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountUsdc: number,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<X402SolanaTransactionPayload> {
  // USDC mint address on mainnet
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const USDC_DECIMALS = 6;
  
  // Convert USDC to micro-USDC (smallest unit)
  const microUsdc = Math.floor(amountUsdc * Math.pow(10, USDC_DECIMALS));
  
  // Get associated token accounts for sender and recipient
  const fromAta = await getAssociatedTokenAddress(
    USDC_MINT,
    fromPubkey
  );
  
  const toAta = await getAssociatedTokenAddress(
    USDC_MINT,
    toPubkey
  );
  
  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  
  // Create transaction with 3 instructions (x402 requirement):
  // 1. Compute unit limit
  // 2. Compute unit price
  // 3. Transfer checked instruction
  const transaction = new Transaction({
    feePayer: fromPubkey,
    blockhash,
    lastValidBlockHeight
  });
  
  // Add compute budget instructions (required by x402)
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
  );
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
  );
  
  // Add USDC transfer instruction
  transaction.add(
    createTransferCheckedInstruction(
      fromAta,        // source
      USDC_MINT,      // mint
      toAta,          // destination
      fromPubkey,     // owner
      microUsdc,      // amount (in smallest unit)
      USDC_DECIMALS   // decimals
    )
  );
  
  // Have the user sign the transaction with their wallet
  const signedTransaction = await signTransaction(transaction);
  
  // Serialize to base64
  const serialized = signedTransaction.serialize({
    requireAllSignatures: false, // We'll verify later
    verifySignatures: false
  });
  const transaction_base64 = Buffer.from(serialized).toString('base64');
  
  return {
    payment_id: paymentId,
    transaction_base64,
    from: fromPubkey.toString(),
    to: toPubkey.toString(),
    amount_usdc: amountUsdc
  };
}

