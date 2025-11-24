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
    // Validate public key format
    const publicKey = new PublicKey(data.walletAddress);
    
    // Decode message and signature
    const messageBytes = new TextEncoder().encode(data.message);
    const signatureBytes = bs58.decode(data.signature);
    
    // Verify Ed25519 signature
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
    
    if (!isValid) {
      console.warn('[Wallet Verification] Invalid signature');
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

