import { NextRequest, NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { prisma } from '@/lib/prisma';
import { withRetry } from '@/lib/db-retry';
import { registerX402Transaction } from '@/lib/x402scan-client';
import { standardRateLimiter } from '@/lib/middleware/rate-limit';
import { sanitizeMessage, sanitizeWalletAddress, sanitizeSignature, sanitizeText } from '@/lib/security/sanitize';
import { getClientIP, logInjectionAttempt } from '@/lib/security/monitoring';

// ✅ Backend-only URLs (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/');
}

interface PaymentRequest {
  type: 'x402_payment_required';
  recipient: string;
  recipient_address: string;
  amount_sol: number;
  reason: string;
  payment_id: string;
  timestamp: number;
}

/**
 * POST /api/chat/send
 * Send message to agent with x402 payment protocol support
 * 
 * This is the main communication endpoint. All messages flow through here.
 */
/**
 * Validate prompt against anti-cheat rules (server-side)
 */
function validatePromptStrict(content: string, isPaymentConfirmation: boolean = false): { valid: boolean; error?: string } {
  // Allow payment confirmations to bypass length check
  // Payment confirmations contain signatures (87-88 chars) + text
  if (!isPaymentConfirmation) {
    // Length check (strict) - only for non-payment messages
    if (content.length > 100) {
      return {
        valid: false,
        error: 'Message exceeds 100 characters'
      };
    }
  }
  
  // English-only check (strict) - apply to all messages
  // But allow base58 characters for payment signatures
  const hasSignature = /Transaction signature:\s*[1-9A-HJ-NP-Za-km-z]{87,88}/.test(content);
  if (!hasSignature) {
    const englishRegex = /^[a-zA-Z0-9\s\.,!?;:'"()\-@#$%&*+=\[\]{}\/\\]+$/;
    if (!englishRegex.test(content)) {
      return {
        valid: false,
        error: 'Please use only English characters in your message. Special characters are not allowed except in payment confirmations.'
      };
    }
  }
  
  // Check for common injection attempts (skip for payment confirmations)
  if (!isPaymentConfirmation) {
    const injectionPatterns = [
      { pattern: /award.*\d+.*points/i, name: 'score_manipulation' },
      { pattern: /give.*me.*\d+/i, name: 'score_request' },
      { pattern: /set.*score.*\d+/i, name: 'score_setting' },
      { pattern: /system\s*prompt/i, name: 'prompt_injection' },
      { pattern: /ignore\s*previous/i, name: 'instruction_override' },
    ];
    
    for (const { pattern, name } of injectionPatterns) {
      if (pattern.test(content)) {
        console.warn(`⚠️ Injection attempt detected: ${content}`);
        return {
          valid: false,
          error: 'Invalid message content',
          detectedPattern: name
        };
      }
    }
  }
  
  return { valid: true };
}

async function handlePOST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    
    // Sanitize inputs (SECURITY: Prevent XSS and injection)
    const sessionId = rawBody.sessionId ? sanitizeText(rawBody.sessionId) : '';
    const threadId = rawBody.threadId ? sanitizeText(rawBody.threadId) : '';
    const content = rawBody.content ? sanitizeMessage(rawBody.content, { maxLength: 500 }) : '';
    const agentId = rawBody.agentId ? sanitizeText(rawBody.agentId) : '';
    const userWallet = rawBody.userWallet ? sanitizeWalletAddress(rawBody.userWallet) : null;
    const paymentSignature = rawBody.paymentSignature ? sanitizeSignature(rawBody.paymentSignature) : undefined;

    if (!sessionId || !threadId || !content || !agentId) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, threadId, content, agentId' },
        { status: 400 }
      );
    }
    
    if (!userWallet) {
      return NextResponse.json(
        { error: 'Invalid or missing wallet address' },
        { status: 400 }
      );
    }
    
  // Detect if this is a payment confirmation message or x402 payment payload
    const isPaymentConfirmation = paymentSignature !== undefined || 
                                  content.includes('Payment sent!') || 
                                content.includes('Transaction signature:') ||
                                content.includes('x402 payment payload') ||
                                content.includes('"x402Version"') ||
                                content.includes('"payment_id"');
    
  // Validate prompt (anti-cheat) - allow payment confirmations to bypass ALL validation
  const validation = isPaymentConfirmation ? { valid: true } : validatePromptStrict(content, false);
    if (!validation.valid) {
      console.warn(`❌ Prompt validation failed: ${validation.error}`);
      
      // Log injection attempt if detected
      if ((validation as any).detectedPattern) {
        const ip = getClientIP(request.headers);
        logInjectionAttempt(ip, '/api/chat/send', content, (validation as any).detectedPattern);
      }
      
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }
    
    if (isPaymentConfirmation) {
      console.log('✅ Payment confirmation detected - bypassed length validation');
    }

    console.log(`📨 Message to ${agentId}: ${content.substring(0, 50)}...`);

    // If payment signature provided, verify it first
    if (paymentSignature) {
      console.log('🔍 Verifying payment signature:', paymentSignature);
      
      // Extract payment info from previous message context
      // In production, this would come from session storage/database
      const paymentInfo = extractPaymentInfoFromContent(content);
      
      if (paymentInfo) {
        const verification = await verifyPaymentInternal(
          paymentSignature,
          paymentInfo.recipient_address,
          paymentInfo.amount_sol
        );
        
        if (!verification.valid) {
          return NextResponse.json(
            { error: 'invalid_payment', message: verification.error },
            { status: 400 }
          );
        }

        console.log('✅ Payment verified! Forwarding to agent...');
      }
    }

    // Get initial message count BEFORE sending the user's message
    const initialMessageCount = await getMessageCount(sessionId, threadId);
    console.log(`📊 Initial message count (before user message): ${initialMessageCount}`);

    // 🔧 FIX: Include user's wallet address in message for agent to use directly
    // Agent can't rely on "sbf" - EVERY user is "sbf"!
    const contentWithWallet = `[USER_WALLET:${userWallet}] ${content}`;
    
    // Send message to Coral Server
    const sendResponse = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/debug/${sessionId}/sbf`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          content: contentWithWallet,
          mentions: [agentId],
        }),
      }
    );

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('Coral Server error:', errorText);
      throw new Error(`Failed to send message: ${sendResponse.statusText}`);
    }

    console.log('✅ Message sent to Coral, waiting for agent response...');

    // Save user's message to database
    await saveMessageToDatabase({
      threadId,
      sessionId,
      senderId: 'sbf',
      content,
      mentions: [agentId],
      isIntermediary: false,
      userWallet
    });

    // Wait a moment for Coral to process the message before we start polling
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get all existing message IDs BEFORE we start polling
    // This prevents us from treating old messages as "new"
    const existingMessagesResponse = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/app/debug/${sessionId}/${threadId}/messages`
    );
    const existingData = await existingMessagesResponse.json();
    const existingMessages = existingData.messages || [];
    const seenMessageIds = new Set<string>(existingMessages.map((m: any) => m.id));
    
    console.log(`📊 Pre-populated seenMessageIds with ${seenMessageIds.size} existing messages`);

    // Poll for agent's response (wait up to 60 seconds for LLM processing)
    let messages: any[] = [];
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max (LLM + tool calls can take time)
    
    console.log(`📊 Starting polling (initial count: ${initialMessageCount})...`);

    let agentResponseDetected = false;
    let noNewMessagesCount = 0;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      attempts++;

      const messagesResponse = await fetch(
        `${CORAL_SERVER_URL}/api/v1/debug/thread/app/debug/${sessionId}/${threadId}/messages`
      );

      if (!messagesResponse.ok) {
        throw new Error(`Failed to get messages: ${messagesResponse.statusText}`);
      }

      const previousMessageCount = messages.length;
      const data = await messagesResponse.json();
      messages = data.messages || [];
      
      console.log(`📬 Polling attempt ${attempts}: ${messages.length} total messages (initial: ${initialMessageCount}, previous: ${previousMessageCount})`);
      console.log(`📬 All message senderIds:`, messages.map((m: any) => m.senderId));
      
      // Check for new messages from agents (not from sbf)
      let foundNewAgentMessage = false;
      for (const msg of messages) {
        if (!seenMessageIds.has(msg.id)) {
          seenMessageIds.add(msg.id);
          if (msg.senderId !== 'sbf') {
            console.log(`  ✨ New agent message detected! ID=${msg.id}, from=${msg.senderId}`);
            foundNewAgentMessage = true;
          }
        }
      }
      
      // Check if we have a new message from the agent (not from sbf)
      const lastMessage = messages[messages.length - 1];
      const hasNewMessage = messages.length > Math.max(initialMessageCount, previousMessageCount);
      const isFromAgent = lastMessage?.senderId !== 'sbf';
      
      if (lastMessage) {
        console.log(`  Last message: from=${lastMessage.senderId}, hasNew=${hasNewMessage}, isAgent=${isFromAgent}`);
      }
      
      // Use the more reliable ID-based detection
      if (foundNewAgentMessage || (hasNewMessage && isFromAgent)) {
        console.log(`✅ Agent responded after ${attempts} seconds`);
        agentResponseDetected = true;
        noNewMessagesCount = 0; // Reset counter
        
        // Don't break immediately! Agent might send multiple messages (e.g., conversation + payment request)
        // Wait 3 more seconds to catch follow-up messages
        if (attempts > 3) { // Only wait if we've already been polling for a bit
          console.log('⏳ Waiting 3 more seconds for potential follow-up messages...');
          continue;
        }
      } else if (agentResponseDetected) {
        // We've seen agent response, now counting iterations with no new messages
        noNewMessagesCount++;
        console.log(`⏳ No new messages (${noNewMessagesCount}/5)...`);
        
        if (noNewMessagesCount >= 5) {
          console.log('✅ No more messages coming, proceeding...');
          break;
        }
      } else {
        console.log(`⏳ Waiting for agent response... (attempt ${attempts}/${maxAttempts})`);
      }
    }
    
    // Save all new agent messages to database (after polling completes)
    console.log(`💾 === DATABASE SAVE LOOP START ===`);
    console.log(`💾 Total messages in array: ${messages.length}`);
    console.log(`💾 Initial message count: ${initialMessageCount}`);
    console.log(`💾 Messages to process: ${messages.length - initialMessageCount}`);
    console.log(`💾 Loop will iterate from index ${initialMessageCount} to ${messages.length - 1}`);
    
    // Log ALL messages first
    console.log(`💾 ALL MESSAGES IN ARRAY:`);
    messages.forEach((msg: any, idx: number) => {
      console.log(`   [${idx}] senderId="${msg.senderId}", id="${msg.id}"`);
    });
    
    for (let i = initialMessageCount; i < messages.length; i++) {
      const message = messages[i];
      console.log(`💾 ========================================`);
      console.log(`💾 Processing message at index ${i}:`);
      console.log(`   - senderId: "${message.senderId}"`);
      console.log(`   - id: "${message.id}"`);
      console.log(`   - isAgent: ${message.senderId !== 'sbf'}`);
      console.log(`   - content preview: "${message.content.substring(0, 50)}..."`);
      
      if (message.senderId !== 'sbf') {
        console.log(`💾 ✅ This is an agent message, calling saveMessageToDatabase...`);
        await saveMessageToDatabase({
          threadId,
          sessionId,
          senderId: message.senderId,
          content: message.content,
          mentions: message.mentions || [],
          isIntermediary: false,
          userWallet
        });
      } else {
        console.log(`💾 ⏭️  Skipping - this is a user message (senderId: ${message.senderId})`);
      }
    }
    
    console.log(`💾 === DATABASE SAVE LOOP END ===`);
    
    // Check last message for payment request (x402)
    const lastMessage = messages[messages.length - 1];
    
    console.log('🔍 Checking last message for payment request...');
    console.log('Last message sender:', lastMessage?.senderId);
    console.log('Last message content preview:', lastMessage?.content?.substring(0, 100));
    
    if (lastMessage && lastMessage.senderId !== 'sbf') {
      const paymentRequest = extractPaymentRequest(lastMessage.content);
      
      console.log('Payment request extracted:', paymentRequest ? 'YES ✅' : 'NO ❌');
      
      if (paymentRequest) {
        console.log('💰💰💰 PAYMENT REQUIRED! RETURNING HTTP 402! 💰💰💰');
        console.log('Payment details:', JSON.stringify(paymentRequest, null, 2));
        
        // Return proper HTTP 402 with standard x402 headers
        return NextResponse.json(
          {
            error: 'payment_required',
            payment: paymentRequest,
            messages,
          },
          { 
            status: 402, // ✅ HTTP 402 Payment Required (x402 protocol standard)
            headers: {
              // Standard x402 protocol headers (v1.0)
              'WWW-Authenticate': `Bearer realm="x402"`,
              'X-Payment-Required': 'true',
              'X-Payment-Protocol-Version': '1.0',
              'X-Payment-Chain': 'solana',
              'X-Payment-Network': 'mainnet-beta',
              'X-Payment-Method': 'native',
              'X-Payment-Address': paymentRequest.recipient_address,
              'X-Payment-Recipient': paymentRequest.recipient || '',
              'X-Payment-Amount': paymentRequest.amount_sol.toString(),
              'X-Payment-Currency': 'SOL',
              'X-Payment-Id': paymentRequest.payment_id,
              'X-Payment-Reason': paymentRequest.reason || '',
              'X-Payment-Expiry': (Date.now() + 600000).toString(), // 10 minutes
            }
          }
        );
      }
    }

    // Normal response
    return NextResponse.json({
      success: true,
      messages,
    });

  } catch (error: any) {
    console.error('❌ Send message error:', error);
    // Security: Don't expose detailed error messages to clients
    return NextResponse.json(
      { error: 'internal_error', message: 'An error occurred while sending your message. Please try again.' },
      { status: 500 }
    );
  }
}

// Apply rate limiting to POST endpoint
export async function POST(request: NextRequest) {
  return standardRateLimiter(request, handlePOST);
}

/**
 * Get current message count for a thread
 */
async function getMessageCount(sessionId: string, threadId: string): Promise<number> {
  try {
    const response = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/app/debug/${sessionId}/${threadId}/messages`
    );
    if (!response.ok) return 0;
    const data = await response.json();
    return (data.messages || []).length;
  } catch {
    return 0;
  }
}

/**
 * Extract payment request from agent message
 * Handles both legacy and x402 standard v1.0 formats
 */
function extractPaymentRequest(content: string): PaymentRequest | null {
  try {
    console.log('🔍 Attempting to extract payment request from content...');
    console.log('   Content length:', content.length);
    console.log('   Contains x402 tags:', content.includes('<x402_payment_request>'));
    
    const match = content.match(/<x402_payment_request>(.*?)<\/x402_payment_request>/s);
    if (match && match[1]) {
      console.log('   ✅ Found XML match, parsing JSON...');
      const parsed = JSON.parse(match[1].trim());
      console.log('   ✅ Successfully parsed payment request:', parsed.payment_id);
      
      // Normalize x402 v1.0 format (nested objects) to flat format for compatibility
      if (parsed.recipient && typeof parsed.recipient === 'object') {
        parsed.recipient = parsed.recipient.id || parsed.recipient;
        parsed.recipient_address = parsed.recipient.address || parsed.recipient_address;
      }
      if (parsed.amount && typeof parsed.amount === 'object') {
        parsed.amount_sol = parseFloat(parsed.amount.value) / 1e9 || parsed.amount_sol;
      }
      
      return parsed;
    } else {
      console.log('   ❌ No XML match found');
    }
  } catch (e) {
    console.error('   ❌ Failed to parse payment request:', e);
  }
  return null;
}

/**
 * Extract payment info from confirmation message
 * In production, this should come from session storage
 */
function extractPaymentInfoFromContent(content: string): { recipient_address: string; amount_sol: number } | null {
  // This is a simplified version - in production, store payment requests in database
  // For now, we'll rely on frontend passing correct info
  return null;
}

/**
 * Verify Solana transaction on-chain (internal helper)
 * Also registers verified transactions with x402scan.com
 */
async function verifyPaymentInternal(
  signature: string,
  expectedRecipient: string,
  expectedAmount: number,
  paymentId?: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    if (!SOLANA_RPC_URL) {
      throw new Error('SOLANA_RPC_URL not configured');
    }
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }

    if (tx.meta?.err) {
      return { valid: false, error: 'Transaction failed on-chain' };
    }

    // Parse transaction to find transfer
    const { preBalances, postBalances } = tx.meta!;
    const accountKeys = tx.transaction.message.getAccountKeys();

    let recipientFound = false;
    let transferAmount = 0;
    let fromAddress = '';

    for (let i = 0; i < preBalances.length; i++) {
      const balanceChange = postBalances[i] - preBalances[i];
      const address = accountKeys.get(i)?.toString() || '';
      
      // Track sender (negative balance change)
      if (balanceChange < 0 && !fromAddress) {
        fromAddress = address;
      }
      
      // Find recipient (positive balance change)
      if (balanceChange > 0 && address === expectedRecipient) {
        recipientFound = true;
        transferAmount = balanceChange / 1e9;
      }
    }

    if (!recipientFound) {
      return { valid: false, error: `Payment not sent to ${expectedRecipient}` };
    }

    const amountDiff = Math.abs(transferAmount - expectedAmount);
    if (amountDiff > 0.001) {
      return { valid: false, error: `Wrong amount: expected ${expectedAmount}, got ${transferAmount}` };
    }

    // ✅ Register with x402scan.com after successful verification
    try {
      console.log('📡 Registering transaction with x402scan.com...');
      await registerX402Transaction({
        signature,
        chain: 'solana',
        network: 'mainnet-beta',
        from: fromAddress,
        to: expectedRecipient,
        amount: transferAmount,
        currency: 'SOL',
        resource_url: 'pardon-simulator://payment',
        payment_id: paymentId || `payment-${Date.now()}`,
        timestamp: tx.blockTime || Date.now(),
        protocol_version: '1.0',
        payment_method: 'native'
      });
      console.log('✅ Transaction registered with x402scan.com');
    } catch (regError) {
      // Don't fail payment verification if x402scan registration fails
      console.warn('⚠️ x402scan.com registration failed (non-critical):', regError);
    }

    return { valid: true };

  } catch (error: any) {
    console.error('Payment verification error:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Save message to database with thread persistence
 * Also creates User and Session if they don't exist
 */
async function saveMessageToDatabase(params: {
  threadId: string;
  sessionId: string;
  senderId: string;
  content: string;
  mentions: string[];
  isIntermediary: boolean;
  userWallet?: string; // For creating user if needed
}) {
  try {
    console.log(`💾 saveMessageToDatabase called for senderId: ${params.senderId}`);
    console.log(`   threadId: ${params.threadId}, sessionId: ${params.sessionId}`);
    
    // Wrap all database operations in retry logic
    await withRetry(async () => {
      // Find or create Thread record
      let thread = await prisma.thread.findFirst({
        where: { coralThreadId: params.threadId }
      });
      
      console.log(`💾 Thread lookup result: ${thread ? `found (id: ${thread.id})` : 'not found, will create'}`);

      if (!thread) {
        // Extract agent ID from first mention
        const agentId = params.mentions[0] || params.senderId;
        
        // Find or create session in database
        let session = await prisma.session.findFirst({
          where: { 
            OR: [
              { coralSessionId: params.sessionId },
              { id: params.sessionId }
            ]
          }
        });

        if (!session) {
          console.log(`🔧 Session not found, creating for ${params.sessionId}...`);
          
          // Need to create user first (if not exists)
          if (!params.userWallet) {
            console.warn(`⚠️ Cannot create session without userWallet`);
            return;
          }
          
          // Use upsert for user to handle race conditions
          const user = await prisma.user.upsert({
            where: { walletAddress: params.userWallet },
            update: {},
            create: {
              walletAddress: params.userWallet,
              username: `Player_${params.userWallet.slice(0, 8)}`
            }
          });
          
          console.log(`✅ User found/created: ${user.username}`);
          
          // Use upsert for session to handle race conditions and unique constraint
          const weekId = getCurrentWeekId();
          session = await prisma.session.upsert({
            where: {
              userId_weekId: {
                userId: user.id,
                weekId
              }
            },
            update: {
              // Update coralSessionId if not already set
              coralSessionId: params.sessionId
            },
            create: {
              userId: user.id,
              weekId,
              coralSessionId: params.sessionId,
              currentScore: 0
            }
          });
          
          console.log(`✅ Session found/created: ${session.id} for user ${user.username}`);
        }

        // Create thread
        thread = await prisma.thread.create({
          data: {
            sessionId: session.id,
            coralThreadId: params.threadId,
            agentId: agentId !== 'sbf' ? agentId : (params.mentions[0] || 'donald-trump')
          }
        });
        
        console.log(`✅ Created thread ${thread.id} for agent ${thread.agentId}`);
      }

      // Save message
      console.log(`💾 Creating message in database for thread ${thread.id}, sender: ${params.senderId}`);
      const savedMessage = await prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: params.senderId,
          content: params.content,
          mentions: params.mentions,
          isIntermediary: params.isIntermediary
        }
      });

      console.log(`✅ Message saved to database successfully! (id: ${savedMessage.id}, thread: ${thread.id}, sender: ${params.senderId})`);
    }, { maxRetries: 3, initialDelay: 500 });
    
  } catch (error: any) {
    console.error(`❌ Error saving message to database for sender: ${params.senderId}`);
    console.error('Error details:', error);
    console.error('Stack:', error.stack);
    console.error('Params:', JSON.stringify(params, null, 2));
    // Don't throw - message persistence is secondary, don't break chat flow
  }
}

function getCurrentWeekId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

