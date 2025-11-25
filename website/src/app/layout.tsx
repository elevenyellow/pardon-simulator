import'./globals.css';
import type { Metadata } from'next';
import { WalletProvider } from'@/components/WalletProvider';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title:'Pardon Simulator',
  description:'You are SBF - Negotiate with the Trump family using crypto to secure your presidential pardon!',
  icons: {
    icon: '/assets/favicon.png',
  },
  openGraph: {
    title: 'Pardon Simulator',
    description: 'You are SBF - Negotiate with the Trump family using crypto to secure your presidential pardon!',
    images: [
      {
        url: '/assets/cover.jpg',
        width: 1200,
        height: 630,
        alt: 'Pardon Simulator',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pardon Simulator',
    description: 'You are SBF - Negotiate with the Trump family using crypto to secure your presidential pardon!',
    images: ['/assets/cover.jpg'],
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

