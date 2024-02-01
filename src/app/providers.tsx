"use client";

import { type ReactNode } from "react";
// import { ThemeProvider } from 'next-themes';
import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // <ThemeProvider
    //   attribute="class"
    //   value={{
    //     light: 'light',
    //     dark: 'dark',
    //   }}
    // >
    <SessionProvider>{children}</SessionProvider>
    // </ThemeProvider>
  );
}
