'use client';

import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { 
  PhantomWalletAdapter, 
  SolflareWalletAdapter,
  // Additional Solana wallets you can enable:
  // CoinbaseWalletAdapter,
  // TrustWalletAdapter,
  // LedgerWalletAdapter,
  // TorusWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export const WalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // Using mainnet-beta - REAL SOL with actual value!
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  // ⚠️ IMPORTANT: Only Solana wallets here!
  // MetaMask is for Ethereum, NOT Solana - don't add it!
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      // Add more Solana wallets here if needed
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        {/* 
          WalletModalProvider auto-detects browser extensions.
          To prevent non-Solana wallets from appearing, users should
          uninstall MetaMask or other Ethereum wallets, OR we can
          customize the modal UI to filter them out.
        */}
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};

