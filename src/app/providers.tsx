'use client';

import { type ReactNode } from 'react';
// import { ThemeProvider } from 'next-themes';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // <ThemeProvider
    //   attribute="class"
    //   value={{
    //     light: 'light',
    //     dark: 'dark',
    //   }}
    // >
    <>
    {children}
    </>
    // </ThemeProvider>
  );
}
