/**
 * API Client for Coral Server Communication
 * All frontend communication goes through Next.js API routes
 */

export interface SendMessageRequest {
  sessionId: string;
  threadId: string;
  content: string;
  agentId: string;
  paymentSignature?: string;  // Included when retrying after payment
  userWallet?: string;  // User's wallet address for message persistence
  walletSignature?: string;  // Wallet signature for verification
  walletMessage?: string;  // Original signed message for verification
}

export interface SendMessageOptions {
  paymentPayload?: unknown;
  logContext?: Record<string, any>;
}

export interface SendMessageResponse {
  success: boolean;
  messages: CoralMessage[];
  paymentRequired?: PaymentRequest;
  paymentSettlement?: {
    transaction?: string;
    network?: string;
    payer?: string;
    settled?: boolean;
    solanaExplorer?: string;
  };
  error?: string;
}

export interface PaymentRequest {
  type:'x402_payment_required';
  http_status: 402;  //  HTTP 402 Payment Required (x402 protocol)
  recipient: string;
  recipient_address: string;
  amount_sol: number;
  amount_usdc?: number;  // USDC amount (optional, fallback to amount_sol)
  reason: string;
  service_type?: string;
  payment_id: string;
  blockchain: string;
  network: string;
  timestamp: number;
}

export interface CoralMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  mentions?: string[];  // Agent IDs mentioned in this message
}

export interface CreateSessionResponse {
  sessionId: string;
}

export interface CreateThreadResponse {
  threadId: string;
}

export interface VerifyPaymentRequest {
  signature: string;
  expectedRecipient: string;
  expectedAmount: number;
}

export interface VerifyPaymentResponse {
  valid: boolean;
  signature?: string;
  from?: string;
  to?: string;
  amount?: number;
  timestamp?: number;
  error?: string;
}

/**
 * API Client Class
 * Provides typed methods for all backend communication
 */
class APIClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Use provided baseUrl or default to relative path for browser
    // In tests, pass full URL like 'http://localhost:3000/api'
    this.baseUrl = baseUrl || (typeof window !== 'undefined' ? '/api' : 'http://localhost:3000/api');
  }

  /**
   * Create a new session
   * 
   * @param userWallet - Optional wallet address for consistent pool assignment in production
   */
  async createSession(userWallet?: string): Promise<CreateSessionResponse> {
    const body = userWallet ? JSON.stringify({ userWallet }) : undefined;
    
    const response = await fetch(`${this.baseUrl}/chat/session`, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body,
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new thread
   * Retries if agent is not ready (503)
   */
  async createThread(sessionId: string, agentId: string, userWallet?: string, retries: number = 5, delayMs: number = 2000): Promise<CreateThreadResponse> {
    // Get signature from localStorage if userWallet is provided
    let signatureData = null;
    if (userWallet && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`wallet_verification_${userWallet}`);
      if (stored) {
        try {
          signatureData = JSON.parse(stored);
        } catch (e) {
          console.warn('[API Client] Failed to parse stored signature');
        }
      }
    }
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      const response = await fetch(`${this.baseUrl}/chat/thread`, {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
          sessionId, 
          agentId, 
          userWallet,
          walletSignature: signatureData?.signature,
          walletMessage: signatureData?.message
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[API Client] Thread created', {
          sessionId,
          agentId,
          threadId: data.threadId || data.id,
        });
        return data;
      }

      // If agent not ready (503), retry after delay
      if (response.status === 503) {
        const errorData = await response.json();
        console.warn(`[Thread Creation] Attempt ${attempt}/${retries}: ${errorData.message}`);
        
        if (attempt < retries) {
          console.log(`[Thread Creation] Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }

      // For other errors, throw immediately
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to create thread: ${errorText}`);
    }

    throw new Error(`Failed to create thread after ${retries} attempts: Agent not ready`);
  }

  /**
   * Send message to agent
   * Returns 402 if payment required
   */
  async sendMessage(
    request: SendMessageRequest,
    options?: SendMessageOptions
  ): Promise<SendMessageResponse> {
    console.log('API Client: Sending message to', request.agentId, options?.logContext || '');
    
    // Get signature from localStorage if userWallet is provided
    if (request.userWallet && typeof window !== 'undefined' && !request.walletSignature) {
      const stored = localStorage.getItem(`wallet_verification_${request.userWallet}`);
      if (stored) {
        try {
          const signatureData = JSON.parse(stored);
          request.walletSignature = signatureData.signature;
          request.walletMessage = signatureData.message;
        } catch (e) {
          console.warn('[API Client] Failed to parse stored signature');
        }
      }
    }
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.paymentPayload) {
      headers['X-PAYMENT'] = JSON.stringify(options.paymentPayload);
    }

    const response = await fetch(`${this.baseUrl}/chat/send`, {
      method:'POST',
      headers,
      body: JSON.stringify(request),
    });

    console.log('API Client: Response status:', response.status);

    const data = await response.json();

    // Check for HTTP 402 Payment Required (x402 protocol)
    if (response.status === 402) {
      console.log('[x402] HTTP 402 Payment Required detected');
      console.log('x402 Headers:', {
'WWW-Authenticate': response.headers.get('WWW-Authenticate'),
'X-Payment-Address': response.headers.get('X-Payment-Address'),
'X-Payment-Amount': response.headers.get('X-Payment-Amount'),
'X-Payment-Currency': response.headers.get('X-Payment-Currency'),
'X-Payment-Blockchain': response.headers.get('X-Payment-Blockchain'),
'X-Payment-Network': response.headers.get('X-Payment-Network'),
'X-Payment-Id': response.headers.get('X-Payment-Id'),
      });
      console.log('Payment details:', data.payment);
      
      // Backend sends PaymentRequest with: recipient_address, amount_usdc/amount_sol, payment_id, service_type
      const backendPayment = data.payment;
      const paymentRequest: PaymentRequest = {
        type: backendPayment.type || 'x402_payment_required',
        http_status: 402,
        recipient: backendPayment.recipient || 'treasury',
        recipient_address: backendPayment.recipient_address,
        amount_sol: backendPayment.amount_sol || 0,
        amount_usdc: backendPayment.amount_usdc || 0,
        reason: backendPayment.reason || 'Premium service',
        service_type: backendPayment.service_type || 'premium_service',
        payment_id: backendPayment.payment_id,
        blockchain: 'solana',
        network: 'mainnet-beta',
        timestamp: backendPayment.timestamp || Date.now(),
      };
      
      return {
        success: false,
        messages: data.messages || [],
        paymentRequired: paymentRequest,
        error: 'payment_required',
      };
    }

    console.log('Normal response (200 OK)');

    if (!response.ok) {
      console.error('Error response:', response.status, data);
      throw new Error(data.error ||`Failed to send message: ${response.statusText}`);
    }

    let paymentSettlement: SendMessageResponse['paymentSettlement'];
    const paymentResponseHeader = response.headers.get('X-PAYMENT-RESPONSE');
    if (paymentResponseHeader) {
      try {
        paymentSettlement = JSON.parse(paymentResponseHeader);
      } catch (err) {
        console.warn('[API Client] Failed to parse X-PAYMENT-RESPONSE header:', err);
      }
    }

    return {
      success: true,
      messages: data.messages || [],
      paymentSettlement,
    };
  }

  /**
   * Get message history for a thread
   */
  async getMessages(sessionId: string, threadId: string): Promise<CoralMessage[]> {
    const response = await fetch(
`${this.baseUrl}/chat/messages?sessionId=${sessionId}&threadId=${threadId}`    );

    if (!response.ok) {
      // 410 Gone = session no longer exists or thread/session mismatch
      if (response.status === 410) {
        const data = await response.json();
        const error: any = new Error(data.message || 'Session/thread mismatch');
        // Use the specific error code from backend if available
        error.code = data.error?.toUpperCase() || 'SESSION_NOT_FOUND';
        error.status = 410;
        throw error;
      }
      throw new Error(`Failed to get messages: ${response.statusText}`);
    }

    const data = await response.json();
    return data.messages || [];
  }

  /**
   * Verify a payment transaction on Solana blockchain
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    const response = await fetch(`${this.baseUrl}/payments/verify`, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok && response.status !== 400) {
      throw new Error(`Verification failed: ${response.statusText}`);
    }

    return data;
  }
}

// Export singleton instance (for browser use)
export const apiClient = new APIClient();

// Export class for tests (allows custom baseUrl)
export { APIClient };

