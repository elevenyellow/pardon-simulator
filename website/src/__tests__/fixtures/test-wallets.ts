/**
 * Test Wallet Configuration
 * Test wallet addresses and keys for automated testing
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Test wallet private key (from env or generate)
 */
export function getTestWalletPrivateKey(): string {
  return process.env.TEST_WALLET_PRIVATE_KEY || 
         process.env.NEXT_PUBLIC_TEST_WALLET_PRIVATE_KEY ||
         '';
}

/**
 * Generate a deterministic test wallet from a seed
 */
export function generateTestWallet(seed?: string): { publicKey: string; privateKey: string } {
  let keypair: Keypair;
  
  if (seed) {
    // Generate deterministic keypair from seed
    const seedBuffer = Buffer.from(seed.padEnd(32, '0').slice(0, 32));
    keypair = Keypair.fromSeed(seedBuffer);
  } else {
    // Use env var or generate random
    const privateKey = getTestWalletPrivateKey();
    if (privateKey) {
      const decoded = bs58.decode(privateKey);
      keypair = Keypair.fromSecretKey(decoded);
    } else {
      keypair = Keypair.generate();
    }
  }
  
  return {
    publicKey: keypair.publicKey.toString(),
    privateKey: bs58.encode(keypair.secretKey),
  };
}

/**
 * Known test wallets for specific scenarios
 */
export const TEST_WALLETS = {
  // Primary test wallet
  main: generateTestWallet('test-wallet-main-001'),
  
  // Secondary wallets for multi-user scenarios
  user1: generateTestWallet('test-wallet-user-001'),
  user2: generateTestWallet('test-wallet-user-002'),
  user3: generateTestWallet('test-wallet-user-003'),
  
  // Agent wallets (for reference, actual values from .env)
  agents: {
    donald: process.env.WALLET_DONALD_TRUMP || '',
    melania: process.env.WALLET_MELANIA_TRUMP || '',
    eric: process.env.WALLET_ERIC_TRUMP || '',
    donjr: process.env.WALLET_DONJR_TRUMP || '',
    barron: process.env.WALLET_BARRON_TRUMP || '',
    cz: process.env.WALLET_CZ || '',
    whiteHouse: process.env.WALLET_WHITE_HOUSE || '',
  },
};

/**
 * Get test wallet for current test
 */
export function getCurrentTestWallet(): { publicKey: string; privateKey: string } {
  const privateKey = getTestWalletPrivateKey();
  
  if (privateKey) {
    const decoded = bs58.decode(privateKey);
    const keypair = Keypair.fromSecretKey(decoded);
    return {
      publicKey: keypair.publicKey.toString(),
      privateKey,
    };
  }
  
  // Return main test wallet
  return TEST_WALLETS.main;
}

