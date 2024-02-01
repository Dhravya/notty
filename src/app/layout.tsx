import '@/styles/globals.css';

import { Inter } from 'next/font/google';
import Providers from './providers';
import { type Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const title =
  'Notty - a simple, minimal, AI powered note taking app and markdown editor';
const description =
  'Notty is a simple, minimal AI powered note taking app and markdown editor - Built local-first, with cloud sync. It uses AI to help you write and stay productive.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    images: [
      {
        url: '/ogimage.png',
        alt: title,
      },
    ]
  },
  twitter: {
    title,
    description,
    card: 'summary_large_image',
    creator: '@dhravyashah',
  },
  metadataBase: new URL('https://notty.dhr.wtf/'),
  icons: ['/logo.png'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`font-sans ${inter.variable}`}>
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
