'use client'

import React, { useEffect, useState } from 'react'

import {
    enable as enableDarkMode,
    disable as disableDarkMode,
    auto as followSystemColorScheme,
    isEnabled as isDarkReaderEnabled,
} from 'darkreader';

function DarkModeSwitch() {

    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            followSystemColorScheme({
                sepia: 10,
            });
            if (isDarkReaderEnabled()) {
                setIsDark(true);
            }
        }
    }, [])

    return (
        <button
            className="flex items-center p-2 rounded-md cursor-pointer bg-slate-200 dark:text-white dark:bg-slate-700"
            onClick={() => {
                if (!isDarkReaderEnabled()) {
                    enableDarkMode({
                        sepia: 10,
                    });
                    setIsDark(true);
                } else {
                    disableDarkMode();
                    setIsDark(false);
                }
            }}
        >
            {isDark ? (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                </svg>
            ) : (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                </svg>
            )}
        </button>
    )
}

export default DarkModeSwitch