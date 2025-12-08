import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram
} from'@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from'@solana/spl-token';
import base58 from'bs58';
import { CDP_FACILITATOR_ADDRESS } from '@/config/tokens';

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
  amount: number;  // Payment token amount
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
    chain:"solana",
    network:"mainnet-beta",
    protocol:"x402",
    version:"1.0"  };
  
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
 * Create x402 Solana SPL Token payment transaction for CDP facilitator
 * 
 * Generic function that supports any SPL token
 * 
 * Creates a PARTIALLY-SIGNED transaction:
 * - Fee payer: CDP facilitator (L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg)
 * - User signs: Transfer authority only (SPL token transfer)
 * - CDP cosigns: Fee payer signature when settling
 * 
 * This is the "exact_svm" scheme where CDP co-signs transactions.
 * 
 * @param tokenMint - SPL token mint address
 * @param tokenDecimals - Number of decimals for the token
 * @param paymentId - Unique payment identifier
 * @param fromPubkey - User's wallet (transfer authority)
 * @param toPubkey - Recipient's public key
 * @param amount - Amount in token units (e.g., 0.01)
 * @param signTransaction - Wallet's transaction signing function
 * @returns Base64-encoded partially-signed transaction (user signed, CDP will cosign)
 */
export async function createSPLTokenTransaction(
  tokenMint: string,
  tokenDecimals: number,
  paymentId: string,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amount: number,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<X402SolanaTransactionPayload> {
  // Token mint address
  const TOKEN_MINT = new PublicKey(tokenMint);

  // CDP facilitator address that will cosign
  const CDP_FACILITATOR = new PublicKey(CDP_FACILITATOR_ADDRESS);

  // Convert token amount to smallest unit
  const microAmount = Math.floor(amount * Math.pow(10, tokenDecimals));

  // Get associated token accounts
  const fromAta = await getAssociatedTokenAddress(TOKEN_MINT, fromPubkey);
  const toAta = await getAssociatedTokenAddress(TOKEN_MINT, toPubkey);
  
  // Check if recipient ATA exists BEFORE getting blockhash (do slow operations first)
  const checkResponse = await fetch('/api/solana/check-token-accounts', {
    method:'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      accounts: [{ address: toAta.toString(), owner: toPubkey.toString(), name:'recipient'}],
      mint: TOKEN_MINT.toString()
    })
  });
  
  const { accounts } = await checkResponse.json();
  const recipientExists = accounts[0]?.exists;
  
  console.log('[x402] ⏱️ Fetching FRESH blockhash (as late as possible to minimize staleness)');
  
  // Get blockhash as LATE as possible - right before building transaction
  // This minimizes the time window between blockhash retrieval and CDP settlement
  // Blockhashes are valid for ~60-90 seconds (150 slots), so every second counts
  const blockhashResponse = await fetch('/api/solana/blockhash');
  if (!blockhashResponse.ok) {
    throw new Error('Failed to get blockhash from backend');
  }
  const { blockhash, lastValidBlockHeight } = await blockhashResponse.json();
  
  console.log('[x402] Blockhash retrieved:', blockhash.substring(0, 10) + '...');
  console.log('[x402] Building SPL token transaction immediately to minimize staleness window');
  
  // Create transaction with CDP facilitator as fee payer
  const transaction = new Transaction({
    feePayer: CDP_FACILITATOR,  // ← CDP pays fees and will cosign
    blockhash,
    lastValidBlockHeight
  });
  
  // Add compute budget
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
  
  // Create recipient ATA if it doesn't exist
  if (!recipientExists) {
    console.log('Adding instruction to create recipient token account (CDP pays)');
    transaction.add(
      createAssociatedTokenAccountInstruction(
        CDP_FACILITATOR, // payer (CDP pays for ATA creation)
        toAta,           // ata address
        toPubkey,        // owner
        TOKEN_MINT       // mint
      )
    );
  }
  
  // Add SPL token transfer instruction
  transaction.add(
    createTransferCheckedInstruction(
      fromAta,       // from token account
      TOKEN_MINT,    // mint
      toAta,         // to token account
      fromPubkey,    // owner (user signs as transfer authority)
      microAmount,   // amount
      tokenDecimals  // decimals
    )
  );
  
  console.log('✍️ Requesting user signature for transfer authority...');
  console.log('User signs partially (transfer only), CDP will cosign as fee payer');
  
  // User signs the transaction (partial signature - only transfer authority)
  const signedTransaction = await signTransaction(transaction);
  
  // Serialize with PARTIAL signatures (user signed, CDP will cosign)
  const serialized = signedTransaction.serialize({ 
    requireAllSignatures: false,  // ← PARTIAL signing
    verifySignatures: false       // ← Don't verify yet (CDP hasn't signed)
  });
  const transaction_base64 = Buffer.from(serialized).toString('base64');
  
  // All payments use the payment token
  return {
    payment_id: paymentId,
    transaction_base64,
    from: fromPubkey.toString(),
    to: toPubkey.toString(),
    amount: amount
  };
}

/**
 * Legacy wrapper for USDC transactions
 * Maintains backward compatibility with existing code
 */
export async function createUSDCTransaction(
  paymentId: string,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountUsdc: number,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<X402SolanaTransactionPayload> {
  return createSPLTokenTransaction(
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    6,
    paymentId,
    fromPubkey,
    toPubkey,
    amountUsdc,
    signTransaction
  );
}

/**
 * Create x402 Solana native SOL payment transaction for CDP facilitator
 * 
 * Creates a PARTIALLY-SIGNED transaction:
 * - Fee payer: CDP facilitator (L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg)
 * - User signs: Transfer authority
 * - CDP cosigns: Fee payer signature when settling
 * 
 * This is the "exact_svm" scheme where CDP co-signs transactions.
 * Now supports native SOL transfers as of October 2025 CDP update.
 * 
 * @param paymentId - Unique payment identifier
 * @param fromPubkey - User's wallet
 * @param toPubkey - Recipient's public key
 * @param amountSol - Amount in SOL (e.g., 0.01)
 * @param signTransaction - Wallet's transaction signing function
 * @returns Base64-encoded partially-signed transaction (user signed, CDP will cosign)
 */
export async function createSOLTransaction(
  paymentId: string,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountSol: number,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<X402SolanaTransactionPayload> {
  // CDP facilitator address that will cosign
  const CDP_FACILITATOR = new PublicKey(CDP_FACILITATOR_ADDRESS);

  // Convert SOL to lamports (9 decimals)
  const lamports = Math.floor(amountSol * Math.pow(10, 9));

  console.log('[x402] ⏱️ Fetching FRESH blockhash (as late as possible to minimize staleness)');
  
  // Get blockhash as LATE as possible - right before building transaction
  const blockhashResponse = await fetch('/api/solana/blockhash');
  if (!blockhashResponse.ok) {
    throw new Error('Failed to get blockhash from backend');
  }
  const { blockhash, lastValidBlockHeight } = await blockhashResponse.json();
  
  console.log('[x402] Blockhash retrieved:', blockhash.substring(0, 10) + '...');
  console.log('[x402] Building SOL transaction immediately to minimize staleness window');
  
  // Create transaction with CDP facilitator as fee payer
  const transaction = new Transaction({
    feePayer: CDP_FACILITATOR,  // ← CDP pays fees and will cosign
    blockhash,
    lastValidBlockHeight
  });
  
  // CDP x402 exact_svm requires exactly 3 instructions:
  // 1. setComputeUnitLimit
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  
  // 2. setComputeUnitPrice
  transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
  
  // 3. Transfer instruction (SystemProgram.transfer for native SOL)
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,   // user's wallet
      toPubkey,     // recipient
      lamports,     // amount in lamports
    })
  );
  
  console.log('✍️ Requesting user signature for SOL transfer...');
  console.log('User signs partially (transfer only), CDP will cosign as fee payer');
  
  // User signs the transaction (partial signature)
  const signedTransaction = await signTransaction(transaction);
  
  // Serialize with PARTIAL signatures (user signed, CDP will cosign)
  const serialized = signedTransaction.serialize({ 
    requireAllSignatures: false,  // ← PARTIAL signing
    verifySignatures: false       // ← Don't verify yet (CDP hasn't signed)
  });
  const transaction_base64 = Buffer.from(serialized).toString('base64');
  
  return {
    payment_id: paymentId,
    transaction_base64,
    from: fromPubkey.toString(),
    to: toPubkey.toString(),
    amount: amountSol  // All payments use payment token
  };
}

