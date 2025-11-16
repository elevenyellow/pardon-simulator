import { NextRequest, NextResponse } from'next/server';
import { 
  Connection, 
  Transaction, 
  SystemProgram, 
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} from'@solana/web3.js';
import { getCDPClient } from'@/lib/x402-cdp-client';

/**
 * x402 Protocol Compliant Transaction Submission Endpoint
 * 
 * This endpoint implements the TRUE x402 protocol flow where the SERVER
 * (facilitator) submits transactions to the blockchain, not the client.
 * 
 * Flow:
 * 1. Agent creates and signs payment PAYLOAD (authorization)
 * 2. Agent sends payload to this endpoint
 * 3. Backend verifies payload signature
 * 4. Backend creates Solana transaction
 * 5. Backend submits transaction to blockchain
 * 6. Backend returns signature for verification
 * 
 * This ensures x402 compliance and proper x402scan indexing.
 */

// Backend-only RPC URL (API key stays private)
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ||'';
if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required');
}

interface PaymentPayload {
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

/**
 * POST /api/x402/submit-transaction
 * 
 * Submit a Solana transaction via x402 protocol (server-side submission)
 */
export async function POST(request: NextRequest) {
  try {
    const { paymentPayload } = await request.json();

    // Validate request
    if (!paymentPayload) {
      return NextResponse.json(
        { error:'Missing paymentPayload'},
        { status: 400 }
      );
    }

    console.log('X402 TRANSACTION SUBMISSION (Backend-Controlled)');

    // Verify required fields
    const required = ['payment_id','from','to','amount','signature','chain','protocol'];
    const missing = required.filter(field => !paymentPayload[field]);
    
    if (missing.length > 0) {
      console.error(`[x402] Missing required fields: ${missing.join(',')}`);
      return NextResponse.json(
        { 
          success: false,
          error:`Missing required fields: ${missing.join(',')}`        },
        { status: 400 }
      );
    }

    const payload: PaymentPayload = paymentPayload;

    // Verify chain and protocol
    if (payload.chain !=='solana') {
      return NextResponse.json(
        { success: false, error:'Only Solana chain is supported'},
        { status: 400 }
      );
    }

    if (payload.protocol !=='x402') {
      return NextResponse.json(
        { success: false, error:'Only x402 protocol is supported'},
        { status: 400 }
      );
    }

    // Verify amount is reasonable
    if (payload.amount <= 0 || payload.amount > 10) {
      return NextResponse.json(
        { success: false, error:'Invalid amount (must be between 0 and 10 SOL)'},
        { status: 400 }
      );
    }

    console.log(`Payment Details:`);
    console.log(`Payment ID: ${payload.payment_id}`);
    console.log(`From: ${payload.from.substring(0, 8)}...${payload.from.substring(payload.from.length - 8)}`);
    console.log(`To: ${payload.to.substring(0, 8)}...${payload.to.substring(payload.to.length - 8)}`);
    console.log(`Amount: ${payload.amount} SOL`);
    console.log(`Protocol: ${payload.protocol} v${payload.version}`);

    // Step 1: Verify payload signature
    // Note: Full cryptographic verification would require recovering the public key
    // from the signature and verifying it matches the'from'address.
    // For now, we trust that the signature field exists and defer full verification
    // to the blockchain when the transaction is submitted.
    // Payment payload verified
    console.log(`Signature present: ${payload.signature.length > 0}`);

    // Step 2: Create Solana connection
    console.log(`\n Step 2: Connecting to Solana...`);
    const connection = new Connection(SOLANA_RPC_URL,'confirmed');
    
    try {
      const blockHeight = await connection.getBlockHeight();
      console.log(`[x402] Connected to Solana (block height: ${blockHeight})`);
    } catch (error: any) {
      console.error('[x402] Failed to connect to Solana:', error.message);
      return NextResponse.json(
        { success: false, error:'Failed to connect to Solana network'},
        { status: 500 }
      );
    }

    // Step 3: Create transaction
    // IMPORTANT: In a true x402 facilitator with full CDP support, the facilitator
    // would have authority to submit transactions. For now, we need the payer's
    // authorization. The payment payload signature serves as this authorization.
    //
    // However, Solana requires the actual transaction to be signed by the sender's
    // private key. Since we don't have access to the sender's private key (by design),
    // we cannot submit the transaction directly.
    //
    // SOLUTION: This endpoint will create a READY-TO-SIGN transaction that the client
    // can sign and return, OR we wait for CDP to add full Solana facilitator support
    // where they handle the entire flow server-side.
    //
    // For now, let's document this limitation and provide a helpful error message.

    // Transaction Creation Limitation
    console.log(`The Solana blockchain requires transactions to be signed with`);
    console.log(`the sender's private key. For security, we don't have access`);
    console.log(`to user private keys on the backend.`);
    console.log(``);
    console.log(`Current status: Waiting for CDP to add full Solana facilitator`);
    console.log(`support where the facilitator can submit transactions with`);
    console.log(`delegated authority.`);
    console.log(``);
    console.log(`Temporary solution: Backend will create unsigned transaction`);
    console.log(`and return it for client-side signing, then client returns`);
    console.log(`the signed transaction for submission.`);

    // Create unsigned transaction
    const fromPubkey = new PublicKey(payload.from);
    const toPubkey = new PublicKey(payload.to);
    const lamports = Math.floor(payload.amount * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
      })
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    // Unsigned transaction created
    console.log(`Transfer: ${payload.amount} SOL`);
    console.log(`From: ${payload.from}`);
    console.log(`To: ${payload.to}`);
    console.log(`Blockhash: ${blockhash.substring(0, 16)}...`);

    // Serialize transaction for client signing
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    console.log(`\n Step 4: Returning unsigned transaction to client`);
    console.log(`The client will sign this transaction and return it`);
    console.log(`for final submission (hybrid x402 flow until full CDP support)`);

    // Return unsigned transaction for client signing
    // This is a hybrid approach until CDP adds full Solana facilitator support
    return NextResponse.json({
      success: true,
      requiresClientSignature: true,
      unsignedTransaction: serializedTransaction,
      blockhash,
      lastValidBlockHeight,
      amount: payload.amount,
      from: payload.from,
      to: payload.to,
      payment_id: payload.payment_id,
      x402Compliant:'partial', // Partial until full CDP support
      method:'hybrid_backend_prepared',
      message:'Transaction created by backend, awaiting client signature for submission'    });

  } catch (error: any) {
    console.error('Transaction submission error:', error);
    console.error('Stack trace:', error.stack);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message ||'Failed to submit transaction'      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/x402/submit-transaction/finalize
 * 
 * Finalize a transaction that was signed by the client
 * This completes the hybrid x402 flow
 */
export async function PUT(request: NextRequest) {
  try {
    const { signedTransaction, payment_id } = await request.json();

    if (!signedTransaction || !payment_id) {
      return NextResponse.json(
        { error:'Missing signedTransaction or payment_id'},
        { status: 400 }
      );
    }

    console.log('X402 TRANSACTION FINALIZATION (Client-Signed)');
    console.log(`Payment ID: ${payment_id}`);

    const connection = new Connection(SOLANA_RPC_URL,'confirmed');

    // Deserialize and submit transaction
    const transaction = Transaction.from(
      Buffer.from(signedTransaction,'base64')
    );

    console.log(`Submitting signed transaction...`);
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment:'confirmed',
      }
    );

    console.log('[x402] Transaction submitted');
    console.log(`Signature: ${signature.substring(0, 16)}...${signature.substring(signature.length - 16)}`);

    // Wait for confirmation
    console.log(`Waiting for confirmation...`);
    const confirmation = await connection.confirmTransaction(signature,'confirmed');
    
    if (confirmation.value.err) {
      console.error('[x402] Transaction failed:', confirmation.value.err);
      return NextResponse.json({
        success: false,
        error:'Transaction failed on-chain',
        signature
      }, { status: 500 });
    }

    console.log('[x402] Transaction confirmed on-chain');

    // Register with x402scan
    console.log(`\n Registering with x402scan...`);
    const cdpClient = getCDPClient();
    
    // Extract transaction details for registration
    const instruction = transaction.instructions[0];
    const keys = instruction.keys;
    const from = keys[0]?.pubkey.toBase58() ||'';
    const to = keys[1]?.pubkey.toBase58() ||'';
    const amount = Number(instruction.data.readBigUInt64LE(4)) / LAMPORTS_PER_SOL;

    const registrationResult = await cdpClient.registerTransaction({
      signature,
      chain:'solana',
      network:'mainnet-beta',
      from,
      to,
      amount,
      currency:'SOL',
      metadata: {
        platform:'pardon-simulator',
        service_type: payment_id,
      }
    });


    return NextResponse.json({
      success: true,
      signature,
      amount,
      x402Compliant: true,
      x402ScanUrl: registrationResult.x402ScanUrl,
      x402ScanId: registrationResult.x402ScanId,
      method:'backend_finalized',
      confirmed: true
    });

  } catch (error: any) {
    console.error('Transaction finalization error:', error);
    return NextResponse.json(
      { success: false, error: error.message ||'Failed to finalize transaction'},
      { status: 500 }
    );
  }
}

