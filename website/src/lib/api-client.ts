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
}

export interface SendMessageResponse {
  success: boolean;
  messages: CoralMessage[];
  paymentRequired?: PaymentRequest;
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

  constructor() {
    this.baseUrl ='/api';
  }

  /**
   * Create a new session
   */
  async createSession(): Promise<CreateSessionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/session`, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new thread
   */
  async createThread(sessionId: string, agentId: string): Promise<CreateThreadResponse> {
    const response = await fetch(`${this.baseUrl}/chat/thread`, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ sessionId, agentId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create thread: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send message to agent
   * Returns 402 if payment required
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    console.log('API Client: Sending message to', request.agentId);
    
    const response = await fetch(`${this.baseUrl}/chat/send`, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
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

    return {
      success: true,
      messages: data.messages || [],
    };
  }

  /**
   * Get message history for a thread
   */
  async getMessages(sessionId: string, threadId: string): Promise<CoralMessage[]> {
    const response = await fetch(
`${this.baseUrl}/chat/messages?sessionId=${sessionId}&threadId=${threadId}`    );

    if (!response.ok) {
      // 410 Gone = session no longer exists (server restart)
      if (response.status === 410) {
        const data = await response.json();
        const error: any = new Error(data.message || 'Session no longer exists');
        error.code = 'SESSION_NOT_FOUND';
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

// Export singleton instance
export const apiClient = new APIClient();

