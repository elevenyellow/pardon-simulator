import { NextRequest, NextResponse } from'next/server';
import { Connection, PublicKey } from'@solana/web3.js';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/');
}

interface PaymentRequest {
  type:'x402_payment_required';
  recipient: string;
  recipient_address: string;
  amount_sol: number;
  reason: string;
  payment_id: string;
  timestamp: number;
}

/**
 * POST /api/agents/[agentId]/message
 * Send message to agent with x402 payment protocol support
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body = await request.json();
    const { sessionId, threadId, content, mentions, paymentSignature } = body;

    console.log(`[agent] Message to ${agentId}:`, content);

    // If payment signature provided, verify it first
    if (paymentSignature) {
      console.log('Verifying payment signature:', paymentSignature);
      
      const verification = await verifyPayment(paymentSignature, body.expectedPayment);
      
      if (!verification.valid) {
        return NextResponse.json(
          { error:'invalid_payment', message: verification.error },
          { status: 400 }
        );
      }

      console.log('Payment verified! Forwarding to agent...');
      // Add payment proof to message
      body.paymentProof = {
        signature: paymentSignature,
        verified: true,
        amount: verification.amount,
        from: verification.from,
        to: verification.to,
      };
    }

    // Forward to Coral Server
    const coralResponse = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/priv/${sessionId}/sbf`,
      {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          threadId,
          content,
          mentions: mentions || [agentId],
        }),
      }
    );

    if (!coralResponse.ok) {
      throw new Error(`Coral Server error: ${coralResponse.statusText}`);
    }

    // Get response from agent
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for agent to process

    const messagesResponse = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`    );

    if (!messagesResponse.ok) {
      throw new Error(`Failed to get messages: ${messagesResponse.statusText}`);
    }

    const { messages } = await messagesResponse.json();
    const lastMessage = messages[messages.length - 1];

    // Check if agent is requesting payment (x402)
    if (lastMessage && lastMessage.content) {
      const paymentRequest = extractPaymentRequest(lastMessage.content);
      
      if (paymentRequest) {
        console.log('Payment required! Returning 402 status');
        
        return NextResponse.json(
          {
            error:'payment_required',
            payment: paymentRequest,
            message: lastMessage.content,
          },
          { 
            status: 402,
            headers: {
              // Standard x402 protocol headers (v1.0)
'WWW-Authenticate':`Bearer realm="x402"`,
'X-Payment-Required':'true',
'X-Payment-Protocol-Version':'1.0',
'X-Payment-Chain':'solana',
'X-Payment-Network':'mainnet-beta',
'X-Payment-Method':'native',
'X-Payment-Address': paymentRequest.recipient_address,
'X-Payment-Recipient': paymentRequest.recipient ||'',
'X-Payment-Amount': paymentRequest.amount_sol.toString(),
'X-Payment-Currency':'SOL',
'X-Payment-Id': paymentRequest.payment_id,
'X-Payment-Reason': paymentRequest.reason ||'',
'X-Payment-Expiry': (Date.now() + 600000).toString(), // 10 minutes
            }
          }
        );
      }
    }

    // Normal response
    return NextResponse.json({
      success: true,
      message: lastMessage,
      allMessages: messages,
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error:'internal_error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Extract payment request from agent message
 */
function extractPaymentRequest(content: string): PaymentRequest | null {
  try {
    const match = content.match(/<x402_payment_request>(.*?)<\/x402_payment_request>/s);
    if (match && match[1]) {
      return JSON.parse(match[1].trim());
    }
  } catch (e) {
    console.error('Failed to parse payment request:', e);
  }
  return null;
}

/**
 * Verify Solana transaction on-chain
 */
async function verifyPayment(
  signature: string,
  expectedPayment: { recipient_address: string; amount_sol: number }
): Promise<{ valid: boolean; error?: string; amount?: number; from?: string; to?: string }> {
  try {
    if (!SOLANA_RPC_URL) {
      throw new Error('SOLANA_RPC_URL not configured');
    }
    const connection = new Connection(SOLANA_RPC_URL,'confirmed');

    // Get transaction details
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error:'Transaction not found'};
    }

    if (tx.meta?.err) {
      return { valid: false, error:'Transaction failed on-chain'};
    }

    // Parse transaction to find transfer
    const { preBalances, postBalances } = tx.meta!;
    const accountKeys = tx.transaction.message.getAccountKeys();

    // Find the transfer (simple SOL transfer check)
    let transferFound = false;
    let transferAmount = 0;
    let fromAddress ='';
    let toAddress ='';

    for (let i = 0; i < preBalances.length; i++) {
      const balanceChange = postBalances[i] - preBalances[i];
      
      if (balanceChange > 0) {
        // Recipient
        toAddress = accountKeys.get(i)?.toString() ||'';
        transferAmount = balanceChange / 1e9; // Convert lamports to SOL
      } else if (balanceChange < 0 && i === 0) {
        // Sender (first account is usually sender)
        fromAddress = accountKeys.get(i)?.toString() ||'';
      }
    }

    // Verify recipient
    if (toAddress !== expectedPayment.recipient_address) {
      return { 
        valid: false, 
        error:`Wrong recipient. Expected ${expectedPayment.recipient_address}, got ${toAddress}`      };
    }

    // Verify amount (allow small variance for fees)
    const amountDiff = Math.abs(transferAmount - expectedPayment.amount_sol);
    if (amountDiff > 0.001) {
      return { 
        valid: false, 
        error:`Wrong amount. Expected ${expectedPayment.amount_sol} SOL, got ${transferAmount} SOL`      };
    }

    return { 
      valid: true, 
      amount: transferAmount,
      from: fromAddress,
      to: toAddress,
    };

  } catch (error: any) {
    console.error('Payment verification error:', error);
    return { valid: false, error: error.message };
  }
}

