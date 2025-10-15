'use client'

import { useEffect } from 'react'

export default function ThemeInitializer() {
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme-preference');

            // Dynamically import darkreader only on the client side
            import('darkreader').then(({ enable, disable, auto }) => {
                if (savedTheme === 'dark') {
                    enable({
                        sepia: 10,
                    });
                } else if (savedTheme === 'light') {
                    disable();
                } else {
                    auto({
                        sepia: 10,
                    });
                }
            });
        }
    }, []); // Empty dependency array - only run once on mount

    return null; // This component doesn't render anything
}

