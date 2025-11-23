/**
 * Mock Wallet Adapter for Testing
 * 
 * Replaces the real Solana wallet adapter with a mock that:
 * - Auto-approves all transactions
 * - Uses test keypair for signing
 * - No UI prompts needed
 */

'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { Connection, PublicKey, Transaction, VersionedTransaction, SendOptions } from '@solana/web3.js';
import { TestWallet, getTestWallet } from './test-wallet';

// Mock wallet adapter types to match @solana/wallet-adapter-react
export interface MockWalletContextState {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  wallet: any;
  signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(transactions: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: SendOptions
  ) => Promise<string>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  select: (walletName: string) => void;
  wallets: any[];
}

const MockWalletContext = createContext<MockWalletContextState | undefined>(undefined);

export interface MockWalletProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

/**
 * Mock Wallet Provider
 * Drop-in replacement for WalletProvider from @solana/wallet-adapter-react
 */
export function MockWalletProvider({ children, autoConnect = true }: MockWalletProviderProps) {
  const testWallet = useMemo(() => getTestWallet(), []);

  const contextValue = useMemo<MockWalletContextState>(() => {
    return {
      publicKey: testWallet.publicKey,
      connected: testWallet.connected,
      connecting: false,
      disconnecting: false,
      wallet: {
        adapter: {
          name: 'Test Wallet',
          url: 'https://test.wallet',
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzAwZmYwMCIvPjwvc3ZnPg==',
          publicKey: testWallet.publicKey,
          connected: testWallet.connected,
        },
      },
      
      signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
        console.log('[MOCK_WALLET] Auto-signing transaction');
        return testWallet.signTransaction(transaction);
      },
      
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => {
        console.log(`[MOCK_WALLET] Auto-signing ${transactions.length} transactions`);
        return testWallet.signAllTransactions(transactions);
      },
      
      signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
        console.log('[MOCK_WALLET] Signing message');
        // For testing, just return the message signed with keypair
        // In real scenario, this would use nacl.sign.detached
        return message;
      },
      
      sendTransaction: async (
        transaction: Transaction | VersionedTransaction,
        connection: Connection,
        options?: SendOptions
      ): Promise<string> => {
        console.log('[MOCK_WALLET] Sending transaction');
        
        // Sign the transaction
        const signedTx = await testWallet.signTransaction(transaction);
        
        // Send to network
        if (signedTx instanceof VersionedTransaction) {
          return await connection.sendTransaction(signedTx, options);
        } else {
          return await connection.sendRawTransaction(signedTx.serialize(), options);
        }
      },
      
      connect: async () => {
        console.log('[MOCK_WALLET] Connecting');
        await testWallet.connect();
      },
      
      disconnect: async () => {
        console.log('[MOCK_WALLET] Disconnecting');
        await testWallet.disconnect();
      },
      
      select: (walletName: string) => {
        console.log(`[MOCK_WALLET] Selected wallet: ${walletName}`);
      },
      
      wallets: [{
        adapter: {
          name: 'Test Wallet',
          url: 'https://test.wallet',
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzAwZmYwMCIvPjwvc3ZnPg==',
          publicKey: testWallet.publicKey,
          connected: testWallet.connected,
          connect: async () => {},
          disconnect: async () => {},
          sendTransaction: async () => '',
        },
        readyState: 'Installed',
      }],
    };
  }, [testWallet]);

  // Auto-connect on mount if specified
  React.useEffect(() => {
    if (autoConnect && !testWallet.connected) {
      testWallet.connect();
    }
  }, [autoConnect, testWallet]);

  return (
    <MockWalletContext.Provider value={contextValue}>
      {children}
    </MockWalletContext.Provider>
  );
}

/**
 * Mock useWallet hook
 * Drop-in replacement for useWallet from @solana/wallet-adapter-react
 */
export function useMockWallet(): MockWalletContextState {
  const context = useContext(MockWalletContext);
  if (!context) {
    throw new Error('useMockWallet must be used within MockWalletProvider');
  }
  return context;
}

/**
 * Mock useConnection hook
 * Returns a connection to the test RPC endpoint
 */
export function useMockConnection() {
  const connection = useMemo(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    return new Connection(rpcUrl, 'confirmed');
  }, []);

  return { connection };
}

/**
 * Helper to wrap test components with mock wallet
 */
export function withMockWallet<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return function WithMockWalletComponent(props: P) {
    return (
      <MockWalletProvider>
        <Component {...props} />
      </MockWalletProvider>
    );
  };
}

