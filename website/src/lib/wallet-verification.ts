import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

export interface WalletSignatureData {
  walletAddress: string;
  signature: string;
  message: string;
}

/**
 * Verifies a Solana wallet signature to prove wallet ownership.
 * 
 * @param data - Object containing wallet address, signature, and signed message
 * @returns true if signature is valid and recent, false otherwise
 */
export function verifyWalletSignature(data: WalletSignatureData): boolean {
  try {
    console.log('[Wallet Verification] Starting verification for:', data.walletAddress);
    console.log('[Wallet Verification] Message preview:', data.message.substring(0, 100));
    console.log('[Wallet Verification] Signature length:', data.signature.length);
    
    // Validate public key format
    const publicKey = new PublicKey(data.walletAddress);
    
    // Decode message and signature
    const messageBytes = new TextEncoder().encode(data.message);
    const signatureBytes = bs58.decode(data.signature);
    
    console.log('[Wallet Verification] Message bytes length:', messageBytes.length);
    console.log('[Wallet Verification] Signature bytes length:', signatureBytes.length);
    
    // Try standard Ed25519 verification first (for software wallets)
    let isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
    
    console.log('[Wallet Verification] Standard verification result:', isValid);
    
    // If standard verification fails, try Ledger format
    // Ledger prepends "\xffsolana offchain" to messages
    if (!isValid) {
      console.log('[Wallet Verification] Trying Ledger format...');
      const LEDGER_DOMAIN_SEPARATOR = Buffer.from('\xffsolana offchain');
      const ledgerMessageBytes = new Uint8Array([
        ...LEDGER_DOMAIN_SEPARATOR,
        ...messageBytes
      ]);
      
      console.log('[Wallet Verification] Ledger message bytes length:', ledgerMessageBytes.length);
      
      isValid = nacl.sign.detached.verify(
        ledgerMessageBytes,
        signatureBytes,
        publicKey.toBytes()
      );
      
      console.log('[Wallet Verification] Ledger verification result:', isValid);
      
      if (isValid) {
        console.log('[Wallet Verification] ✓ Verified using Ledger format');
      }
    } else {
      console.log('[Wallet Verification] ✓ Verified using standard format');
    }
    
    if (!isValid) {
      console.warn('[Wallet Verification] ✗ Invalid signature - both methods failed');
      console.warn('[Wallet Verification] Message:', data.message);
      console.warn('[Wallet Verification] Signature:', data.signature);
      return false;
    }
    
    // Verify message format includes domain
    if (!data.message.includes('Domain: pardonsimulator.com')) {
      console.warn('[Wallet Verification] Message does not include correct domain');
      return false;
    }
    
    // Verify message format and timestamp freshness
    const timestampMatch = data.message.match(/Timestamp: (\d+)/);
    if (!timestampMatch) {
      console.warn('[Wallet Verification] Missing timestamp in message');
      return false;
    }
    
    const timestamp = parseInt(timestampMatch[1], 10);
    const age = Date.now() - timestamp;
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    if (age < 0) {
      console.warn('[Wallet Verification] Timestamp is in the future');
      return false;
    }
    
    if (age > MAX_AGE) {
      console.warn('[Wallet Verification] Signature expired (older than 7 days)');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[Wallet Verification] Error:', error);
    return false;
  }
}

