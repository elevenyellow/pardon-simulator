/**
 * Test Wallet Key Manager
 * 
 * Provides programmatic Solana wallet for automated testing.
 * Uses a test keypair from environment variable or generates one for tests.
 */

import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export class TestWallet {
  private keypair: Keypair;
  public publicKey: PublicKey;
  public connected: boolean = true;

  constructor(privateKey?: string) {
    if (privateKey) {
      // Load from private key (base58 encoded)
      try {
        const decoded = bs58.decode(privateKey);
        this.keypair = Keypair.fromSecretKey(decoded);
        console.log('[TEST_WALLET] Loaded test wallet from private key');
      } catch (error) {
        console.error('[TEST_WALLET] Failed to load private key, generating new one:', error);
        this.keypair = Keypair.generate();
      }
    } else {
      // Generate new keypair for testing
      this.keypair = Keypair.generate();
      console.log('[TEST_WALLET] Generated new test wallet');
    }

    this.publicKey = this.keypair.publicKey;
    console.log('[TEST_WALLET] Public key:', this.publicKey.toString());
  }

  /**
   * Sign a transaction (for testing)
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    console.log('[TEST_WALLET] Signing transaction');
    
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([this.keypair]);
      return transaction;
    } else {
      transaction.partialSign(this.keypair);
      return transaction;
    }
  }

  /**
   * Sign multiple transactions
   */
  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    console.log(`[TEST_WALLET] Signing ${transactions.length} transactions`);
    return Promise.all(
      transactions.map(tx => this.signTransaction(tx))
    );
  }

  /**
   * Get the secret key (for debugging/testing only)
   */
  getSecretKey(): Uint8Array {
    return this.keypair.secretKey;
  }

  /**
   * Get the private key as base58 string
   */
  getPrivateKeyBase58(): string {
    return bs58.encode(this.keypair.secretKey);
  }

  /**
   * Simulate wallet connection
   */
  async connect(): Promise<void> {
    console.log('[TEST_WALLET] Connecting wallet');
    this.connected = true;
  }

  /**
   * Simulate wallet disconnection
   */
  async disconnect(): Promise<void> {
    console.log('[TEST_WALLET] Disconnecting wallet');
    this.connected = false;
  }
}

/**
 * Get or create test wallet instance
 */
let testWalletInstance: TestWallet | null = null;

export function getTestWallet(): TestWallet {
  if (!testWalletInstance) {
    const privateKey = process.env.TEST_WALLET_PRIVATE_KEY || process.env.NEXT_PUBLIC_TEST_WALLET_PRIVATE_KEY;
    testWalletInstance = new TestWallet(privateKey);
  }
  return testWalletInstance;
}

/**
 * Reset test wallet (for test isolation)
 */
export function resetTestWallet(): void {
  testWalletInstance = null;
}

/**
 * Export test wallet details for assertions
 */
export interface TestWalletInfo {
  publicKey: string;
  connected: boolean;
}

export function getTestWalletInfo(): TestWalletInfo {
  const wallet = getTestWallet();
  return {
    publicKey: wallet.publicKey.toString(),
    connected: wallet.connected,
  };
}

