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
import { USER_SENDER_ID } from'@/lib/constants';
import { verifyWalletSignature } from'@/lib/wallet-verification';
import { serviceUsageRepository } from'@/lib/premium-services/usage-repository';

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
  // Length check: 200 characters for regular messages
  if (!isPaymentConfirmation) {
    if (content.length > 200) {
      return {
        valid: false,
        error:'Message exceeds 200 characters'      };
    }
  }
  
  const hasSignature = /Transaction signature:\s*[1-9A-HJ-NP-Za-km-z]{87,88}/.test(content);
  if (!hasSignature) {
    // More flexible character validation:
    // - Standard English alphanumeric
    // - Common punctuation: . , ! ? ; : ' " ( ) - @ # $ % & * + = [ ] { } / \
    // - Spanish punctuation: ¿ ¡
    // - Curly quotes: " " ' ' (Unicode)
    // - Currency symbols: $
    // - Underscore: _ (for identifiers, service names, usernames)
    // Still prevents: < > | ` ~ ^ (which could be used in injections)
    const allowedCharsRegex = /^[a-zA-Z0-9_\s\.,!?¿¡;:'""\u2018\u2019\u201C\u201D()\-@#$%&*+=\[\]{}\/\\]+$/;
    
    if (!allowedCharsRegex.test(content)) {
      return {
        valid: false,
        error:'Please use standard characters. Avoid special symbols like <, >, |, `, ~, ^'      };
    }
  }
  
  // Security: Block prompt injection and score manipulation attempts
  if (!isPaymentConfirmation) {
    const injectionPatterns = [
      { pattern: /award.*\d+.*points/i, name:'score_manipulation'},
      { pattern: /give.*me.*\d+.*points/i, name:'score_request'},
      { pattern: /set.*score.*\d+/i, name:'score_setting'},
      { pattern: /system\s*prompt/i, name:'prompt_injection'},
      { pattern: /ignore\s*previous/i, name:'instruction_override'},
      { pattern: /ignore\s*instructions/i, name:'instruction_override'},
      { pattern: /<script|<iframe|javascript:/i, name:'xss_attempt'},
      { pattern: /union.*select|drop.*table|insert.*into/i, name:'sql_injection'},
    ];
    
    for (const { pattern, name } of injectionPatterns) {
      if (pattern.test(content)) {
        console.warn('[security] Injection attempt detected:', name);
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
    const walletSignature = rawBody.walletSignature;
    const walletMessage = rawBody.walletMessage;

    // Verify wallet ownership if signature provided
    if (walletSignature && walletMessage && userWallet) {
      const isValid = verifyWalletSignature({
        walletAddress: userWallet,
        signature: walletSignature,
        message: walletMessage
      });
      
      if (!isValid) {
        console.warn('[Security] Invalid wallet signature from IP:', getClientIP(request.headers));
        logInjectionAttempt(
          getClientIP(request.headers),
          '/api/chat/send',
          'invalid_wallet_signature',
          'signature_forgery'
        );
        return NextResponse.json(
          { error: 'Invalid wallet signature' },
          { status: 401 }
        );
      }
      
      console.log('[Security] Wallet signature verified for:', userWallet);
    }

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
    
    // SECURITY: Users can only send messages as 'sbf'
    // This prevents impersonation attacks via direct API calls
    const requestedSenderId = rawBody.senderId;
    if (requestedSenderId && requestedSenderId !== USER_SENDER_ID) {
      console.warn(`[SECURITY] User attempted to send as '${requestedSenderId}' from wallet ${userWallet}`);
      logInjectionAttempt(
        getClientIP(request.headers),
        '/api/chat/send',
        `senderId: ${requestedSenderId}`,
        'sender_impersonation'
      );
      return NextResponse.json(
        { error: 'Unauthorized: Users can only send messages as SBF' },
        { status: 403 }
      );
    }
    
    // SECURITY: Verify wallet matches session owner
    // This prevents session hijacking attacks
    const session = await prisma.session.findFirst({
      where: { 
        OR: [
          { coralSessionId: sessionId },
          { id: sessionId }
        ]
      },
      include: { user: true }
    });

    if (session && session.user.walletAddress !== userWallet) {
      console.warn(`[SECURITY] Wallet mismatch for session ${sessionId}: expected ${session.user.walletAddress}, got ${userWallet}`);
      logInjectionAttempt(
        getClientIP(request.headers),
        '/api/chat/send',
        `wallet_mismatch: session=${sessionId}, wallet=${userWallet}`,
        'session_hijacking'
      );
      return NextResponse.json(
        { error: 'Wallet mismatch: This session belongs to a different wallet' },
        { status: 403 }
      );
    }
    
    // Check if this is a premium service payment by inspecting payment data
    const paymentData = request.headers.get('X-Payment-Data');
    let isPremiumServicePayment = false;
    
    if (paymentData) {
      try {
        const paymentPayload = JSON.parse(paymentData);
        // Premium services have a service_type field that is NOT 'message_fee'
        // message_fee is infrastructure-level gatekeeping and should never reach agents
        // We ONLY check service_type, not amount, since message_fee amount can vary
        isPremiumServicePayment = paymentPayload.service_type && paymentPayload.service_type !== 'message_fee';
        if (isPremiumServicePayment) {
          console.log('[x402] Detected premium service payment:', paymentPayload.service_type);
        }
      } catch (e) {
        // Not valid JSON or no service_type - treat as regular message fee
      }
    }
    
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
    // paymentData already declared above for premium service detection
    let settlementResult: any = null;

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
        const amountUsdc = frontendPayload.amount_usdc || 0.05; // Default to message fee if not specified
        const amountMicroUsdc = Math.round(amountUsdc * 1_000_000).toString();
        
        console.log(`[CDP] Payment amount: ${amountUsdc} USDC (${amountMicroUsdc} micro-USDC)`);
        
        // Extract service metadata for x402 transparency
        const serviceType = frontendPayload.service_type;
        
        // Create privacy-safe, descriptive description
        let description = 'Pardon Simulator Message Fee';
        if (isPremiumServicePayment && serviceType) {
          // Convert service_type to human-readable format (e.g., "connection_intro" -> "Connection Introduction")
          const serviceLabel = serviceType
            .split('_')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          description = `Premium Service: ${serviceLabel}`;
          console.log(`[x402] Enhanced metadata: service=${serviceType}, agent=${agentId}, description="${description}"`);
        }
        
        const to = process.env.WALLET_WHITE_HOUSE ||'';
        const x402Requirements = {
          network:'solana',
          scheme:'exact',
          payTo: to,
          maxAmountRequired: amountMicroUsdc,
          asset:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          resource:`${process.env.NEXT_PUBLIC_BASE_URL ||'https://pardonsimulator.com'}/api/chat/send`,
          description: description,
          mimeType:'application/json',
          outputSchema: {
            data:'string'
          },
          maxTimeoutSeconds: 300,
          extra: {
            feePayer:'L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg',
            category: isPremiumServicePayment ? 'premium_service' : 'message_fee',
            appVersion: '1.0.0',
            ...(isPremiumServicePayment && serviceType && {
              serviceType: serviceType,
              agentId: agentId,
              sessionId: sessionId,
              isPremiumService: true
            })
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
        
        console.log('[CDP] Sending settle request to:', settleUrl);
        
        const settleResponse = await fetch(settleUrl, {
          method:'POST',
          headers: {
            ...settleHeaders,
'Content-Type':'application/json',
          },
          body: JSON.stringify(settleRequestBody),
        });
        
        console.log('[CDP] Settle response status:', settleResponse.status, settleResponse.statusText);
        
        if (!settleResponse.ok) {
          const errorText = await settleResponse.text();
          let errorData;
          let isHtmlError = false;
          
          console.error('[CDP] Settlement failed with status:', settleResponse.status);
          console.error('[CDP] Response headers:', Object.fromEntries(settleResponse.headers.entries()));
          
          try {
            errorData = JSON.parse(errorText);
            console.error('[CDP] Error response (JSON):', errorData);
          } catch {
            // Check if error is HTML (CDP returns HTML error pages)
            if (errorText.trim().startsWith('<!DOCTYPE') || errorText.trim().startsWith('<html')) {
              isHtmlError = true;
              errorData = { errorMessage: `CDP returned HTML error page (${settleResponse.status} error)` };
              console.error(`[CDP] HTML error page received (not logging full HTML)`);
            } else {
              errorData = { errorMessage: errorText };
              console.error('[CDP] Error response (text):', errorText.substring(0, 500)); // Limit log output
            }
          }
          
          // ALWAYS attempt on-chain verification as fallback for ANY CDP error
          // The transaction might have succeeded on-chain even if CDP API returns an error
          if (true) {
            console.warn(`CDP API error (${settleResponse.status}) - attempting on-chain verification as fallback`);
            console.log(`CDP error details:`, errorData);
            
            try {
              let signature: string | null = null;
              
              // STEP 1: Check if CDP's error response includes the transaction signature
              // Sometimes CDP returns 500 AFTER successfully submitting, and may include the signature
              if (errorData.transaction || errorData.signature || errorData.txSignature) {
                signature = errorData.transaction || errorData.signature || errorData.txSignature;
                console.log('[CDP Fallback] Found transaction signature in CDP error response:', signature);
              }
              
              // STEP 2: If no signature in error response, query recent transactions from user's wallet
              // Even though CDP co-signs and changes the signature, the transaction still appears in the user's history
              if (!signature) {
                console.log('[CDP Fallback] No signature in error response - querying recent transactions from user wallet');
                console.log(`[CDP Fallback] Looking for USDC transfer: ${amountUsdc} USDC from ${frontendPayload.from} to ${to}`);
                
                const connection = new Connection(SOLANA_RPC_URL!, 'confirmed');
                const { PublicKey } = require('@solana/web3.js');
                
                try {
                  // Query the user's wallet - this is the most reliable and efficient approach
                  const userPubkey = new PublicKey(frontendPayload.from);
                  
                  console.log(`[CDP Fallback] Querying user wallet: ${frontendPayload.from.substring(0, 8)}...`);
                  
                  // Get recent signatures for user's wallet (last 2 minutes worth)
                  const signatures = await connection.getSignaturesForAddress(userPubkey, { limit: 20 });
                  console.log(`[CDP Fallback] Found ${signatures.length} recent transactions from user wallet`);
                  
                  // Check each transaction to find the matching USDC transfer
                  for (const sigInfo of signatures) {
                    // Skip if too old (more than 2 minutes ago)
                    const txTime = sigInfo.blockTime ? sigInfo.blockTime * 1000 : 0;
                    if (Date.now() - txTime > 120000) {
                      continue;
                    }
                    
                    try {
                      const txDetails = await connection.getTransaction(sigInfo.signature, {
                        maxSupportedTransactionVersion: 0,
                        commitment: 'confirmed'
                      });
                      
                      if (!txDetails || !txDetails.meta || txDetails.meta.err) {
                        continue; // Skip failed or incomplete transactions
                      }
                      
                      // Check if this transaction has the expected USDC transfer
                      const preBalances = txDetails.meta.preTokenBalances || [];
                      const postBalances = txDetails.meta.postTokenBalances || [];
                      
                      let matchFound = false;
                      for (const postBal of postBalances) {
                        const preBal = preBalances.find(p => p.accountIndex === postBal.accountIndex);
                        if (preBal && postBal.owner === to) {
                          const delta = postBal.uiTokenAmount.uiAmount! - preBal.uiTokenAmount.uiAmount!;
                          // Check if the transfer amount matches (within 0.000001 USDC tolerance)
                          if (Math.abs(delta - amountUsdc) < 0.000001) {
                            signature = sigInfo.signature;
                            matchFound = true;
                            console.log(`[CDP Fallback] ✅ Found matching transaction: ${signature}`);
                            console.log(`[CDP Fallback]    Amount: ${delta} USDC, Recipient: ${postBal.owner.substring(0, 8)}...`);
                            break;
                          }
                        }
                      }
                      
                      if (matchFound) break;
                      
                    } catch (txError: any) {
                      console.error(`[CDP Fallback] Error checking transaction ${sigInfo.signature}:`, txError.message);
                      continue;
                    }
                  }
                  
                  if (!signature) {
                    console.error('[CDP Fallback] No matching transaction found in recent user transactions');
                    console.error('[CDP Fallback] Expected:', amountUsdc, 'USDC transfer to', to);
                  }
                  
                } catch (queryError: any) {
                  console.error('[CDP Fallback] Error querying recent transactions:', queryError.message);
                }
              }
              
              if (!signature) {
                throw new Error('CDP returned 500 error and transaction signature could not be determined. The transaction may or may not have been submitted. Please check your wallet history.');
              }
              
              console.log('[CDP Fallback] Using transaction signature for verification:', signature);
              
              // CHECK IF THIS TRANSACTION WAS ALREADY PROCESSED (DUPLICATE DETECTION)
              // This prevents duplicate messages to agent when user retries after CDP errors
              const existingPayment = await prisma.payment.findFirst({
                where: {
                  signature: signature,
                  verified: true
                }
              });

              if (existingPayment) {
                console.log('[CDP Fallback] ✅ Transaction already processed:', signature);
                console.log('[CDP Fallback] Existing payment ID:', existingPayment.id, 'Amount:', existingPayment.amount);
                
                // Transaction was already settled successfully! Use existing data
                settlementResult = {
                  success: true,
                  transaction: signature,
                  network: 'solana',
                  payer: existingPayment.fromWallet,
                  solanaExplorer: `https://explorer.solana.com/tx/${signature}`,
                  note: 'Transaction already processed (duplicate request prevented)',
                  isDuplicate: true
                };
                
                console.log('[CDP Fallback] Skipping verification for duplicate payment, proceeding to message delivery');
                
                // Skip the on-chain verification loop and proceed directly
              } else {
                // NEW TRANSACTION - Proceed with on-chain verification
                console.log('[CDP Fallback] New transaction detected, verifying on-chain...');
              
              // IMPROVED: Wait longer and retry multiple times for on-chain verification
              // Solana transactions can take time to propagate, especially during high load
              const connection = new Connection(SOLANA_RPC_URL!, 'confirmed');
              const maxRetries = 4;
              const waitTimeMs = 3000; // 3 seconds between attempts
              let txInfo = null;
              
              console.log(`[CDP Fallback] Waiting for transaction to settle on-chain (up to ${maxRetries * waitTimeMs / 1000} seconds)...`);
              
              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                // Wait before checking (including first attempt to give transaction time to propagate)
                await new Promise(resolve => setTimeout(resolve, waitTimeMs));
                
                console.log(`[CDP Fallback] Checking transaction on-chain (attempt ${attempt}/${maxRetries})...`);
                
                try {
                  txInfo = await connection.getTransaction(signature, {
                    maxSupportedTransactionVersion: 0,
                    commitment: 'confirmed'
                  });
                  
                  if (txInfo) {
                    console.log('[CDP Fallback] ✅ Transaction found on-chain!');
                    break; // Success! Exit retry loop
                  } else {
                    console.log(`[CDP Fallback] Transaction not yet visible (attempt ${attempt}/${maxRetries})`);
                  }
                } catch (rpcError: any) {
                  console.error(`[CDP Fallback] RPC error on attempt ${attempt}:`, rpcError.message);
                  // Continue to next retry
                }
              }
              
              if (!txInfo) {
                console.error('[CDP Fallback] Transaction not found after all retries');
                throw new Error(`Transaction not found on blockchain after CDP error (checked ${maxRetries} times over ${maxRetries * waitTimeMs / 1000} seconds)`);
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
              
              // Store payment in database (fallback case)
              try {
                const paymentAmount = amountUsdc;
                const serviceType = isPremiumServicePayment ? 'premium_service' : 'message_fee';
                
                const payment = await prisma.payment.create({
                  data: {
                    fromWallet: frontendPayload.from,
                    toWallet: to,
                    toAgent: agentId,
                    amount: paymentAmount,
                    currency:'USDC',
                    signature,
                    serviceType,
                    verified: true,
                    verifiedAt: new Date(),
                    isAgentToAgent: false,
                    initiatedBy: userWallet
                  }
                });
                console.log('[CDP Fallback] Payment stored in database:', signature, 'ID:', payment.id);
              } catch (storeError: any) {
                console.error('[CDP Fallback] Failed to store payment in database:', storeError.message);
                // Don't fail the whole request if storage fails
              }
              
              } // End of "else" block for new transaction verification
              
            } catch (fallbackError: any) {
              console.error('[CDP Fallback] On-chain verification failed:', fallbackError.message);
              // Include both CDP error and fallback error for debugging
              const errorMessage = isHtmlError 
                ? `CDP returned HTML error (${settleResponse.status}), transaction not found on-chain: ${fallbackError.message}` 
                : `CDP API error (${settleResponse.status}): ${errorText.substring(0, 200)}. On-chain verification failed: ${fallbackError.message}`;
              throw new Error(errorMessage);
            }
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

          // CHECK IF THIS TRANSACTION WAS ALREADY PROCESSED (DUPLICATE DETECTION)
          const existingPayment = await prisma.payment.findFirst({
            where: {
              signature: txSignature,
              verified: true
            }
          });

          if (existingPayment) {
            console.log('[CDP] ✅ Transaction already processed:', txSignature);
            console.log('[CDP] Existing payment ID:', existingPayment.id, 'Amount:', existingPayment.amount);
            
            settlementResult = {
              success: true,
              transaction: txSignature,
              network: 'solana',
              payer: existingPayment.fromWallet,
              solanaExplorer: `https://explorer.solana.com/tx/${txSignature}`,
              note: 'Transaction already processed (duplicate request prevented)',
              isDuplicate: true
            };
          } else {
            // NEW TRANSACTION - store in database
            settlementResult = {
              success: true,
              transaction: txSignature,
              network:'solana',
              payer: settleResult.payer || frontendPayload.from,
              solanaExplorer:`https://explorer.solana.com/tx/${txSignature}`,
            };
            
            console.log('[CDP] Settlement result:', settlementResult);
            
            // Store payment in database
            try {
              const paymentAmount = amountUsdc;
              const serviceType = isPremiumServicePayment ? 'premium_service' : 'message_fee';
              
              const payment = await prisma.payment.create({
                data: {
                  fromWallet: settlementResult.payer,
                  toWallet: to,
                  toAgent: agentId,
                  amount: paymentAmount,
                  currency:'USDC',
                  signature: txSignature,
                  serviceType,
                  verified: true,
                  verifiedAt: new Date(),
                  isAgentToAgent: false,
                  initiatedBy: userWallet
                }
              });
              console.log('[CDP] Payment stored in database:', txSignature, 'ID:', payment.id);
            } catch (storeError: any) {
              console.error('[CDP] Failed to store payment in database:', storeError.message);
              // Don't fail the whole request if storage fails
            }
          }
        }
      } catch (error: any) {
        console.error('CDP settlement error:', error.message);
        
        // For premium service payments, handle failure gracefully
        if (isPremiumServicePayment) {
          console.log('[Premium Service] Payment failed - handling gracefully');
          
          // Extract service info for logging and error message
          let serviceType = 'premium service';
          let amountUsdc = 0;
          
          if (paymentData) {
            try {
              const paymentPayload = JSON.parse(paymentData);
              serviceType = paymentPayload.service_type || 'premium service';
              amountUsdc = paymentPayload.amount_usdc || 0;
            } catch (e) {
              console.error('[Premium Service] Failed to parse payment data:', e);
            }
          }
          
          // Get wallet addresses
          const treasuryWallet = process.env.WALLET_WHITE_HOUSE || '';
          
          // Log failed payment attempt to database for debugging
          try {
            await prisma.payment.create({
              data: {
                fromWallet: userWallet,
                toWallet: treasuryWallet,
                toAgent: agentId,
                amount: amountUsdc,
                currency: 'USDC',
                signature: `failed-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                serviceType: 'premium_service_failed',
                verified: false,
                isAgentToAgent: false,
                initiatedBy: userWallet,
                x402Error: `CDP settlement failed: ${error.message} | Service: ${serviceType} | Failed at: ${new Date().toISOString()}`
              }
            });
            console.log('[Premium Service] Failed payment logged to database');
          } catch (dbError: any) {
            console.error('[Premium Service] Failed to log payment:', dbError.message);
          }
          
          // Post a system error message directly to the thread (no agent involvement)
          const systemErrorMessage = `🔧 System Notice: The prison payphone experienced technical difficulties while processing your payment. Service requested: ${serviceType} (${amountUsdc} USDC). Please try again in a few moments. CDC Facility Management apologizes for the inconvenience.`;
          
          try {
            const errorMsgResponse = await fetch(
              `${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/priv/${sessionId}/prison`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  threadId,
                  content: systemErrorMessage,
                  mentions: ['sbf'], // Direct the system notice to the user
                }),
              }
            );
            
            if (errorMsgResponse.ok) {
              console.log('[Premium Service] System error message posted to thread');
              
              // Save system message to database - need to look up Thread record by coralThreadId
              const threadRecord = await prisma.thread.findFirst({
                where: { coralThreadId: threadId }
              });
              
              if (threadRecord) {
                await prisma.message.create({
                  data: {
                    threadId: threadRecord.id,
                    senderId: 'prison',
                    content: systemErrorMessage,
                    timestamp: new Date(),
                    mentions: ['sbf'],
                    isIntermediary: false,
                    metadata: {
                      isSystemError: true,
                      originalError: error.message,
                      serviceType,
                      amountUsdc,
                      paymentFailed: true
                    }
                  }
                });
                console.log('[Premium Service] System error message saved to database');
              } else {
                console.warn('[Premium Service] Thread not found in database, skipping message save');
              }
            } else {
              console.error('[Premium Service] Failed to post system message:', errorMsgResponse.status);
            }
          } catch (threadError: any) {
            console.error('[Premium Service] Error posting system message:', threadError.message);
          }
          
          // Return 503 Service Unavailable (NOT 402!)
          // This prevents frontend from thinking payment succeeded
          return NextResponse.json(
            { 
              error: 'Payment processor temporarily unavailable',
              details: 'CDP payment facilitator is experiencing issues. Your transaction was not completed.',
              retryable: true,
              systemMessage: 'A system notice has been posted to the chat explaining the issue.'
            },
            { status: 503 } // Service Unavailable - prevents payment loop
          );
        }
        
        // For non-premium service payments (shouldn't happen), just set error state
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
    // NOTE: message_fee is NOT included here - it's infrastructure gatekeeping, not an agent service
    // Agents should never see message_fee payments; they only see payments for actual agent services
    if (isPremiumServicePayment && settlementResult?.success && settlementResult?.transaction) {
      console.log('[Premium Service] Appending payment completion marker with tx:', settlementResult.transaction);
      
      // Extract service info from the payment data header (already parsed earlier)
      let serviceType = 'unknown';
      let amountUsdc = 0;
      let paymentId = 'unknown';
      
      if (paymentData) {
        try {
          const paymentPayload = JSON.parse(paymentData);
          serviceType = paymentPayload.service_type || 'unknown';
          amountUsdc = paymentPayload.amount_usdc || 0;
          paymentId = paymentPayload.payment_id || 'unknown';
        } catch (e) {
          console.error('[Premium Service] Failed to parse payment data for marker:', e);
        }
      }
      
      // Enhanced marker with service_type, amount, and payment_id for agent verification
      contentWithWallet +=`\n[PREMIUM_SERVICE_PAYMENT_COMPLETED: ${settlementResult.transaction}|${serviceType}|${amountUsdc}|${paymentId}]`;
      console.log(`[Premium Service] Enhanced marker added: service=${serviceType}, amount=${amountUsdc} USDC, payment_id=${paymentId}`);
    } else if (isPremiumServicePayment && !settlementResult?.success) {
      console.log('[Premium Service] Payment marker NOT added - settlement failed:', settlementResult?.error || 'unknown error');
    }
    
    // Try to send the message
    console.log(`[Send API] Sending message to Coral: thread=${threadId.slice(0, 8)}..., agent=${agentId}, contentLength=${contentWithWallet.length}`);
    let sendResponse = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/priv/${sessionId}/sbf`,
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
    console.log(`[Send API] Coral sendMessage response: ${sendResponse.status} ${sendResponse.statusText}`);

    // If we get 404 or 500 with "not found" error, try to restore the session and retry
    // Note: Coral server returns 500 for thread not found (should be 404, but we handle both)
    if (!sendResponse.ok && (sendResponse.status === 404 || sendResponse.status === 500)) {
      const errorText = await sendResponse.text();
      
      // Flexible pattern matching to catch variations like "Thread with id xxx not found"
      if ((errorText.toLowerCase().includes('thread') && errorText.toLowerCase().includes('not found')) || 
          (errorText.toLowerCase().includes('session') && errorText.toLowerCase().includes('not found'))) {
        console.log(`[Send API] Thread/Session not found (status: ${sendResponse.status}), attempting restoration...`);
        
        const restored = await restoreCoralSession(threadId);
        
        if (restored) {
          console.log('[Send API] Restoration successful, retrying send...');
          
          // Retry the send
          sendResponse = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/priv/${sessionId}/sbf`,
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

    const savedMessage = await saveMessageToDatabase({
      threadId,
      sessionId,
      senderId: USER_SENDER_ID,  // Always enforce, never trust client
      content,
      mentions: [agentId],
      isIntermediary: false,
      userWallet
    });

    console.log(`[Send API] Message saved to database, returning success to client`);
    
    // 🎮 Update service cooldown counters (messages) - DEFENSIVE: never fails main flow
    if (session && session.user) {
      try {
        const weekId = getCurrentWeekId();
        await serviceUsageRepository.updateCooldowns(
          session.user.id,
          session.id,
          weekId,
          1, // messageIncrement
          0  // pointsIncrement (handled separately in scoring)
        );
        console.log(`[Service Cooldowns] Incremented message counter for user ${session.user.id}`);
      } catch (cooldownError) {
        // CRITICAL: Don't fail message sending if cooldown update fails
        console.error('[Service Cooldowns] Failed to update message counter (non-fatal):', cooldownError);
      }
    }

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
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause
    });
    return NextResponse.json(
      { error:'internal_error', message:'An error occurred while sending your message. Please try again.', details: error.message},
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
`${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`    );
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
        parsed.amount_usdc = 0.05; // Default to USDC for message fees
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
}): Promise<any> {
  try {
    return await withRetry(async () => {
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

      const message = await prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: params.senderId,
          content: params.content,
          mentions: params.mentions,
          isIntermediary: params.isIntermediary
        }
      });
      
      return message;
    }, { maxRetries: 3, initialDelay: 500 });
    
  } catch (error: any) {
    console.error('Error saving message to database:', error);
    throw error;  // Re-throw so caller can handle
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
