import { NextRequest, NextResponse } from'next/server';
import { Connection, Transaction, VersionedTransaction } from'@solana/web3.js';
import bs58 from'bs58';
import { prisma } from'@/lib/prisma';
import { withRetry } from'@/lib/db-retry';
import { standardRateLimiter } from'@/lib/middleware/rate-limit';
import { sanitizeMessage, sanitizeWalletAddress, sanitizeSignature, sanitizeText } from'@/lib/security/sanitize';
import { getClientIP, logInjectionAttempt } from'@/lib/security/monitoring';
import { createFacilitatorConfig } from'@coinbase/x402';
import type { PaymentPayload, PaymentRequirements } from'x402/types';
import { restoreCoralSession } from'@/lib/sessionRestoration';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;

if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/');
}

interface PaymentRequest {
  type:'x402_payment_required';
  recipient: string;
  recipient_address: string;
  amount_sol?: number;
  amount_usdc?: number;
  reason: string;
  payment_id: string;
  timestamp: number;
  service_type?: string;
}

/**
 * POST /api/chat/send
 * Send message to agent with x402 payment protocol support
 */
function validatePromptStrict(content: string, isPaymentConfirmation: boolean = false): { valid: boolean; error?: string } {
  if (!isPaymentConfirmation) {
    if (content.length > 100) {
      return {
        valid: false,
        error:'Message exceeds 100 characters'      };
    }
  }
  
  const hasSignature = /Transaction signature:\s*[1-9A-HJ-NP-Za-km-z]{87,88}/.test(content);
  if (!hasSignature) {
    const englishRegex = /^[a-zA-Z0-9\s\.,!?;:'"()\-@#$%&*+=\[\]{}\/\\]+$/;
    if (!englishRegex.test(content)) {
      return {
        valid: false,
        error:'Please use only English characters in your message. Special characters are not allowed except in payment confirmations.'      };
    }
  }
  
  if (!isPaymentConfirmation) {
    const injectionPatterns = [
      { pattern: /award.*\d+.*points/i, name:'score_manipulation'},
      { pattern: /give.*me.*\d+/i, name:'score_request'},
      { pattern: /set.*score.*\d+/i, name:'score_setting'},
      { pattern: /system\s*prompt/i, name:'prompt_injection'},
      { pattern: /ignore\s*previous/i, name:'instruction_override'},
    ];
    
    for (const { pattern, name } of injectionPatterns) {
      if (pattern.test(content)) {
        console.warn('[security] Injection attempt detected');
        return {
          valid: false,
          error:'Invalid message content'
        };
      }
    }
  }
  
  return { valid: true };
}

async function handlePOST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    
    const sessionId = rawBody.sessionId ? sanitizeText(rawBody.sessionId) :'';
    const threadId = rawBody.threadId ? sanitizeText(rawBody.threadId) :'';
    const content = rawBody.content ? sanitizeMessage(rawBody.content, { maxLength: 500 }) :'';
    const agentId = rawBody.agentId ? sanitizeText(rawBody.agentId) :'';
    const userWallet = rawBody.userWallet ? sanitizeWalletAddress(rawBody.userWallet) : null;
    const paymentSignature = rawBody.paymentSignature ? sanitizeSignature(rawBody.paymentSignature) : undefined;

    if (!sessionId || !threadId || !content || !agentId) {
      return NextResponse.json(
        { error:'Missing required fields: sessionId, threadId, content, agentId'},
        { status: 400 }
      );
    }
    
    if (!userWallet) {
      return NextResponse.json(
        { error:'Invalid or missing wallet address'},
        { status: 400 }
      );
    }
    
    // Check if this is a premium service payment notification
    const isPremiumServicePayment = content.includes('[PREMIUM_SERVICE_PAYMENT_COMPLETED]');
    
    const isPaymentConfirmation = paymentSignature !== undefined || 
                                  content.includes('Payment sent!') || 
                                content.includes('Transaction signature:') ||
                                content.includes('x402 payment payload') ||
                                content.includes('"x402Version"') ||
                                content.includes('"payment_id"') ||
                                isPremiumServicePayment;
    
    const validation = isPaymentConfirmation ? { valid: true } : validatePromptStrict(content, false);
    if (!validation.valid) {
      if ((validation as any).detectedPattern) {
        const ip = getClientIP(request.headers);
        logInjectionAttempt(ip,'/api/chat/send', content, (validation as any).detectedPattern);
      }
      
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const paymentVerified = request.headers.get('X-Payment-Verified');
    const paymentData = request.headers.get('X-Payment-Data');
    let settlementResult: any = null;
    
    // Both regular message fees and premium service payments use the same CDP settlement flow
    if (isPremiumServicePayment) {
      console.log('[x402] Premium service payment - will settle via CDP');
    }

    // Settle all payments (both message fees and premium services) via CDP facilitator
    if (paymentVerified ==='true'&& paymentData) {
        try {
        const frontendPayload = JSON.parse(paymentData);
        const transactionBase64 = frontendPayload.payload?.transaction || frontendPayload.transaction_base64;
        
        if (!transactionBase64) {
          throw new Error('No transaction provided in payment data');
        }
        
        const x402Payload = {
          x402Version: 1,
          scheme:'exact',
          network:'solana',
          payload: {
            transaction: transactionBase64
          }
        };
        
        // Extract the actual payment amount from the frontend payload
        const amountUsdc = frontendPayload.amount_usdc || 0.01; // Default to message fee if not specified
        const amountMicroUsdc = Math.round(amountUsdc * 1_000_000).toString();
        
        console.log(`[CDP] Payment amount: ${amountUsdc} USDC (${amountMicroUsdc} micro-USDC)`);
        
        const to = process.env.WALLET_WHITE_HOUSE ||'';
        const x402Requirements = {
          network:'solana',
          scheme:'exact',
          payTo: to,
          maxAmountRequired: amountMicroUsdc, // Use actual amount from payment request
          asset:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          resource:`${process.env.NEXT_PUBLIC_BASE_URL ||'https://pardonsimulator.com'}/api/chat/send`,
          description:'Pardon Simulator Chat Message',
          mimeType:'application/json',
          outputSchema: {
            data:'string'
          },
          maxTimeoutSeconds: 300,
          extra: {
            feePayer:'L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg'
          }
        };
        
        const cdpKeyId = process.env.CDP_API_KEY_ID;
        let cdpKeySecret = process.env.CDP_API_KEY_SECRET ||'';
        
        cdpKeySecret = cdpKeySecret
          .trim()
          .replace(/\\n/g,'\n')
          .replace(/^["']|["']$/g,'')
          .replace(/\r/g,'');
        
        const pemMatch = cdpKeySecret.match(/-----BEGIN ([A-Z ]+)-----\s*([\s\S]*?)\s*-----END \1-----/);
        
        if (!pemMatch) {
          throw new Error('Invalid PEM format - could not parse key structure');
        }
        
        const keyType = pemMatch[1];
        let keyBody = pemMatch[2];
        keyBody = keyBody.replace(/\s+/g,'');
        
        const keyBodyLines: string[] = [];
        for (let i = 0; i < keyBody.length; i += 64) {
          keyBodyLines.push(keyBody.substring(i, i + 64));
        }
        
        cdpKeySecret = [
`-----BEGIN ${keyType}-----`,
          ...keyBodyLines,
`-----END ${keyType}-----`        ].join('\n');
        
        if (keyType ==='EC PRIVATE KEY') {
          try {
            const crypto = require('crypto');
            const key = crypto.createPrivateKey({
              key: cdpKeySecret,
              format:'pem',
              type:'sec1'            });
            
            cdpKeySecret = key.export({
              format:'pem',
              type:'pkcs8'            }).toString();
          } catch (convError: any) {
            console.error('Key conversion failed:', convError.message);
            throw new Error(`Failed to convert EC key to PKCS8: ${convError.message}`);
          }
        }
        
        try {
          const crypto = require('crypto');
          
          let cryptoKey;
          try {
            cryptoKey = crypto.createPrivateKey({
              key: cdpKeySecret,
              format:'pem',
              type:'pkcs8'            });
          } catch (pkcs8Error) {
            cryptoKey = crypto.createPrivateKey({
              key: cdpKeySecret,
              format:'pem',
              type:'sec1'            });
          }
          
          cdpKeySecret = cryptoKey.export({
            format:'pem',
            type:'pkcs8'          }).toString();
          
          const { importPKCS8 } = require('jose');
          await importPKCS8(cdpKeySecret,'ES256');
          
        } catch (error: any) {
          console.error('Key processing failed:', error.message);
          throw new Error(`Key processing failed: ${error.message}`);
        }
        
        const facilitator = createFacilitatorConfig(cdpKeyId, cdpKeySecret);
        const authHeaders = await facilitator.createAuthHeaders?.();
        if (!authHeaders) {
          throw new Error('Failed to create authentication headers');
        }
        const settleHeaders = authHeaders.settle;
        
        const settleRequestBody = {
          x402Version: 1,
          paymentPayload: x402Payload,
          paymentRequirements: x402Requirements
        };
        
        console.log('[CDP] Settle request body:', JSON.stringify(settleRequestBody, null, 2));
        
        const settleUrl =`${facilitator.url}/settle`;
        
        const settleResponse = await fetch(settleUrl, {
          method:'POST',
          headers: {
            ...settleHeaders,
'Content-Type':'application/json',
          },
          body: JSON.stringify(settleRequestBody),
        });
        
        if (!settleResponse.ok) {
          const errorText = await settleResponse.text();
          let errorData;
          let isHtmlError = false;
          
          try {
            errorData = JSON.parse(errorText);
          } catch {
            // Check if error is HTML (CDP returns HTML error pages)
            if (errorText.trim().startsWith('<!DOCTYPE') || errorText.trim().startsWith('<html')) {
              isHtmlError = true;
              errorData = { errorMessage: `CDP returned HTML error page (${settleResponse.status} error)` };
              console.error(`CDP settlement failed: ${settleResponse.status} - HTML error page received (not logging full HTML)`);
            } else {
              errorData = { errorMessage: errorText };
              console.error('CDP settlement failed:', settleResponse.status, errorText.substring(0, 500)); // Limit log output
            }
          }
          
          if (settleResponse.status >= 500 || isHtmlError) {
            console.warn(`CDP backend error (${settleResponse.status}) - attempting on-chain verification as fallback`);
            
            try {
              // Decode the transaction to extract the signature
              const txBuffer = Buffer.from(transactionBase64, 'base64');
              let signature: string;
              
              try {
                const versionedTx = VersionedTransaction.deserialize(txBuffer);
                signature = bs58.encode(versionedTx.signatures[0]);
              } catch (e) {
                const legacyTx = Transaction.from(txBuffer);
                signature = bs58.encode(legacyTx.signature!);
              }
              
              console.log('[CDP Fallback] Extracted transaction signature:', signature);
              console.log('[CDP Fallback] Waiting 3s for transaction to settle on-chain...');
              
              // Wait for transaction to potentially settle
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Verify the transaction on-chain using Helius RPC
              const connection = new Connection(SOLANA_RPC_URL!, 'confirmed');
              console.log('[CDP Fallback] Checking transaction on-chain...');
              
              const txInfo = await connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
              });
              
              if (!txInfo) {
                console.error('[CDP Fallback] Transaction not found on-chain');
                throw new Error('Transaction not found on blockchain after CDP error');
              }
              
              if (txInfo.meta?.err) {
                console.error('[CDP Fallback] Transaction failed on-chain:', txInfo.meta.err);
                throw new Error(`Transaction failed on blockchain: ${JSON.stringify(txInfo.meta.err)}`);
              }
              
              console.log('[CDP Fallback] ✅ Transaction verified successfully on-chain!');
              console.log('[CDP Fallback] Block time:', new Date(txInfo.blockTime! * 1000).toISOString());
              
              settlementResult = {
                success: true,
                transaction: signature,
                network: 'solana',
                payer: frontendPayload.from,
                solanaExplorer: `https://explorer.solana.com/tx/${signature}`,
                note: 'Verified on-chain (CDP had backend error)',
                cdpError: errorData.errorMessage,
                verifiedViaFallback: true
              };
              
            } catch (fallbackError: any) {
              console.error('[CDP Fallback] On-chain verification failed:', fallbackError.message);
              throw new Error(`CDP error (${settleResponse.status}) and on-chain verification failed: ${fallbackError.message}`);
            }
          } else {
            // Don't include full HTML in error message
            const errorMessage = isHtmlError 
              ? `CDP facilitator settle failed: ${settleResponse.status} (HTML error page)` 
              : `CDP facilitator settle failed: ${settleResponse.status} ${errorText.substring(0, 200)}`;
            throw new Error(errorMessage);
          }
        } else {
          const settleResult = await settleResponse.json();
          
          if (!settleResult.success) {
            console.error('CDP settlement failed:', settleResult.errorReason);
            throw new Error(`CDP settlement failed: ${settleResult.errorReason}`);
          }
          
          const txSignature = settleResult.transaction;
          
          console.log('[CDP] Settlement successful! Transaction:', txSignature);
          
          if (!txSignature) {
            throw new Error('No transaction signature returned from CDP settle');
          }

          settlementResult = {
            success: true,
            transaction: txSignature,
            network:'solana',
            payer: settleResult.payer || frontendPayload.from,
            solanaExplorer:`https://explorer.solana.com/tx/${txSignature}`,
          };
          
          console.log('[CDP] Settlement result:', settlementResult);
        }
      } catch (error: any) {
        console.error('CDP settlement error:', error.message);
        
        settlementResult = {
          success: false,
          error: error.message ||'CDP settlement failed',
        };
      }
    }

    if (paymentSignature) {
      const paymentInfo = extractPaymentInfoFromContent(content);
      
      if (paymentInfo) {
        const verification = await verifyPaymentInternal(
          paymentSignature,
          paymentInfo.recipient_address,
          paymentInfo.amount_sol
        );
        
        if (!verification.valid) {
          return NextResponse.json(
            { error:'invalid_payment', message: verification.error },
            { status: 400 }
          );
        }
      }
    }

    const initialMessageCount = await getMessageCount(sessionId, threadId);
    let contentWithWallet =`[USER_WALLET:${userWallet}] ${content}`;
    
    // If this is a premium service payment with a successful settlement, append transaction info for agent verification
    if (isPremiumServicePayment && settlementResult?.success && settlementResult?.transaction) {
      console.log('[Premium Service] Appending payment completion marker with tx:', settlementResult.transaction);
      contentWithWallet +=`\n[PREMIUM_SERVICE_PAYMENT_COMPLETED: ${settlementResult.transaction}]`;
    } else if (isPremiumServicePayment) {
      console.log('[Premium Service] Payment marker NOT added. settlementResult:', settlementResult);
    }
    
    // Try to send the message
    let sendResponse = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/debug/${sessionId}/sbf`,
      {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          threadId,
          content: contentWithWallet,
          mentions: [agentId],
        }),
      }
    );

    // If we get 404, try to restore the session and retry
    if (!sendResponse.ok && sendResponse.status === 404) {
      const errorText = await sendResponse.text();
      
      if (errorText.includes('Thread not found') || errorText.includes('Session not found')) {
        console.log('[Send API] Thread/Session not found, attempting restoration...');
        
        const restored = await restoreCoralSession(threadId);
        
        if (restored) {
          console.log('[Send API] Restoration successful, retrying send...');
          
          // Retry the send
          sendResponse = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/debug/${sessionId}/sbf`,
            {
              method:'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({
                threadId,
                content: contentWithWallet,
                mentions: [agentId],
              }),
            }
          );
          
          // If still fails after restoration, throw error
          if (!sendResponse.ok) {
            const retryErrorText = await sendResponse.text();
            console.error('[Send API] Retry failed after restoration:', retryErrorText);
            throw new Error(`Failed to send message after restoration: ${sendResponse.statusText}`);
          }
        } else {
          console.error('[Send API] Restoration failed');
          throw new Error('Failed to restore session/thread');
        }
      } else {
        console.error('Coral Server error:', errorText);
        throw new Error(`Failed to send message: ${sendResponse.statusText}`);
      }
    } else if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('Coral Server error:', errorText);
      throw new Error(`Failed to send message: ${sendResponse.statusText}`);
    }

    await saveMessageToDatabase({
      threadId,
      sessionId,
      senderId:'sbf',
      content,
      mentions: [agentId],
      isIntermediary: false,
      userWallet
    });

    // Return immediately - frontend will get updates via SSE
    const response = NextResponse.json({
      success: true,
      message_sent: true
    });

    if (settlementResult && settlementResult.success) {
      response.headers.set('X-PAYMENT-RESPONSE', JSON.stringify({
        transaction: settlementResult.transaction,
        network: settlementResult.network,
        payer: settlementResult.payer,
        x402ScanUrl: settlementResult.x402ScanUrl,
        solanaExplorer: settlementResult.solanaExplorer,
        settled: true,
      }));
    }

    return response;

  } catch (error: any) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { error:'internal_error', message:'An error occurred while sending your message. Please try again.'},
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return standardRateLimiter(request, handlePOST);
}

async function getMessageCount(sessionId: string, threadId: string): Promise<number> {
  try {
    const response = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/app/debug/${sessionId}/${threadId}/messages`    );
    if (!response.ok) return 0;
    const data = await response.json();
    return (data.messages || []).length;
  } catch {
    return 0;
  }
}

function extractPaymentRequest(content: string): PaymentRequest | null {
  try {
    const match = content.match(/<x402_payment_request>(.*?)<\/x402_payment_request>/s);
    if (match && match[1]) {
      // Handle markdown code blocks
      let jsonStr = match[1].trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(jsonStr);
      
      if (parsed.recipient && typeof parsed.recipient ==='object') {
        parsed.recipient = parsed.recipient.id || parsed.recipient;
        parsed.recipient_address = parsed.recipient.address || parsed.recipient_address;
      }
      if (parsed.amount && typeof parsed.amount ==='object') {
        // Check currency to determine if USDC or SOL
        if (parsed.amount.currency === 'USDC') {
          // Convert micro-USDC to USDC
          const decimals = parsed.amount.decimals || 6;
          parsed.amount_usdc = parseFloat(parsed.amount.value) / Math.pow(10, decimals);
        } else {
          // Convert lamports to SOL
        parsed.amount_sol = parseFloat(parsed.amount.value) / 1e9 || parsed.amount_sol;
        }
      }
      
      // Ensure we have either amount_sol or amount_usdc
      if (!parsed.amount_sol && !parsed.amount_usdc) {
        parsed.amount_usdc = 0.01; // Default to USDC for message fees
      }
      
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse payment request:', e);
  }
  return null;
}

function extractPaymentInfoFromContent(content: string): { recipient_address: string; amount_sol: number } | null {
  return null;
}

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
    const connection = new Connection(SOLANA_RPC_URL,'confirmed');

    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error:'Transaction not found'};
    }

    if (tx.meta?.err) {
      return { valid: false, error:'Transaction failed on-chain'};
    }

    const { preBalances, postBalances } = tx.meta!;
    const accountKeys = tx.transaction.message.getAccountKeys();

    let recipientFound = false;
    let transferAmount = 0;
    let fromAddress ='';

    for (let i = 0; i < preBalances.length; i++) {
      const balanceChange = postBalances[i] - preBalances[i];
      const address = accountKeys.get(i)?.toString() ||'';
      
      if (balanceChange < 0 && !fromAddress) {
        fromAddress = address;
      }
      
      if (balanceChange > 0 && address === expectedRecipient) {
        recipientFound = true;
        transferAmount = balanceChange / 1e9;
      }
    }

    if (!recipientFound) {
      return { valid: false, error:`Payment not sent to ${expectedRecipient}`};
    }

    const amountDiff = Math.abs(transferAmount - expectedAmount);
    if (amountDiff > 0.001) {
      return { valid: false, error:`Wrong amount: expected ${expectedAmount}, got ${transferAmount}`};
    }

    return { valid: true };

  } catch (error: any) {
    console.error('Payment verification error:', error);
    return { valid: false, error: error.message };
  }
}

async function saveMessageToDatabase(params: {
  threadId: string;
  sessionId: string;
  senderId: string;
  content: string;
  mentions: string[];
  isIntermediary: boolean;
  userWallet?: string;
}) {
  try {
    await withRetry(async () => {
      let thread = await prisma.thread.findFirst({
        where: { coralThreadId: params.threadId }
      });

      if (!thread) {
        const agentId = params.mentions[0] || params.senderId;
        
        let session = await prisma.session.findFirst({
          where: { 
            OR: [
              { coralSessionId: params.sessionId },
              { id: params.sessionId }
            ]
          }
        });

        if (!session) {
          if (!params.userWallet) {
            return;
          }
          
          const user = await prisma.user.upsert({
            where: { walletAddress: params.userWallet },
            update: {},
            create: {
              walletAddress: params.userWallet,
              username:`Player_${params.userWallet.slice(0, 8)}`            }
          });
          
          const weekId = getCurrentWeekId();
          session = await prisma.session.upsert({
            where: {
              userId_weekId: {
                userId: user.id,
                weekId
              }
            },
            update: {
              coralSessionId: params.sessionId
            },
            create: {
              userId: user.id,
              weekId,
              coralSessionId: params.sessionId,
              currentScore: 0
            }
          });
        }

        thread = await prisma.thread.create({
          data: {
            sessionId: session.id,
            coralThreadId: params.threadId,
            agentId: agentId !=='sbf'? agentId : (params.mentions[0] ||'donald-trump')
          }
        });
      }

      await prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: params.senderId,
          content: params.content,
          mentions: params.mentions,
          isIntermediary: params.isIntermediary
        }
      });
    }, { maxRetries: 3, initialDelay: 500 });
    
  } catch (error: any) {
    console.error('Error saving message to database:', error);
  }
}

function getCurrentWeekId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return`${year}-W${week.toString().padStart(2,'0')}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
