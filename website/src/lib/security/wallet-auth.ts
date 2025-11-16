/**
 * Wallet Signature Authentication
 * 
 * Implements message signing and verification for Solana wallets.
 * This ensures that API requests actually come from the wallet owner.
 */

import { PublicKey } from'@solana/web3.js';
import * as nacl from'tweetnacl';
import bs58 from'bs58';

interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
  publicKey?: string;
}

/**
 * Verify that a message was signed by the claimed wallet
 * 
 * @param message - The original message that was signed
 * @param signature - The signature (base58 encoded)
 * @param publicKey - The public key (wallet address) that should have signed
 * @returns Verification result
 */
export function verifyWalletSignature(
  message: string,
  signature: string,
  publicKey: string
): SignatureVerificationResult {
  try {
    // Decode the signature from base58
    const signatureBytes = bs58.decode(signature);
    
    // Decode the public key
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    
    // Convert message to bytes
    const messageBytes = new TextEncoder().encode(message);
    
    // Verify the signature
    const valid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
    
    if (valid) {
      return { valid: true, publicKey };
    } else {
      return { valid: false, error:'Invalid signature'};
    }
  } catch (error: any) {
    return { 
      valid: false, 
      error:`Signature verification failed: ${error.message}`    };
  }
}

/**
 * Create a message for the user to sign
 * This includes a nonce and timestamp to prevent replay attacks
 * 
 * @param action - The action being authenticated (e.g.,"send_message","update_score")
 * @param nonce - A unique nonce for this request
 * @param timestamp - Request timestamp
 * @returns Message string to sign
 */
export function createSignMessage(
  action: string,
  nonce: string,
  timestamp: number
): string {
  return`Pardon Simulator Authentication
Action: ${action}
Nonce: ${nonce}
Timestamp: ${timestamp}
Please sign this message to prove you own this wallet.`;
}

/**
 * Verify a signed authentication message
 * Checks signature validity, timestamp, and nonce
 * 
 * @param authData - Authentication data from client
 * @returns Verification result
 */
export interface AuthData {
  action: string;
  nonce: string;
  timestamp: number;
  signature: string;
  publicKey: string;
}

export function verifyAuthMessage(
  authData: AuthData,
  maxAgeSeconds: number = 300 // 5 minutes
): SignatureVerificationResult {
  try {
    // Check timestamp (prevent replay attacks with old signatures)
    const now = Date.now();
    const age = (now - authData.timestamp) / 1000;
    
    if (age > maxAgeSeconds) {
      return { 
        valid: false, 
        error:`Authentication expired (${Math.floor(age)}s old, max ${maxAgeSeconds}s)`      };
    }
    
    if (authData.timestamp > now + 60000) {
      return { 
        valid: false, 
        error:'Authentication timestamp is in the future'      };
    }
    
    // Reconstruct the message
    const message = createSignMessage(
      authData.action,
      authData.nonce,
      authData.timestamp
    );
    
    // Verify the signature
    return verifyWalletSignature(
      message,
      authData.signature,
      authData.publicKey
    );
  } catch (error: any) {
    return { 
      valid: false, 
      error:`Authentication verification failed: ${error.message}`    };
  }
}

/**
 * Nonce management for preventing replay attacks
 */
const usedNonces = new Map<string, number>();

/**
 * Check if a nonce has been used before
 * Nonces are tied to a specific wallet address
 * 
 * @param walletAddress - Wallet address
 * @param nonce - Nonce to check
 * @returns true if nonce is fresh (not used before)
 */
export function checkNonce(walletAddress: string, nonce: string): boolean {
  const key =`${walletAddress}:${nonce}`;
  
  if (usedNonces.has(key)) {
    return false; // Nonce already used
  }
  
  // Mark nonce as used
  usedNonces.set(key, Date.now());
  
  // Clean up old nonces
  cleanupOldNonces();
  
  return true;
}

/**
 * Clean up nonces older than 10 minutes
 */
function cleanupOldNonces(): void {
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  
  for (const [key, timestamp] of usedNonces.entries()) {
    if (timestamp < tenMinutesAgo) {
      usedNonces.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupOldNonces, 5 * 60 * 1000);

/**
 * Middleware helper for requiring wallet authentication
 * 
 * @param requiredAction - The action that should be authenticated
 * @returns Authentication result
 */
export function requireWalletAuth(
  authHeader: string | null,
  requiredAction: string
): SignatureVerificationResult & { authData?: AuthData } {
  if (!authHeader) {
    return { 
      valid: false, 
      error:'Missing authentication header'    };
  }
  
  try {
    // Parse auth header
    // Format: "Wallet <base64_json>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !=='Wallet') {
      return { 
        valid: false, 
        error:'Invalid authentication header format'      };
    }
    
    // Decode and parse auth data
    const authJson = Buffer.from(parts[1],'base64').toString('utf-8');
    const authData: AuthData = JSON.parse(authJson);
    
    // Verify action matches
    if (authData.action !== requiredAction) {
      return { 
        valid: false, 
        error:`Action mismatch: expected ${requiredAction}, got ${authData.action}`      };
    }
    
    // Check nonce
    if (!checkNonce(authData.publicKey, authData.nonce)) {
      return { 
        valid: false, 
        error:'Nonce already used (replay attack detected)'      };
    }
    
    // Verify signature
    const result = verifyAuthMessage(authData);
    
    return { ...result, authData };
  } catch (error: any) {
    return { 
      valid: false, 
      error:`Failed to parse authentication: ${error.message}`    };
  }
}

/**
 * Helper to create auth header for client-side use
 * (This would typically be done in the frontend, but included here for documentation)
 */
export function createAuthHeader(authData: AuthData): string {
  const authJson = JSON.stringify(authData);
  const authBase64 = Buffer.from(authJson).toString('base64');
  return`Wallet ${authBase64}`;
}

