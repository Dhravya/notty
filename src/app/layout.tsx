"use client";

import "@/styles/globals.css";

import { Inter } from "next/font/google";
import Providers from "./providers";
import { NotesViewer } from "./drawer";
import NewNoteButton from "@/components/NewNoteButton";
import Script from "next/script";
import dynamic from 'next/dynamic'

const DarkModeSwitch = dynamic(() => import('@/components/DarkModeSwitch'), { ssr: false })

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          async
          defer
          data-website-id="cbf1706f-88f5-4acc-90fc-31a0724c50eb"
          src="https://u.dhr.wtf/script.js"
        ></Script>
        <title>Notty</title>
        <meta
          name="description"
          content="Notty is a simple, minimal AI powered note taking app and markdown editor - Built local-first, with cloud sync. It uses AI to help you write and stay productive."
        />
        <meta name="application-name" content="Notty" />

        <meta property="og:title" content="Notty" />
        <meta
          property="og:description"
          content="Notty is a simple, minimal AI powered note taking app and markdown editor - Built local-first, with cloud sync. It uses AI to help you write and stay productive."
        />
        <meta property="og:image" content="/ogimage.png" />
        <meta property="og:image:alt" content="Notty" />

        <meta name="twitter:title" content="Notty" />
        <meta
          name="twitter:description"
          content="Notty is a simple, minimal AI powered note taking app and markdown editor - Built local-first, with cloud sync. It uses AI to help you write and stay productive."
        />
        <meta name="twitter:image" content="/ogimage.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:creator" content="@dhravyashah" />

        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#54CFDF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Notty"></meta>
      </head>
      <body className={`font-sans ${inter.variable}`}>
        <Providers>
          <NewNoteButton />
          <div className="fixed bottom-5 right-5 z-20 flex gap-4 md:top-5 bg-white max-h-fit rounded-lg">
            <DarkModeSwitch />
            <NotesViewer />
          </div>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
