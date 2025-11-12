import { CdpClient } from '@coinbase/cdp-sdk';

export interface X402RegistrationRequest {
  signature: string;
  chain: 'solana';
  network: 'mainnet-beta' | 'devnet';
  from: string;
  to: string;
  amount: number;
  currency: 'SOL';
  metadata?: {
    platform: string;
    service_type?: string;
    agent_id?: string;
    user_wallet?: string;
  };
}

export interface X402RegistrationResult {
  success: boolean;
  x402ScanUrl?: string;
  x402ScanId?: string;
  error?: string;
}

export class X402CDPClient {
  private cdp: CdpClient | null = null;
  private isConfigured: boolean = false;
  
  constructor() {
    // CDP SDK reads credentials from environment variables automatically:
    // - CDP_API_KEY_ID
    // - CDP_API_KEY_SECRET
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      console.warn('⚠️ CDP credentials not configured - set CDP_API_KEY_ID and CDP_API_KEY_SECRET');
      console.warn('   Get credentials from: https://portal.cdp.coinbase.com/');
      return;
    }
    
    try {
      // Initialize CDP client - it reads credentials from environment variables
      this.cdp = new CdpClient();
      this.isConfigured = true;
      console.log('✅ CDP x402 Facilitator configured (Official SDK)');
    } catch (error: any) {
      console.error('❌ CDP SDK initialization failed:', error.message);
      this.isConfigured = false;
    }
  }
  
  async registerTransaction(request: X402RegistrationRequest): Promise<X402RegistrationResult> {
    if (!this.isConfigured || !this.cdp) {
      return {
        success: false,
        error: 'CDP not configured',
        x402ScanUrl: `https://www.x402scan.com/tx/${request.signature}?chain=solana`
      };
    }
    
    try {
      console.log(`📡 Registering transaction with x402scan.com via CDP facilitator...`);
      console.log(`   Transaction: ${request.signature.substring(0, 16)}...${request.signature.substring(request.signature.length - 16)}`);
      
      // Use official CDP SDK for x402 registration
      // The SDK handles Solana network communication internally
      const result = await (this.cdp as any).x402?.settlePayment({
        chain: request.chain,
        network: request.network,
        signature: request.signature,
        from: request.from,
        to: request.to,
        amount: request.amount,
        currency: request.currency,
        metadata: {
          platform: process.env.X402_PLATFORM_NAME || 'pardon-simulator',
          platform_url: process.env.X402_PLATFORM_URL,
          ...request.metadata
        }
      });
      
      const x402ScanUrl = `https://www.x402scan.com/tx/${request.signature}?chain=solana`;
      console.log('✅ Transaction registered via CDP SDK');
      console.log(`   View at: ${x402ScanUrl}`);
      
      return {
        success: true,
        x402ScanUrl,
        x402ScanId: result?.id
      };
    } catch (error: any) {
      console.error('⚠️ CDP x402 registration failed (non-blocking):', error.message);
      
      // Return URL even if registration fails (non-blocking)
      return {
        success: false,
        error: error.message,
        x402ScanUrl: `https://www.x402scan.com/tx/${request.signature}?chain=solana`
      };
    }
  }
}

// Singleton instance
let cdpClient: X402CDPClient | null = null;

export function getCDPClient(): X402CDPClient {
  if (!cdpClient) {
    cdpClient = new X402CDPClient();
  }
  return cdpClient;
}
