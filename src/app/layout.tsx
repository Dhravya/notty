import '@/styles/globals.css';

import { Inter } from 'next/font/google';
import Providers from './providers';
import { Viewport, type Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const title = 'Notty';
const description =
  'Notty is a simple, minimal AI powered note taking app and markdown editor - Built local-first, with cloud sync. It uses AI to help you write and stay productive.';

export const metadata: Metadata = {
  applicationName: 'Notty',
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
    ],
  },
  twitter: {
    title,
    description,
    card: 'summary_large_image',
    creator: '@dhravyashah',
  },
  metadataBase: new URL('https://notty.dhr.wtf/'),
  icons: ['/logo.png'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title,
  },
};

export const viewport: Viewport = {
  themeColor: '#54CFDF',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          async
          defer
          data-website-id="cbf1706f-88f5-4acc-90fc-31a0724c50eb"
          src="https://u.dhr.wtf/umami.js"
        ></script>
      </head>
      <body className={`font-sans ${inter.variable}`}>
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
