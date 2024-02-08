"use client";

import { type ReactNode } from "react";
// import { ThemeProvider } from 'next-themes';
import { SessionProvider } from "next-auth/react";
import { NotesProvider } from "@/lib/context/NotesContext";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // <ThemeProvider
    //   attribute="class"
    //   value={{
    //     light: 'light-theme',
    //     dark: 'dark-theme',
    //   }}
    // >
      <SessionProvider>
        <NotesProvider>
          {children}
        </NotesProvider>
      </SessionProvider>
    // </ThemeProvider>
  );
}
