import'./globals.css';
import type { Metadata } from'next';
import Script from 'next/script';
import { WalletProvider } from'@/components/WalletProvider';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://pardonsimulator.com'),
  title:'Pardon Simulator',
  description:'You\'re SBF. You\'re facing serious time. But there\'s a chance, a presidential pardon. The catch? You need to navigate a complex web of relationships, power dynamics, and cold hard crypto to make it happen. Good luck',
  icons: {
    icon: '/assets/favicon.png',
  },
  openGraph: {
    title: 'Pardon Simulator',
    description: 'You\'re SBF. You\'re facing serious time. But there\'s a chance, a presidential pardon. The catch? You need to navigate a complex web of relationships, power dynamics, and cold hard crypto to make it happen. Good luck',
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
    description: 'You\'re SBF. You\'re facing serious time. But there\'s a chance, a presidential pardon. The catch? You need to navigate a complex web of relationships, power dynamics, and cold hard crypto to make it happen. Good luck',
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
      <head>
        <Script
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=G-K16JJ3NFDT`}
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-K16JJ3NFDT');
            `,
          }}
        />
      </head>
      <body className="bg-gradient-to-br from-trump-blue via-gray-900 to-black text-white min-h-screen">
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}

