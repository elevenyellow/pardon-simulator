import'./globals.css';
import type { Metadata } from'next';
import { WalletProvider } from'@/components/WalletProvider';

export const metadata: Metadata = {
  title:'Pardon Simulator',
  description:'You are SBF - Negotiate with the Trump family using crypto to secure your presidential pardon!',
  icons: {
    icon: '/assets/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-trump-blue via-gray-900 to-black text-white min-h-screen">
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}

