/**
 * x402 Payment Middleware for Solana
 * 
 * Implements HTTP 402 Payment Required protocol using Coinbase CDP facilitator
 * Protects API routes requiring payment (e.g., premium chat messages)
 * 
 * Flow:
 * 1. Intercept requests to protected routes
 * 2. Check for X-PAYMENT header
 * 3. If no payment: return 402 with payment requirements
 * 4. If payment present: verify via CDP facilitator
 * 5. If valid: pass to route handler
 * 6. If invalid: return 402 with error
 */

import { NextResponse } from'next/server';
import type { NextRequest } from'next/server';

// Payment configuration
const PAYMENT_CONFIG = {
  network:'solana',
  currency:'USDC',  // CDP supports SPL tokens via x402 exact scheme
  receivingAddress: process.env.WALLET_WHITE_HOUSE ||'',
  facilitatorUrl:'https://api.cdp.coinbase.com',  // Coinbase CDP facilitator
};

// Route pricing configuration
const ROUTE_PRICING: Record<string, number> = {
'/api/chat/send': 1.00, // $1.00 USDC per message
};

/**
 * Check if payment is required for this route
 */
function requiresPayment(pathname: string): boolean {
  return pathname in ROUTE_PRICING;
}

/**
 * Get payment amount for route
 */
function getPaymentAmount(pathname: string, request?: NextRequest): number {
  const baseAmount = ROUTE_PRICING[pathname] || 0;
  
  // TODO: Make dynamic based on request body (e.g., premium messages cost more)
  // For now, return base amount
  return baseAmount;
}

/**
 * Create HTTP 402 Payment Required response
 */
function create402Response(amount: number, paymentId: string): NextResponse {
  const response = NextResponse.json(
    {
      error:'Payment Required',
      message:'This endpoint requires payment to access',
      payment: {
        type: 'x402_payment_required',
        recipient: 'white-house-treasury',
        recipient_address: PAYMENT_CONFIG.receivingAddress,
        amount_usdc: amount,
        amount_sol: 0,
        reason: 'Message sending fee',
        service_type: 'message_fee',
        payment_id: paymentId,
        timestamp: Date.now(),
      }
    },
    { status: 402 }
  );

  // Add x402 protocol headers
  response.headers.set('WWW-Authenticate','Bearer realm="x402"');
  response.headers.set('X-Payment-Required','true');
  response.headers.set('X-Payment-Protocol-Version','1.0');
  response.headers.set('X-Payment-Chain', PAYMENT_CONFIG.network);
  response.headers.set('X-Payment-Network','mainnet-beta');
  response.headers.set('X-Payment-Token', PAYMENT_CONFIG.currency);
  response.headers.set('X-Payment-Address', PAYMENT_CONFIG.receivingAddress);
  response.headers.set('X-Payment-Amount', amount.toString());
  response.headers.set('X-Payment-Currency', PAYMENT_CONFIG.currency);
  response.headers.set('X-Payment-Id', paymentId);
  response.headers.set('X-Payment-Expiry', (Date.now() + 600000).toString()); // 10 minutes

  return response;
}

/**
 * Verify payment via internal backend API (Coinbase CDP facilitator)
 */
async function verifyPayment(paymentPayload: string, amount: number, recipient: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Parse payment payload from client
    const payload = JSON.parse(paymentPayload);
    
    // Convert USDC to micro-USDC (6 decimals) as string
    const microUsdc = Math.floor(amount * 1_000_000);
    const usdcMint ='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mainnet
    
    // Call our INTERNAL backend API (which uses Coinbase CDP facilitator)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||'https://pardonsimulator.com';
    const response = await fetch(`${baseUrl}/api/x402/verify`, {
      method:'POST',
      headers: {
'Content-Type':'application/json',
      },
      body: JSON.stringify({
        payload,
        requirements: {
          network:'solana',
          scheme:'exact',
          payTo: recipient,
          maxAmountRequired: microUsdc.toString(),
          asset: usdcMint,
          resource:'pardon-simulator://api_access',
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[x402] Verification failed:', error);
      return { valid: false, error:'Payment verification failed'};
    }

    const result = await response.json();
    return { valid: result.valid || false, error: result.error };
  } catch (error) {
    console.error('Payment verification error:', error);
    return { valid: false, error:'Payment verification error'};
  }
}

/**
 * x402 Payment Middleware
 */
export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    // Check if this route requires payment
    if (!requiresPayment(pathname)) {
      return NextResponse.next();
    }

    // Check for X-PAYMENT header
    const paymentHeader = request.headers.get('X-PAYMENT');

    if (!paymentHeader) {
      // No payment provided - return 402
      const amount = getPaymentAmount(pathname, request);
      const paymentId =`payment-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      console.log(`[x402] Payment required for ${pathname}: ${amount} ${PAYMENT_CONFIG.currency}`);
      return create402Response(amount, paymentId);
    }

  // Payment provided - verify it
  console.log(`[x402] Verifying payment for ${pathname}`);
  const amount = getPaymentAmount(pathname, request);
  const verification = await verifyPayment(
    paymentHeader,
    amount,
    PAYMENT_CONFIG.receivingAddress
  );

  if (!verification.valid) {
    // Invalid payment - return 402 again
    const paymentId =`payment-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    console.log(`[x402] Payment verification failed: ${verification.error}`);
    const response = create402Response(amount, paymentId);
    response.headers.set('X-Payment-Error', verification.error ||'Invalid payment');
    return response;
  }

  // Payment valid - pass to route handler
  console.log(`[x402] Payment verified successfully for ${pathname}`);
  
  // Add payment info to request headers for route handler to use for settlement
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Payment-Verified','true');
  requestHeaders.set('X-Payment-Data', paymentHeader);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  } catch (error: any) {
    console.error('[x402 Middleware] Error:', error);
    console.error('[x402 Middleware] Stack:', error.stack);
    // Return 500 on middleware error
    return NextResponse.json(
      { error: 'internal_error', message: 'Middleware error: ' + error.message },
      { status: 500 }
    );
  }
}

// Configure which routes the middleware applies to
export const config = {
  matcher: [
'/api/chat/send',
    // Add more protected routes here
  ],
};
