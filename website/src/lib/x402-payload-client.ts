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
 * Create x402 Solana USDC payment transaction for CDP facilitator
 * 
 * Creates a PARTIALLY-SIGNED transaction:
 * - Fee payer: CDP facilitator (L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg)
 * - User signs: Transfer authority only (SPL token transfer)
 * - CDP cosigns: Fee payer signature when settling
 * 
 * This is the "exact_svm" scheme where CDP co-signs transactions.
 * 
 * @param paymentId - Unique payment identifier
 * @param fromPubkey - User's wallet (transfer authority)
 * @param toPubkey - Recipient's public key
 * @param amountUsdc - Amount in USDC (e.g., 0.01)
 * @param signTransaction - Wallet's transaction signing function
 * @returns Base64-encoded partially-signed transaction (user signed, CDP will cosign)
 */
export async function createUSDCTransaction(
  paymentId: string,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountUsdc: number,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<X402SolanaTransactionPayload> {
  // USDC mint address on mainnet
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const USDC_DECIMALS = 6;

  // CDP facilitator address that will cosign
  const CDP_FACILITATOR = new PublicKey('L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg');

  // Convert USDC to micro-USDC (smallest unit)
  const microUsdc = Math.floor(amountUsdc * Math.pow(10, USDC_DECIMALS));

  // Get associated token accounts
  const fromAta = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
  const toAta = await getAssociatedTokenAddress(USDC_MINT, toPubkey);
  
  // Get recent blockhash from backend
  const blockhashResponse = await fetch('/api/solana/blockhash');
  if (!blockhashResponse.ok) {
    throw new Error('Failed to get blockhash from backend');
  }
  const { blockhash, lastValidBlockHeight } = await blockhashResponse.json();
  
  console.log('Creating USDC transfer transaction');
  console.log('CDP facilitator pays fees, user signs transfer authority');
  
  // Create transaction with CDP facilitator as fee payer
  const transaction = new Transaction({
    feePayer: CDP_FACILITATOR,  // ← CDP pays fees and will cosign
    blockhash,
    lastValidBlockHeight
  });
  
  // Add compute budget
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
  
  // Check if recipient ATA exists
  const checkResponse = await fetch('/api/solana/check-token-accounts', {
    method:'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      accounts: [{ address: toAta.toString(), owner: toPubkey.toString(), name:'recipient'}],
      mint: USDC_MINT.toString()
    })
  });
  
  const { accounts } = await checkResponse.json();
  const recipientExists = accounts[0]?.exists;
  
  // Create recipient ATA if it doesn't exist
  if (!recipientExists) {
    console.log('Adding instruction to create recipient USDC account (CDP pays)');
    transaction.add(
      createAssociatedTokenAccountInstruction(
        CDP_FACILITATOR, // payer (CDP pays for ATA creation)
        toAta,           // ata address
        toPubkey,        // owner
        USDC_MINT        // mint
      )
    );
  }
  
  // Add USDC transfer instruction
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
  
  return {
    payment_id: paymentId,
    transaction_base64,
    from: fromPubkey.toString(),
    to: toPubkey.toString(),
    amount_usdc: amountUsdc
  };
}

